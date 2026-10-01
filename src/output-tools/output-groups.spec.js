/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ALL_OFF = {
  slideAndCompare: false,
  difference: false,
  targetOnOutput: false,
  grid: false,
  outline: false,
  background: false,
};

const DEBUG = {
  label: "debug",
  tools: { ...ALL_OFF, targetOnOutput: true, grid: true, outline: true },
};

const DIFF = {
  label: "Diff",
  tools: { ...ALL_OFF, slideAndCompare: true, difference: true },
};

function stubChrome(config) {
  return {
    storage: {
      sync: { get: vi.fn(() => Promise.resolve(config)) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  };
}

/** jsdom has no CSS Typed OM, which the compare and grid options use. */
function polyfillAttributeStyleMap() {
  Object.defineProperty(HTMLElement.prototype, "attributeStyleMap", {
    configurable: true,
    get() {
      const { style } = this;
      return {
        get: (prop) => ("" === style[prop] ? null : { value: +style[prop] }),
        set: (prop, value) => {
          style[prop] = String(value);
        },
      };
    },
  });
}

const CSSBATTLE_OPTIONS = `
  <label><input type="checkbox" /> Slide</label>
  <label><input type="checkbox" /> Diff</label>`;

function renderOutputPanel(options = CSSBATTLE_OPTIONS) {
  document.body.innerHTML = `
    <div class="container__item--output">
      <div class="header__extra-info">
        <div class="hstack">${options}</div>
      </div>
      <div class="target-container"><div class="target"></div></div>
    </div>`;
}

function $(selector) {
  return document.querySelector(selector);
}

function column() {
  return document.getElementById("output-groups");
}

function buttons() {
  return [...column().children];
}

function pressed() {
  return buttons().map((button) => button.getAttribute("aria-pressed"));
}

/** Every output tool's checkbox state, keyed like the groups. */
function state() {
  const [slide, diff] = document.querySelectorAll(
    ".hstack label:not(:has([id])) input",
  );
  return {
    slideAndCompare: slide.checked,
    difference: diff.checked,
    targetOnOutput: $("#output-compare-input").checked,
    grid: $("#output-grid-input").checked,
    outline: $("#output-outline-input").checked,
    background: $("#output-background-input").checked,
  };
}

function storageChange(changes) {
  chrome.storage.onChanged.addListener.mock.calls.forEach(([listener]) =>
    listener(changes),
  );
}

function tick(ms = 400) {
  return vi.advanceTimersByTimeAsync(ms);
}

async function mountTool(config = {}) {
  vi.stubGlobal("chrome", stubChrome(config));
  await import("../output-tools.js");
  await tick();
}

describe("output groups", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    polyfillAttributeStyleMap();
  });

  afterEach(async () => {
    // Unmounts the tool: its keydown listener sits on the document, which
    // outlives the test.
    window.history.replaceState({}, "", "/leaderboard");
    await tick(300);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete HTMLElement.prototype.attributeStyleMap;
    document.body.innerHTML = "";
    document.body.className = "";
    window.history.replaceState({}, "", "/play/123");
  });

  describe("rendering", () => {
    it("adds no column without groups", async () => {
      renderOutputPanel();
      await mountTool();

      expect(column()).toBeNull();
    });

    it("adds no column for an empty list", async () => {
      renderOutputPanel();
      await mountTool({ outputGroups: [] });

      expect(column()).toBeNull();
    });

    it("puts the column next to the render, not inside it", async () => {
      renderOutputPanel();
      await mountTool({ outputGroups: [DEBUG] });

      expect($(".target-container").nextElementSibling).toBe(column());
      expect(column().getAttribute("role")).toBe("toolbar");
    });

    it("shows one button per group, with its initial and its label as hint", async () => {
      renderOutputPanel();
      await mountTool({ outputGroups: [DEBUG, DIFF] });

      expect(buttons().map((button) => button.textContent)).toEqual(["D", "D"]);
      expect(buttons().map((button) => button.dataset.hint)).toEqual([
        "debug (Ctrl+1)",
        "Diff (Ctrl+2)",
      ]);
      expect(buttons()[0].getAttribute("aria-label")).toBe("debug");
      expect(buttons()[1].getAttribute("aria-keyshortcuts")).toBe("Control+2");
      expect(buttons()[0].type).toBe("button");
      // On the left: on the right, the hint would open under the render.
      expect(buttons()[0].classList.contains("hint--left")).toBe(true);
    });

    it("gives no shortcut to a group past the ninth", async () => {
      renderOutputPanel();
      const outputGroups = Array.from({ length: 10 }, (_, i) => ({
        label: `G${i + 1}`,
        tools: {},
      }));
      await mountTool({ outputGroups });

      expect(buttons()[8].dataset.hint).toBe("G9 (Ctrl+9)");
      expect(buttons()[9].dataset.hint).toBe("G10");
      expect(buttons()[9].hasAttribute("aria-keyshortcuts")).toBe(false);
    });

    it("keeps an emoji whole, and skips leading spaces", async () => {
      renderOutputPanel();
      await mountTool({
        outputGroups: [
          { label: "👩‍💻 Dev", tools: {} },
          { label: "  grid", tools: {} },
        ],
      });

      expect(buttons().map((button) => button.textContent)).toEqual([
        "👩‍💻",
        "G",
      ]);
    });

    it("shows a question mark for a blank label", async () => {
      renderOutputPanel();
      await mountTool({ outputGroups: [{ label: " ", tools: {} }] });

      expect(buttons()[0].textContent).toBe("?");
    });
  });

  describe("applying a group", () => {
    it("puts every output tool in the group's state", async () => {
      renderOutputPanel();
      await mountTool({ outputGroups: [DEBUG, DIFF] });

      buttons()[0].click();
      expect(state()).toEqual(DEBUG.tools);
      expect($("#overlay-grid").style.opacity).toBe("1");
      expect($(".target-container").classList.contains("display-outline")).toBe(
        true,
      );

      buttons()[1].click();
      expect(state()).toEqual(DIFF.tools);
      expect($("#overlay-grid").style.opacity).toBe("0");
      expect(document.body.classList.contains("diff-tool")).toBe(true);
    });

    it("leaves alone a checkbox already in the wanted state", async () => {
      renderOutputPanel();
      await mountTool({ defaultGrid: true, outputGroups: [DEBUG] });
      const grid = $("#output-grid-input");
      const clicks = vi.fn();
      grid.addEventListener("click", clicks);

      buttons()[0].click();

      expect(clicks).not.toHaveBeenCalled();
      // The grid toggles its overlay on every click, so a second one would
      // have hidden it.
      expect($("#overlay-grid").style.opacity).toBe("1");
    });

    it("turns everything off for a group without tools", async () => {
      renderOutputPanel();
      await mountTool({
        defaultGrid: true,
        defaultDifference: true,
        outputGroups: [{ label: "Off" }],
      });

      buttons()[0].click();

      expect(state()).toEqual(ALL_OFF);
    });

    it("applies what it can while cssbattle's checkboxes are missing", async () => {
      renderOutputPanel("");
      await mountTool({ outputGroups: [DEBUG, DIFF] });

      buttons()[0].click();

      expect($("#output-grid-input").checked).toBe(true);
      expect(pressed()).toEqual(["true", "false"]);

      buttons()[1].click();

      // Missing checkboxes count as off: the group cannot be on.
      expect($("#output-grid-input").checked).toBe(false);
      expect(pressed()).toEqual(["false", "false"]);
    });
  });

  describe("active group", () => {
    it("lights the group matching the starting state", async () => {
      renderOutputPanel();
      await mountTool({
        defaultTargetOnOutput: true,
        defaultGrid: true,
        defaultOutline: true,
        outputGroups: [DEBUG, DIFF],
      });

      expect(pressed()).toEqual(["true", "false"]);
    });

    it("follows the group last applied", async () => {
      renderOutputPanel();
      await mountTool({ outputGroups: [DEBUG, DIFF] });
      expect(pressed()).toEqual(["false", "false"]);

      buttons()[1].click();

      expect(pressed()).toEqual(["false", "true"]);
    });

    it("lights a group reached by hand, and unlights it when left", async () => {
      renderOutputPanel();
      await mountTool({ outputGroups: [DEBUG, DIFF] });

      $("#output-compare-input").click();
      $("#output-grid-input").click();
      $("#output-outline-input").click();
      expect(pressed()).toEqual(["true", "false"]);

      $("#output-background-input").click();
      expect(pressed()).toEqual(["false", "false"]);
    });

    it("follows cssbattle's own checkboxes", async () => {
      renderOutputPanel();
      await mountTool({ outputGroups: [DIFF] });

      document
        .querySelectorAll(".hstack label:not(:has([id])) input")
        .forEach((input) => input.click());

      expect(pressed()).toEqual(["true"]);
    });
  });

  describe("keyboard shortcuts", () => {
    /** Dispatches a keydown from the editor, which has the focus. */
    function press(init) {
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
      });
      $(".editor").dispatchEvent(event);
      return event;
    }

    function renderWithEditor() {
      renderOutputPanel();
      document.body.insertAdjacentHTML(
        "afterbegin",
        `<div class="editor"></div>`,
      );
    }

    it("applies the group of the digit pressed with Ctrl", async () => {
      renderWithEditor();
      await mountTool({ outputGroups: [DEBUG, DIFF] });

      const first = press({ ctrlKey: true, code: "Digit1", key: "1" });
      expect(state()).toEqual(DEBUG.tools);
      expect(pressed()).toEqual(["true", "false"]);
      expect(first.defaultPrevented).toBe(true);

      press({ ctrlKey: true, code: "Digit2", key: "2" });
      expect(state()).toEqual(DIFF.tools);
    });

    it("reads the key's place, so an AZERTY keyboard works too", async () => {
      renderWithEditor();
      await mountTool({ outputGroups: [DEBUG] });

      press({ ctrlKey: true, code: "Digit1", key: "&" });

      expect(state()).toEqual(DEBUG.tools);
    });

    it("takes the digits of the numeric keypad", async () => {
      renderWithEditor();
      await mountTool({ outputGroups: [DEBUG, DIFF] });

      press({ ctrlKey: true, code: "Numpad2", key: "2" });

      expect(state()).toEqual(DIFF.tools);
    });

    it("keeps the keystroke from the editor", async () => {
      renderWithEditor();
      await mountTool({ outputGroups: [DEBUG] });
      const editor = vi.fn();
      $(".editor").addEventListener("keydown", editor);

      press({ ctrlKey: true, code: "Digit1" });

      expect(editor).not.toHaveBeenCalled();
    });

    it.each([
      ["without Ctrl", { code: "Digit1" }],
      ["with Shift", { ctrlKey: true, shiftKey: true, code: "Digit1" }],
      ["with Alt", { ctrlKey: true, altKey: true, code: "Digit1" }],
      ["with Cmd", { ctrlKey: true, metaKey: true, code: "Digit1" }],
      ["for 0", { ctrlKey: true, code: "Digit0" }],
      ["for a letter", { ctrlKey: true, code: "KeyA" }],
      ["past the last group", { ctrlKey: true, code: "Digit3" }],
    ])("lets the key through %s", async (_, init) => {
      renderWithEditor();
      await mountTool({ outputGroups: [DEBUG, DIFF] });
      const editor = vi.fn();
      $(".editor").addEventListener("keydown", editor);

      const event = press(init);

      expect(state()).toEqual(ALL_OFF);
      expect(event.defaultPrevented).toBe(false);
      expect(editor).toHaveBeenCalled();
    });

    it("lets every key through without groups", async () => {
      renderWithEditor();
      await mountTool();

      const event = press({ ctrlKey: true, code: "Digit1" });

      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe("settings changes", () => {
    it("redraws the column when the groups change", async () => {
      renderOutputPanel();
      await mountTool({ outputGroups: [DEBUG] });

      storageChange({ outputGroups: { newValue: [DIFF, DEBUG] } });

      expect(buttons().map((button) => button.dataset.hint)).toEqual([
        "Diff (Ctrl+1)",
        "debug (Ctrl+2)",
      ]);
      expect(document.querySelectorAll("#output-groups")).toHaveLength(1);
    });

    it("shows the column once the first group is added", async () => {
      renderOutputPanel();
      await mountTool();

      storageChange({ outputGroups: { newValue: [DEBUG] } });

      expect(buttons()).toHaveLength(1);
      expect(pressed()).toEqual(["false"]);
    });

    it("drops the column once the groups are removed", async () => {
      renderOutputPanel();
      await mountTool({ outputGroups: [DEBUG] });

      storageChange({ outputGroups: { newValue: undefined } });

      expect(column()).toBeNull();
    });

    it("ignores changes to other settings", async () => {
      renderOutputPanel();
      await mountTool({ outputGroups: [DEBUG] });
      const before = column();

      storageChange({ defaultGrid: { newValue: true } });

      expect(column()).toBe(before);
    });
  });

  describe("leaving the battle", () => {
    it("removes the column and stops listening", async () => {
      renderOutputPanel();
      await mountTool({ outputGroups: [DEBUG] });
      const [slide] = document.querySelectorAll(".hstack input");

      window.history.replaceState({}, "", "/leaderboard");
      await tick(300);

      expect(column()).toBeNull();
      expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledTimes(
        chrome.storage.onChanged.addListener.mock.calls.length,
      );
      // No column left to refresh: a change must not throw.
      expect(() => slide.click()).not.toThrow();

      const shortcut = new KeyboardEvent("keydown", {
        ctrlKey: true,
        code: "Digit1",
        cancelable: true,
      });
      document.dispatchEvent(shortcut);
      expect(shortcut.defaultPrevented).toBe(false);
    });

    it("does not refresh a column that is gone", async () => {
      renderOutputPanel();
      await mountTool({ outputGroups: [DEBUG] });
      const [slide] = document.querySelectorAll(".hstack input");

      storageChange({ outputGroups: { newValue: [] } });

      expect(() => slide.click()).not.toThrow();
      expect(column()).toBeNull();
    });
  });
});
