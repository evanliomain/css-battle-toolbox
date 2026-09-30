/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest";

function stubChrome() {
  return {
    storage: {
      sync: { get: vi.fn(() => Promise.resolve({})) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: { getURL: (p) => `chrome-extension://test/${p}` },
  };
}

// Fake timers, so the polls a test leaves running die with it instead of
// firing once the jsdom environment is gone.
function tick(ms = 0) {
  return vi.advanceTimersByTimeAsync(ms);
}

async function navigate(path) {
  window.history.pushState({}, "", path);
  // The router polls every 300ms, and a re-mount waits 500ms more to settle.
  await tick(900);
}

/** jsdom has no `innerText`, which is what the tool reads the scores from. */
function p(text, className = "") {
  const el = document.createElement("p");
  el.className = className;
  el.innerText = text;
  return el;
}

function scoreItem(score, { dropdown = true } = {}) {
  const item = document.createElement("div");
  item.className = "submissions-list__item";
  item.append(p(score));
  if (dropdown) {
    const menu = document.createElement("div");
    menu.className = "dropdown-container dropdown-container--full-width";
    item.append(menu);
  }
  return item;
}

function topScore(author, score, code) {
  const container = document.createElement("div");
  container.className = "top-submission-container";
  const box = document.createElement("div");
  box.className = "top-submission__author";
  const link = document.createElement("a");
  link.ariaLabel = author;
  box.append(link, p(score, "top-submission__author__score"));
  container.append(box, p(code, "submissions-list__code"));
  return container;
}

/**
 * Collects what the page throws — an observer callback, say — so a test can
 * check nothing did. vitest leaves those errors to a listener of the test's own.
 */
function pageErrors() {
  const errors = [];
  const listener = (event) => {
    event.preventDefault();
    errors.push(event.error);
  };
  window.addEventListener("error", listener);
  onTestFinished(() => window.removeEventListener("error", listener));
  return errors;
}

function list() {
  return document.querySelector(".submissions-list");
}

function copyButtons(root = document) {
  return [...root.querySelectorAll(".button--copy-score")];
}

describe("score-tools", () => {
  let writeText;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal("chrome", stubChrome());
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    document.body.innerHTML = `<div class="submissions-list"></div>`;
  });

  afterEach(async () => {
    // Tear the mounts down: their observer on `body` outlives the test and
    // would decorate the next test's nodes.
    await navigate("/");
    vi.doUnmock("./utils/prettify");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete navigator.clipboard;
    // The next test's router starts from wherever this one left the URL.
    window.history.replaceState({}, "", "/play/123");
    document.body.innerHTML = "";
  });

  describe("submission scores", () => {
    it("adds a Copy button that copies the score in bold", async () => {
      const item = scoreItem("612.5");
      list().append(item);

      await import("./score-tools.js");
      await tick();

      const [button] = copyButtons(item);
      expect(button.innerText).toBe("Copy");
      // Not a submit button, so a click never submits a form around the list.
      expect(button.type).toBe("button");
      button.click();
      expect(writeText).toHaveBeenCalledWith("*612.5*");
      // The menu gives up its full width so the button fits on the same row.
      const menu = item.querySelector(".dropdown-container");
      expect(menu.classList).not.toContain("dropdown-container--full-width");
      expect(menu.style.flexGrow).toBe("1");
      expect(item.style.display).toBe("flex");
      expect(item.style.gap).toBe("1rem");
      expect(item.style.justifyContent).toBe("space-between");
      expect(item.dataset.cbtCopyScore).toBeDefined();
    });

    it("decorates submissions added later, once each", async () => {
      const errors = pageErrors();
      list().append(scoreItem("600"));
      await import("./score-tools.js");
      await tick();

      const later = scoreItem("700");
      // A text node reported first must not stop the row after it.
      list().append(document.createTextNode(" "), later);
      await tick();
      // Moving a row reports it as added again.
      list().append(later);
      list().firstElementChild.remove();
      await tick();

      expect(copyButtons()).toHaveLength(1);
      expect(copyButtons(later)).toHaveLength(1);
      expect(errors).toEqual([]);
    });

    it("leaves a row without its menu alone, and unmarked", async () => {
      const item = scoreItem("600", { dropdown: false });
      list().append(item);

      await import("./score-tools.js");
      await tick();

      expect(copyButtons()).toEqual([]);
      expect(item.dataset.cbtCopyScore).toBeUndefined();
    });

    it.each([
      ["its menu", ".dropdown-container"],
      ["its score", "p"],
    ])("still decorates the rows after one without %s", async (_, part) => {
      const broken = scoreItem("600");
      broken.querySelector(part).remove();
      const item = scoreItem("700");
      list().append(broken, item);

      await import("./score-tools.js");
      await tick();

      expect(copyButtons(broken)).toEqual([]);
      expect(copyButtons(item)).toHaveLength(1);
    });

    it("stops decorating new submissions once the page navigates away", async () => {
      list().append(scoreItem("600"));
      await import("./score-tools.js");
      await tick();

      await navigate("/");
      const item = scoreItem("600");
      list().append(item);
      await tick();

      expect(copyButtons()).toEqual([]);
    });

    it("removes its buttons on navigation and adds them back once on return", async () => {
      const item = scoreItem("600");
      list().append(item);
      await import("./score-tools.js");
      await tick();

      await navigate("/");
      expect(copyButtons()).toEqual([]);
      expect(item.dataset.cbtCopyScore).toBeUndefined();

      await navigate("/play/123");
      expect(copyButtons(item)).toHaveLength(1);
    });
  });

  describe("top solution", () => {
    const CODE = "<div></div><style>div{color:red}</style>";

    it("adds a Copy button that copies the author, score and formatted code", async () => {
      const { prettify } = await import("./utils/prettify");
      const top = topScore("alice", "999", CODE);
      document.body.append(top);

      await import("./score-tools.js");
      await tick(100);

      const [button] = copyButtons(
        top.querySelector(".top-submission__author"),
      );
      button.click();
      expect(writeText).toHaveBeenCalledWith(
        `*Top solution by alice: 999*\n\`\`\`${await prettify(CODE)}\`\`\``,
      );
    });

    it("decorates a top solution rendered later anywhere in the page", async () => {
      const errors = pageErrors();
      await import("./score-tools.js");
      await tick();
      document.body.append(topScore("alice", "999", CODE));
      await tick(100);

      // Inside a wrapper, the observer looks below the added node.
      const wrapper = document.createElement("section");
      const top = topScore("bob", "998", CODE);
      wrapper.append(top);
      // A text node reported first must not stop the wrapper after it.
      document.body.append(document.createTextNode(" "), wrapper);
      await tick(100);
      // Moving it reports it as added again.
      document.body.append(wrapper);
      await tick(100);

      expect(copyButtons(top)).toHaveLength(1);
      expect(errors).toEqual([]);
    });

    it("decorates a top solution added on its own, without a wrapper", async () => {
      await import("./score-tools.js");
      await tick();
      document.body.append(topScore("alice", "999", CODE));
      await tick(100);

      const top = topScore("bob", "998", CODE);
      document.body.append(top);
      await tick(100);

      expect(copyButtons(top)).toHaveLength(1);
    });

    it("decorates a top solution rendered deep inside the page", async () => {
      const panel = document.createElement("section");
      panel.append(document.createElement("div"));
      document.body.append(topScore("alice", "999", CODE), panel);
      await import("./score-tools.js");
      await tick(100);

      const top = topScore("bob", "998", CODE);
      panel.firstElementChild.append(top);
      await tick(100);

      expect(copyButtons(top)).toHaveLength(1);
    });

    it("removes its button on navigation and adds it back once on return", async () => {
      const top = topScore("alice", "999", CODE);
      document.body.append(top);
      await import("./score-tools.js");
      await tick(100);

      await navigate("/");
      expect(copyButtons()).toEqual([]);
      expect(top.dataset.cbtCopyScore).toBeUndefined();

      await navigate("/play/123");
      await tick(100);
      expect(copyButtons(top)).toHaveLength(1);
    });

    it.each([
      ["author link", "a"],
      ["score", ".top-submission__author__score"],
      ["code", ".submissions-list__code"],
    ])(
      "leaves a top solution without its %s alone, and unmarked",
      async (_, part) => {
        const top = topScore("alice", "999", CODE);
        top.querySelector(part).remove();
        document.body.append(top);

        await import("./score-tools.js");
        await tick(100);

        expect(copyButtons()).toEqual([]);
        expect(top.dataset.cbtCopyScore).toBeUndefined();
      },
    );

    it("adds nothing when the page navigates away while the code is formatted", async () => {
      let format;
      vi.doMock("./utils/prettify", () => ({
        prettify: () => new Promise((resolve) => (format = resolve)),
      }));
      const top = topScore("alice", "999", CODE);
      document.body.append(top);
      await import("./score-tools.js");
      await tick();

      await navigate("/");
      format(CODE);
      await tick();

      expect(copyButtons()).toEqual([]);
      expect(top.dataset.cbtCopyScore).toBeUndefined();
    });
  });

  it("keeps a single Copy button per score when the script is loaded again", async () => {
    const item = scoreItem("600");
    list().append(item);
    const top = topScore("alice", "999", "<div></div>");
    document.body.append(top);
    await import("./score-tools.js");
    await tick(100);

    // What vite's HMR does to a changed content script during `npm start`.
    await import("./score-tools.js?reload");
    await tick(100);

    expect(copyButtons(item)).toHaveLength(1);
    expect(copyButtons(top)).toHaveLength(1);
    expect(console.debug).toHaveBeenCalledWith(
      "[cbt] score-tools:scores registered twice, dropping the first mount",
    );
    expect(console.debug).toHaveBeenCalledWith(
      "[cbt] score-tools:top-score registered twice, dropping the first mount",
    );
  });
});
