/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ͼ18 and ͼ1g are the classes CodeMirror gives number tokens. They are not
// mixed on one line: jsdom returns a selector list grouped by selector rather
// than in document order, which would scramble the order of the numbers.
const EDITOR = `
  <div class="Editor-module__abc"></div>
  <div class="cm-content" contenteditable="true">
    <div class="cm-line cm-activeLine"><span class="ͼ18">10</span>px <span class="ͼ18">20</span> <span class="ͼ18">auto</span></div>
    <div class="cm-line"><span class="ͼ1g">5</span></div>
    <div class="cm-line"><span class="ͼ18">none</span></div>
  </div>`;

function stubChrome(settings = {}) {
  return {
    storage: {
      sync: { get: vi.fn(() => Promise.resolve(settings)) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: { getURL: (p) => `chrome-extension://test/${p}` },
  };
}

function panel() {
  return document.querySelector(".incrementor-panel");
}

function lines() {
  return [...document.querySelectorAll(".cm-line")];
}

function numbersOf(line) {
  return [...line.querySelectorAll("span")];
}

/** The numbers of the first line: "10", "20", then the non-numeric "auto". */
function spans() {
  return numbersOf(lines()[0]);
}

function texts() {
  return spans().map((span) => span.textContent);
}

function highlighted() {
  return [...document.querySelectorAll(".highlighted")].map(
    (span) => span.textContent,
  );
}

function selectedIncrement() {
  return panel().querySelector(".button--primary").dataset.increment;
}

/** Moves CodeMirror's active line, as a cursor move does. */
function setActiveLine(index) {
  document.querySelector(".cm-activeLine")?.classList.remove("cm-activeLine");
  if (undefined !== index) {
    lines()[index].classList.add("cm-activeLine");
  }
}

function press(key, options = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  document.dispatchEvent(event);
  return event;
}

function toggleMode() {
  return press("I", { ctrlKey: true, shiftKey: true });
}

function click(selector) {
  panel().querySelector(selector).click();
}

/** Leaves /play/<id>, which tears every play-page tool down. */
function navigateAway() {
  window.history.pushState({}, "", "/leaderboard");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// Fake timers, so the polls a test leaves running die with it instead of
// firing once the jsdom environment is gone.
function tick(ms) {
  return vi.advanceTimersByTimeAsync(ms);
}

async function mountTool({ html = EDITOR, settings } = {}) {
  document.body.innerHTML = html;
  vi.stubGlobal("chrome", stubChrome(settings));
  await import("./incrementor-tools.js");
  await tick(150);
}

describe("incrementor-tools", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // jsdom has no Selection.modify; the tool only uses it to nudge the caret.
    Selection.prototype.modify = vi.fn();
  });

  afterEach(() => {
    // The keydown listener lives on `document`, which outlives the test: tear
    // the tool down so it does not answer the next test's key presses.
    navigateAway();
    delete Selection.prototype.modify;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.history.replaceState({}, "", "/play/123");
    document.body.innerHTML = "";
  });

  describe("panel", () => {
    it("adds the panel right after the editor, incrementing by 1", async () => {
      await mountTool();

      expect(
        document.querySelector(".Editor-module__abc").nextElementSibling,
      ).toBe(panel());
      expect(selectedIncrement()).toBe("1");
    });

    it("moves the increment with the arrow buttons, wrapping around", async () => {
      await mountTool();

      click('[data-increment-move="1"]');
      expect(selectedIncrement()).toBe("0.1");
      click('[data-increment-move="1"]');
      click('[data-increment-move="1"]');
      expect(selectedIncrement()).toBe("100");
      click('[data-increment-move="-1"]');
      expect(selectedIncrement()).toBe("0.01");
    });

    it("picks an increment directly", async () => {
      await mountTool();

      click('[data-increment="10"]');

      expect(selectedIncrement()).toBe("10");
      expect(panel().querySelectorAll(".button--primary")).toHaveLength(1);
    });

    it("increments and decrements the highlighted number with + and -", async () => {
      await mountTool();
      toggleMode();

      click("#increment-plus");
      click("#increment-plus");
      expect(texts()[0]).toBe("12");

      click("#increment-minus");
      expect(texts()[0]).toBe("11");
    });

    it("leaves increment mode with the Esc button", async () => {
      await mountTool();
      toggleMode();

      click("#increment-exit");

      expect(highlighted()).toEqual([]);
      expect(document.querySelector(".content-highlighted")).toBeNull();
    });
  });

  describe("increment mode", () => {
    it("enters with Ctrl+Shift+I and highlights the first number of the line", async () => {
      await mountTool();

      toggleMode();

      expect(highlighted()).toEqual(["10"]);
      // Only the numeric tokens are flagged.
      expect(
        [...document.querySelectorAll('[data-type="number"]')].map(
          (span) => span.textContent,
        ),
      ).toEqual(["10", "20", "5"]);
      expect(
        document
          .querySelector(".cm-content")
          .classList.contains("content-highlighted"),
      ).toBe(true);
      // The caret goes to the start of the active line.
      expect(window.getSelection().anchorNode).toBe(spans()[0]);
      expect(Selection.prototype.modify).toHaveBeenCalledWith(
        "move",
        "forward",
        "character",
      );
    });

    it("only toggles on the exact Ctrl+Shift shortcut", async () => {
      await mountTool();

      press("I", { shiftKey: true });
      press("I", { ctrlKey: true });
      press("J", { ctrlKey: true, shiftKey: true });

      expect(highlighted()).toEqual([]);
    });

    it("leaves with Escape or Ctrl+Shift+I, clearing every mark", async () => {
      await mountTool();

      toggleMode();
      press("a");
      press("Escape");

      expect(highlighted()).toEqual([]);
      expect(document.querySelector(".locked")).toBeNull();
      expect(document.querySelector(".content-highlighted")).toBeNull();

      toggleMode();
      toggleMode();

      expect(highlighted()).toEqual([]);
    });

    it("lets the keys through while not in increment mode", async () => {
      await mountTool();

      const event = press("=");

      expect(event.defaultPrevented).toBe(false);
      expect(texts()[0]).toBe("10");
    });

    it("increments and decrements with = and :", async () => {
      await mountTool();
      toggleMode();

      const event = press("=");
      expect(event.defaultPrevented).toBe(true);
      expect(texts()[0]).toBe("11");

      press(":");
      press(":");
      expect(texts()[0]).toBe("9");
      // The outline stays on once the content changed.
      expect(highlighted()).toEqual(["9"]);
    });

    it("changes the increment with < and w, and trims the decimals", async () => {
      await mountTool();
      toggleMode();

      press("w");
      expect(selectedIncrement()).toBe("0.1");
      press("=");
      expect(texts()[0]).toBe("10.1");

      press("w");
      press(":");
      expect(texts()[0]).toBe("10.09");

      press("<");
      press("<");
      press("<");
      expect(selectedIncrement()).toBe("10");
      press("=");
      expect(texts()[0]).toBe("20.09");
    });

    it("skips a highlighted number the page turned into something else", async () => {
      await mountTool();
      toggleMode();
      spans()[0].textContent = "auto";

      press("=");

      expect(texts()[0]).toBe("auto");
    });

    it("moves between the numbers of the line with the arrow keys", async () => {
      await mountTool();
      toggleMode();

      press("ArrowRight");
      await tick(0);
      expect(highlighted()).toEqual(["20"]);
      // The caret is put back so the editor does not move it too.
      expect(Selection.prototype.modify).toHaveBeenCalledWith(
        "move",
        "backward",
        "character",
      );

      press("ArrowRight");
      await tick(0);
      expect(highlighted()).toEqual(["10"]);

      press("ArrowLeft");
      await tick(0);
      expect(highlighted()).toEqual(["20"]);

      press("=");
      expect(texts()).toEqual(["10", "21", "auto"]);
    });

    it("jumps to the first number of the line the cursor lands on", async () => {
      await mountTool();
      toggleMode();
      press("ArrowRight");
      await tick(0);

      press("ArrowDown");
      setActiveLine(1);
      await tick(0);

      expect(numbersOf(lines()[1])[0].classList.contains("highlighted")).toBe(
        true,
      );
      expect(window.getSelection().anchorNode).toBe(numbersOf(lines()[1])[0]);
    });

    it("only moves the caret when the new line has no number", async () => {
      await mountTool();
      toggleMode();

      press("ArrowUp");
      setActiveLine(2);
      await tick(0);

      expect(window.getSelection().anchorNode).toBe(numbersOf(lines()[2])[0]);
      expect(numbersOf(lines()[2])[0].classList.contains("highlighted")).toBe(
        false,
      );
    });

    it("does nothing when the cursor leaves the editor right after an arrow", async () => {
      await mountTool();
      toggleMode();
      const addRange = vi.spyOn(Selection.prototype, "addRange");

      press("ArrowDown");
      setActiveLine();
      await tick(0);

      expect(addRange).not.toHaveBeenCalled();
    });

    it("still changes the increment without an active line, but no number", async () => {
      await mountTool();
      toggleMode();
      setActiveLine();

      press("<");
      const event = press("=");

      expect(selectedIncrement()).toBe("10");
      expect(event.defaultPrevented).toBe(true);
      expect(texts()[0]).toBe("10");
    });

    it("ignores the number keys on a line without numbers", async () => {
      await mountTool();
      setActiveLine(2);
      toggleMode();

      press("ArrowRight");
      press("a");
      await tick(0);

      expect(highlighted()).toEqual([]);
      expect(document.querySelector(".locked")).toBeNull();
    });

    it("locks numbers with a, increments them together, and unlocks them with d", async () => {
      await mountTool();
      toggleMode();

      press("a");
      press("ArrowRight");
      await tick(0);
      press("=");

      expect(texts()).toEqual(["11", "21", "auto"]);

      press("a");
      press("a");
      expect(spans()[1].classList.contains("locked")).toBe(false);
      expect(spans()[0].classList.contains("locked")).toBe(true);

      press("d");
      expect(document.querySelector(".locked")).toBeNull();
    });
  });

  describe("keyboard settings", () => {
    it("uses the shortcuts from the options", async () => {
      await mountTool({
        settings: {
          strKbdIncrement: "+",
          strKbdDecrement: "-",
          strKbdIncreaseIncrement: "[",
          strKbdDecreaseIncrement: "]",
          strKbdToggleIncrement: "K",
        },
      });

      press("K", { ctrlKey: true, shiftKey: true });
      press("+");
      press("[");
      press("-");
      press("]");
      press("]");

      expect(texts()[0]).toBe("1");
      expect(selectedIncrement()).toBe("0.1");
    });

    it("keeps the default shortcuts when nothing is stored", async () => {
      await mountTool({ settings: undefined });

      toggleMode();
      press("=");

      expect(texts()[0]).toBe("11");
    });

    it("follows the options as they change", async () => {
      await mountTool();
      const [onChange] = chrome.storage.onChanged.addListener.mock.calls[0];

      onChange({ strKbdIncrement: { oldValue: "=", newValue: "!" } });
      toggleMode();
      press("=");
      press("!");

      expect(texts()[0]).toBe("11");
    });
  });

  describe("mode menu", () => {
    it("toggles increment mode from the menu item once it shows up", async () => {
      await mountTool();

      // mode-menu.js mounts on its own, so its item can come later.
      document.body.insertAdjacentHTML(
        "beforeend",
        `<a id="increment-mode-toggle" href="#"></a>`,
      );
      await tick(150);
      document.getElementById("increment-mode-toggle").click();

      expect(highlighted()).toEqual(["10"]);
    });
  });

  describe("editor changes", () => {
    /** Touches the editor node itself, which is all the observer watches. */
    async function editorChanged() {
      document.querySelector("[contenteditable]").setAttribute("data-rev", "1");
      await tick(0);
    }

    function clickSpan(span, options = {}) {
      span.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          ...options,
        }),
      );
    }

    it("flags the numbers CodeMirror rendered", async () => {
      await mountTool();
      toggleMode();

      lines()[0].insertAdjacentHTML("beforeend", `<span class="ͼ18">7</span>`);
      await editorChanged();

      expect(spans()[3].dataset.type).toBe("number");
      expect(highlighted()).toEqual(["10"]);
    });

    it("keeps the locked numbers locked", async () => {
      await mountTool();
      toggleMode();
      press("a");
      // CodeMirror redraws the token classes on an edit.
      spans()[0].className = "ͼ18";

      await editorChanged();

      expect(spans()[0].classList.contains("locked")).toBe(true);
    });

    it("stops watching once increment mode is left", async () => {
      await mountTool();
      toggleMode();
      await tick(0);
      toggleMode();

      lines()[0].insertAdjacentHTML("beforeend", `<span class="ͼ18">7</span>`);
      await editorChanged();

      expect(spans()[3].dataset.type).toBeUndefined();
      expect(highlighted()).toEqual([]);
    });

    it("highlights a clicked number, which the next increment targets", async () => {
      await mountTool();
      toggleMode();
      await editorChanged();

      clickSpan(spans()[1]);
      press("=");

      expect(highlighted()).toEqual(["21"]);
      expect(texts()).toEqual(["10", "21", "auto"]);
    });

    it("locks a shift-clicked number, once however often the editor changed", async () => {
      await mountTool();
      toggleMode();
      // Each change adds another click listener to the same spans.
      await editorChanged();
      await editorChanged();

      clickSpan(spans()[1], { shiftKey: true });

      expect(spans()[1].classList.contains("locked")).toBe(true);
    });

    it("ignores a click on a number while no line is active", async () => {
      await mountTool();
      toggleMode();
      setActiveLine();
      await editorChanged();

      clickSpan(spans()[1]);

      expect(spans()[1].classList.contains("highlighted")).toBe(false);
    });

    it("does not highlight past the numbers of the new active line", async () => {
      await mountTool();
      toggleMode();
      press("ArrowRight");
      await tick(0);
      setActiveLine(1);

      await editorChanged();

      expect(numbersOf(lines()[1])[0].classList.contains("highlighted")).toBe(
        false,
      );
    });
  });

  describe("a page without .cm-content", () => {
    const BARE = EDITOR.replace('class="cm-content" ', "");

    it("enters and leaves increment mode all the same", async () => {
      await mountTool({ html: BARE });

      toggleMode();
      expect(highlighted()).toEqual(["10"]);

      toggleMode();
      expect(highlighted()).toEqual([]);
    });
  });

  it("flags the numbers even when no line is active yet", async () => {
    await mountTool();
    setActiveLine();
    // Placing the caret then throws on the missing line: swallow the error the
    // listener reports, so this test only looks at what happened before it.
    const errors = [];
    const onError = (event) => {
      event.preventDefault();
      errors.push(event.error);
    };
    window.addEventListener("error", onError);

    toggleMode();
    window.removeEventListener("error", onError);

    expect(document.querySelector("[data-type=number]")).not.toBeNull();
    expect(highlighted()).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  describe("teardown", () => {
    it("removes the panel and restores the editor mid-session", async () => {
      await mountTool();
      toggleMode();
      press("a");

      navigateAway();

      expect(panel()).toBeNull();
      expect(highlighted()).toEqual([]);
      expect(document.querySelector(".locked")).toBeNull();
      expect(document.querySelector(".content-highlighted")).toBeNull();
      expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledWith(
        chrome.storage.onChanged.addListener.mock.calls[0][0],
      );
    });

    it("stops listening to the keyboard and the menu", async () => {
      await mountTool({
        html: `${EDITOR}<a id="increment-mode-toggle" href="#"></a>`,
      });

      navigateAway();
      toggleMode();
      document.getElementById("increment-mode-toggle").click();

      expect(highlighted()).toEqual([]);
    });
  });
});
