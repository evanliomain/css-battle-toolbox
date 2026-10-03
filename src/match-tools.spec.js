/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./utils/render-probe", () => ({
  createProbe: vi.fn(() => ({ render: vi.fn(), destroy: vi.fn() })),
}));
vi.mock("./utils/target-image", () => ({
  targetImageData: vi.fn(() => Promise.resolve(TARGET)),
}));
vi.mock("./utils/pixel-match", async (importOriginal) => ({
  ...(await importOriginal()),
  matchImages: vi.fn(),
}));

const TARGET = { kind: "target" };
const RENDER = { kind: "render" };
const DIFF = { kind: "diff" };

function badge() {
  return document.getElementById("cbt-match");
}

function editor() {
  return document.querySelector("[contenteditable]");
}

function hint() {
  return badge().getAttribute("data-hint");
}

function tick(ms) {
  return vi.advanceTimersByTimeAsync(ms);
}

/** Leaves /play/<id>, which tears every play-page tool down. */
function navigateAway() {
  window.history.pushState({}, "", "/leaderboard");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Types in the editor: the code changes, then the key is pressed. */
function type(code, event = new KeyboardEvent("keydown", { key: "a" })) {
  editor().textContent = code;
  editor().dispatchEvent(event);
}

describe("match-tools", () => {
  let probe;
  let matchImages;
  let targetImageData;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    document.body.className = "";
    document.body.innerHTML = `
      <div class="Editor-module__abc">
        <div class="item__header">
          <div class="header__extra-info"><div class="hstack"><span id="other"></span></div></div>
        </div>
      </div>
      <div contenteditable="true"><p></p></div>
      <div class="container__item--target"><img src="https://cssutils.com/icon.png"><img class="levelpage__target" src="/targets/12.png"></div>
      <div class="target-container"></div>`;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.history.replaceState({}, "", "/play/123");
    delete document.visibilityState;
    document.body.innerHTML = "";
  });

  async function mountTool({ match = 1, sRGB = true } = {}) {
    ({ matchImages } = await import("./utils/pixel-match"));
    ({ targetImageData } = await import("./utils/target-image"));
    const { createProbe } = await import("./utils/render-probe");
    // The mocked modules outlive the test: start them afresh.
    createProbe.mockClear();
    targetImageData.mockReset().mockResolvedValue(TARGET);
    matchImages.mockReset().mockReturnValue({
      match,
      diffPixels: Math.round((1 - match) * 120000),
      diff: DIFF,
    });
    await import("./match-tools.js");
    await tick(150);
    [{ value: probe }] = createProbe.mock.results;
    probe.render.mockResolvedValue({ image: RENDER, sRGB });
  }

  describe("before any edit", () => {
    it("shows a dash, asking to type", async () => {
      await mountTool();

      expect(badge().textContent).toBe("—");
      expect(hint()).toBe("Type to measure the match");
      expect(badge().getAttribute("aria-label")).toBe(hint());
    });

    it("sits first in the editor header without the minified count", async () => {
      await mountTool();

      expect(document.querySelector(".hstack").firstElementChild).toBe(badge());
    });

    it("sits right after the minified count", async () => {
      document
        .querySelector(".hstack")
        .insertAdjacentHTML(
          "afterbegin",
          `<span id="nb-minified-characters"></span>`,
        );

      await mountTool();

      expect(
        document.getElementById("nb-minified-characters").nextElementSibling,
      ).toBe(badge());
    });

    it("captures nothing on its own, however long it waits", async () => {
      await mountTool();
      await tick(60000);

      expect(probe.render).not.toHaveBeenCalled();
    });

    it("captures nothing when the editor changes without an edit", async () => {
      await mountTool();

      // cssbattle re-rendering its editor.
      editor().textContent = "<a></a>";
      await tick(60000);

      expect(probe.render).not.toHaveBeenCalled();
    });
  });

  describe("after an edit", () => {
    it("renders the code over the output, once the typing stops", async () => {
      await mountTool();

      type("<b></b>");
      await tick(499);
      expect(probe.render).not.toHaveBeenCalled();

      await tick(1);
      expect(probe.render).toHaveBeenCalledOnce();
      expect(probe.render).toHaveBeenCalledWith(
        "<b></b>",
        document.querySelector(".target-container"),
      );
    });

    it("measures once for a burst of keystrokes", async () => {
      await mountTool();

      type("<b>");
      await tick(300);
      type("<b></b>");
      await tick(300);
      type("<b></b><i>");
      await tick(500);

      expect(probe.render).toHaveBeenCalledOnce();
      expect(probe.render.mock.calls[0][0]).toBe("<b></b><i>");
    });

    it.each(["paste", "cut", "drop"])("measures after a %s", async (kind) => {
      await mountTool();

      type("<b></b>", new Event(kind));
      await tick(500);

      expect(probe.render).toHaveBeenCalledOnce();
    });

    it("measures after the extension rewrites the code", async () => {
      await mountTool();
      const { notifyCodeChanged } = await import("./utils/change-code");

      editor().textContent = "<b></b>";
      notifyCodeChanged();
      await tick(500);

      expect(probe.render).toHaveBeenCalledOnce();
    });

    it("compares the render with the target", async () => {
      await mountTool();

      type("<b></b>");
      await tick(500);

      expect(targetImageData).toHaveBeenCalledWith(
        "https://cssbattle.dev/targets/12.png",
      );
      expect(matchImages).toHaveBeenCalledWith(TARGET, RENDER);
    });

    it("tells the output the wrong pixels", async () => {
      await mountTool({ match: 0.995 });
      const listener = vi.fn();
      document.addEventListener("cbt:match-measured", listener);

      type("<b></b>");
      await tick(500);

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0][0].detail).toEqual({
        match: 0.995,
        diffPixels: 600,
        diff: DIFF,
      });
      document.removeEventListener("cbt:match-measured", listener);
    });

    it("captures nothing more for an edit that leaves the code as it was", async () => {
      await mountTool();

      type("<b></b>");
      await tick(500);
      type("<b></b>");
      await tick(500);

      expect(probe.render).toHaveBeenCalledOnce();
    });

    it("measures each new code", async () => {
      await mountTool();

      type("<b></b>");
      await tick(500);
      type("<i></i>");
      await tick(500);

      expect(probe.render).toHaveBeenCalledTimes(2);
    });
  });

  describe("the badge", () => {
    it("shows 100% from 99.98%", async () => {
      await mountTool({ match: 0.9998 });

      type("<b></b>");
      await tick(500);

      expect(badge().textContent).toBe("100%");
      expect(badge().classList.contains("is-perfect")).toBe(true);
      expect(badge().classList.contains("is-approximate")).toBe(false);
    });

    it("shows a match below, rounded down", async () => {
      await mountTool({ match: 0.99979 });

      type("<b></b>");
      await tick(500);

      expect(badge().textContent).toBe("99.97%");
      expect(badge().classList.contains("is-perfect")).toBe(false);
    });

    it("explains the match and the score of the minified code", async () => {
      await mountTool({ match: 0.995 });

      type("<b>  </b>");
      await tick(500);

      expect(hint()).toBe(
        "Estimated match: 99.50%, 600 wrong pixels. Estimated score: 599.99 for 7 characters once minified.",
      );
      expect(badge().getAttribute("aria-label")).toBe(hint());
    });

    it("is approximate on a screen that does not blend in sRGB", async () => {
      await mountTool({ match: 1, sRGB: false });

      type("<b></b>");
      await tick(500);

      expect(badge().textContent).toBe("≈100%");
      expect(badge().classList.contains("is-approximate")).toBe(true);
      expect(hint()).toContain("chrome://flags/#force-color-profile");
    });

    it("is approximate for code that depends on the fonts", async () => {
      await mountTool({ match: 0.5 });

      type("<style>*{margin:5ch}");
      await tick(500);

      expect(badge().textContent).toBe("≈50.00%");
      expect(hint()).toContain("its own Linux fonts");
      expect(hint()).not.toContain("force-color-profile");
    });

    it("drops the approximation once the code no longer needs it", async () => {
      await mountTool();

      type("<style>*{margin:5ch}");
      await tick(500);
      type("<style>*{margin:5px}");
      await tick(500);

      expect(badge().textContent).toBe("100%");
      expect(badge().classList.contains("is-approximate")).toBe(false);
    });

    it("toggles the pixel diff of the output on a click", async () => {
      document
        .querySelector(".target-container")
        .insertAdjacentHTML(
          "beforeend",
          `<input id="output-pixel-diff-input" type="checkbox">`,
        );
      await mountTool();

      badge().click();

      expect(document.getElementById("output-pixel-diff-input").checked).toBe(
        true,
      );
    });

    it("does nothing on a click without the pixel diff", async () => {
      await mountTool();

      expect(() => badge().click()).not.toThrow();
    });
  });

  describe("when it cannot measure", () => {
    it("asks to scroll the output into view, and measures again on the next edit", async () => {
      await mountTool();
      probe.render.mockResolvedValueOnce(null);

      type("<b></b>");
      await tick(500);

      expect(badge().textContent).toBe("—");
      expect(hint()).toBe("Scroll the output fully into view to measure");
      expect(matchImages).not.toHaveBeenCalled();

      type("<b></b>");
      await tick(500);
      expect(probe.render).toHaveBeenCalledTimes(2);
      expect(badge().textContent).toBe("100%");
    });

    it("says so when the capture fails", async () => {
      await mountTool({ match: 0.5 });
      type("<b></b>");
      await tick(500);
      probe.render.mockRejectedValueOnce(new Error("Denied"));

      type("<i></i>");
      await tick(500);

      expect(badge().textContent).toBe("—");
      expect(badge().classList.contains("is-perfect")).toBe(false);
      expect(badge().classList.contains("is-approximate")).toBe(false);
      expect(hint()).toBe("The match could not be measured");
      expect(console.debug).toHaveBeenCalledWith(
        "[cbt] match-tools:",
        expect.any(Error),
      );
    });

    it("says so when the target cannot be read", async () => {
      await mountTool();
      targetImageData.mockRejectedValueOnce(new Error("tainted"));

      type("<b></b>");
      await tick(500);

      expect(hint()).toBe("The match could not be measured");
      expect(probe.render).not.toHaveBeenCalled();
    });

    it("captures nothing while the option hides it", async () => {
      await mountTool();
      document.body.classList.add("hideMatch");

      type("<b></b>");
      await tick(500);

      expect(probe.render).not.toHaveBeenCalled();
    });

    it("captures nothing while the tab is hidden, and drops the edit", async () => {
      await mountTool();
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });

      type("<b></b>");
      await tick(500);
      delete document.visibilityState;
      await tick(60000);

      expect(probe.render).not.toHaveBeenCalled();
    });

    it("captures nothing while the editor is partly rendered", async () => {
      await mountTool();
      type("<b></b>");
      await tick(500);
      probe.render.mockClear();
      editor().innerHTML = `<div class="cm-line">a</div><div class="cm-gap"></div>`;

      editor().dispatchEvent(new KeyboardEvent("keydown"));
      await tick(500);

      expect(probe.render).not.toHaveBeenCalled();
    });
  });

  describe("one capture at a time", () => {
    it("measures an edit made meanwhile right after, with the latest code", async () => {
      await mountTool();
      let finish;
      probe.render.mockImplementationOnce(
        () => new Promise((resolve) => (finish = resolve)),
      );

      type("<b></b>");
      await tick(500);
      type("<i></i>");
      await tick(500);
      type("<u></u>");
      await tick(500);
      expect(probe.render).toHaveBeenCalledOnce();

      finish({ image: RENDER, sRGB: true });
      await tick(0);

      expect(probe.render).toHaveBeenCalledTimes(2);
      expect(probe.render.mock.calls[1][0]).toBe("<u></u>");
    });
  });

  describe("on navigation", () => {
    it("removes the badge and the probe, and stops listening", async () => {
      await mountTool();

      navigateAway();
      await tick(0);

      expect(badge()).toBeNull();
      expect(probe.destroy).toHaveBeenCalledOnce();

      type("<b></b>");
      await tick(500);
      const { notifyCodeChanged } = await import("./utils/change-code");
      notifyCodeChanged();
      await tick(500);
      expect(probe.render).not.toHaveBeenCalled();
    });

    it("drops a measure still pending", async () => {
      await mountTool();
      type("<b></b>");

      navigateAway();
      await tick(500);

      expect(probe.render).not.toHaveBeenCalled();
    });

    it("drops a measure that ends after it", async () => {
      await mountTool();
      const listener = vi.fn();
      document.addEventListener("cbt:match-measured", listener);
      let finish;
      probe.render.mockImplementationOnce(
        () => new Promise((resolve) => (finish = resolve)),
      );
      type("<b></b>");
      await tick(500);
      type("<i></i>");
      await tick(500);

      navigateAway();
      finish({ image: RENDER, sRGB: true });
      await tick(500);

      expect(matchImages).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();
      expect(probe.render).toHaveBeenCalledOnce();
      document.removeEventListener("cbt:match-measured", listener);
    });
  });
});
