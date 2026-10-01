/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OPTION_IDS = [
  "output-compare-input",
  "output-grid-input",
  "output-outline-input",
  "output-background-input",
];

const ALL_ON = {
  defaultTargetOnOutput: true,
  defaultGrid: true,
  defaultOutline: true,
  defaultBackground: true,
  defaultSlideAndCompare: true,
  defaultDifference: true,
};

function stubChrome(config = {}) {
  return {
    storage: {
      sync: { get: vi.fn(() => Promise.resolve(config)) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: { getURL: (p) => `chrome-extension://test/${p}` },
  };
}

/**
 * jsdom has no CSS Typed OM. This covers the two calls the tool makes, backed
 * by the inline style so assertions can read `style.opacity`.
 */
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

/**
 * The output panel as cssbattle lays it out: a header title, the header's
 * option strip with the Slide & Compare and Difference checkboxes, and the
 * target under the render.
 */
function renderOutputPanel({
  title = true,
  options = `
    <label><input type="checkbox" /> Slide</label>
    <label><input type="checkbox" /> Diff</label>`,
  extra = "",
} = {}) {
  document.body.innerHTML = `
    <div class="container__item--output">
      <div class="hstack">
        ${title ? `<span class="header__title">Output</span>` : ""}
      </div>
      <div class="header__extra-info">
        <div class="hstack">${options}</div>
      </div>
    </div>
    <div class="target-container"><div class="target"></div></div>
    ${extra}`;
}

/** Hands a storage change to every listener the tool registered. */
function storageChange(changes) {
  chrome.storage.onChanged.addListener.mock.calls.forEach(([listener]) =>
    listener(changes),
  );
}

function $(selector) {
  return document.querySelector(selector);
}

function hstack() {
  return $(".header__extra-info .hstack");
}

function target() {
  return $(".target-container > .target");
}

function targetContainer() {
  return $(".target-container");
}

/** cssbattle's own Slide & Compare and Difference checkboxes. */
function slideInput() {
  return hstack().querySelector("label:nth-child(1) input");
}

function diffLabel() {
  return hstack().querySelector("label:nth-child(2)");
}

function option(id) {
  return document.getElementById(id);
}

function leave() {
  window.history.replaceState({}, "", "/leaderboard");
  // The SPA router polls the URL every 300ms.
  return tick(300);
}

// Fake timers, so the polls a test leaves running die with it instead of
// firing once the jsdom environment is gone.
function tick(ms = 400) {
  return vi.advanceTimersByTimeAsync(ms);
}

async function mountTool(config = {}) {
  vi.stubGlobal("chrome", stubChrome(config));
  await import("./output-tools.js");
  await tick();
}

describe("output-tools", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    polyfillAttributeStyleMap();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete HTMLElement.prototype.attributeStyleMap;
    document.body.innerHTML = "";
    document.body.className = "";
    window.history.replaceState({}, "", "/play/123");
  });

  describe("mounting", () => {
    it("appends the four options after cssbattle's own", async () => {
      renderOutputPanel();
      await mountTool();

      const ids = [...hstack().children].map(
        (label) => label.querySelector("input").id,
      );
      expect(ids).toEqual(["", "", ...OPTION_IDS]);
    });

    it("drops the output header title", async () => {
      renderOutputPanel();
      await mountTool();

      expect($(".header__title")).toBeNull();
    });

    it("mounts without a header title", async () => {
      renderOutputPanel({ title: false });
      await mountTool();

      expect(option("output-compare-input")).not.toBeNull();
    });

    it("tags the target and adds a hidden grid over it", async () => {
      renderOutputPanel();
      await mountTool();

      expect(target().id).toBe("overlay-compare");
      const grid = targetContainer().firstElementChild;
      expect(grid.id).toBe("overlay-grid");
      expect(grid.style.opacity).toBe("0");
    });

    it("leaves every option off by default", async () => {
      renderOutputPanel();
      await mountTool();

      OPTION_IDS.forEach((id) => expect(option(id).checked).toBe(false));
      expect(slideInput().checked).toBe(false);
      expect(diffLabel().querySelector("input").checked).toBe(false);
      expect(document.body.classList.contains("compare-tool")).toBe(false);
      expect(document.body.classList.contains("diff-tool")).toBe(false);
      expect(targetContainer().className).toBe("target-container");
    });

    it("turns on every option the settings ask for", async () => {
      renderOutputPanel();
      await mountTool(ALL_ON);

      OPTION_IDS.forEach((id) => expect(option(id).checked).toBe(true));
      expect(document.body.classList.contains("compare-tool")).toBe(true);
      expect(target().style.opacity).toBe("0.7");
      expect($("#overlay-grid").style.opacity).toBe("1");
      expect(targetContainer().classList.contains("display-outline")).toBe(
        true,
      );
      expect(targetContainer().classList.contains("display-background")).toBe(
        true,
      );
      expect(slideInput().checked).toBe(true);
      expect(diffLabel().querySelector("input").checked).toBe(true);
      expect(document.body.classList.contains("diff-tool")).toBe(true);
    });

    it("leaves cssbattle's checkboxes alone when they already match the settings", async () => {
      renderOutputPanel({
        options: `
          <label><input type="checkbox" checked /> Slide</label>
          <label><input type="checkbox" checked /> Diff</label>`,
      });
      const clicks = vi.fn();
      hstack().addEventListener("click", clicks);

      await mountTool({
        defaultSlideAndCompare: true,
        defaultDifference: true,
      });

      expect(slideInput().checked).toBe(true);
      expect(diffLabel().querySelector("input").checked).toBe(true);
      expect(clicks).not.toHaveBeenCalled();
    });

    it("waits for cssbattle's checkboxes, and never takes ours for them", async () => {
      renderOutputPanel({ options: "" });
      await mountTool({ defaultTargetOnOutput: true, defaultGrid: true });

      // Our options are the only labels for now: they must be left as they are.
      expect(option("output-compare-input").checked).toBe(true);
      expect(option("output-grid-input").checked).toBe(true);
      expect(hstack().querySelector("[data-hint='Slide and Compare']")).toBe(
        null,
      );
      expect(hstack().querySelector("[data-hint='Show the difference']")).toBe(
        null,
      );

      hstack().insertAdjacentHTML(
        "afterbegin",
        `<label><input type="checkbox" checked /> Slide</label>
        <label><input type="checkbox" checked /> Diff</label>`,
      );
      await tick();

      expect(slideInput().closest("label").getAttribute("data-hint")).toBe(
        "Slide and Compare",
      );
      expect(diffLabel().getAttribute("data-hint")).toBe("Show the difference");
      expect(slideInput().checked).toBe(false);
      expect(diffLabel().querySelector("input").checked).toBe(false);
      expect(option("output-compare-input").checked).toBe(true);
      expect(option("output-grid-input").checked).toBe(true);
    });

    it("unchecks cssbattle's checkboxes when the settings say off", async () => {
      renderOutputPanel({
        options: `
          <label><input type="checkbox" checked /> Slide</label>
          <label><input type="checkbox" checked /> Diff</label>`,
      });
      await mountTool();

      expect(slideInput().checked).toBe(false);
      expect(diffLabel().querySelector("input").checked).toBe(false);
    });

    it("clears what a previous injection left behind", async () => {
      renderOutputPanel({
        extra: `
          <label><input id="output-grid-input" type="checkbox" /></label>
          <div id="overlay-compare" class="stale"></div>`,
      });
      // A leftover grid, which is not wrapped in a label.
      targetContainer().insertAdjacentHTML(
        "afterbegin",
        `<div id="overlay-grid" class="stale"></div>`,
      );
      await mountTool();

      expect(document.querySelectorAll("#output-grid-input")).toHaveLength(1);
      expect(document.querySelectorAll("#overlay-grid")).toHaveLength(1);
      expect($("#overlay-grid").classList.contains("stale")).toBe(false);
      // cssbattle's node keeps living, it only loses the id.
      expect($("div.stale")).not.toBeNull();
      expect($("div.stale").id).toBe("");
      expect(document.querySelectorAll("#overlay-compare")).toHaveLength(1);
      expect(target().id).toBe("overlay-compare");
    });
  });

  describe("options", () => {
    it("ghosts the target over the output, and back", async () => {
      renderOutputPanel();
      await mountTool();

      option("output-compare-input").click();
      expect(document.body.classList.contains("compare-tool")).toBe(true);
      expect(target().style.opacity).toBe("0.7");

      option("output-compare-input").click();
      expect(document.body.classList.contains("compare-tool")).toBe(false);
      expect(target().style.opacity).toBe("1");
    });

    it("still toggles the compare mode once the target lost its tag", async () => {
      renderOutputPanel();
      await mountTool();

      target().removeAttribute("id");
      option("output-compare-input").click();

      expect(document.body.classList.contains("compare-tool")).toBe(true);
      expect(target().style.opacity).toBe("");
    });

    it("shows and hides the grid", async () => {
      renderOutputPanel();
      await mountTool();

      option("output-grid-input").click();
      expect($("#overlay-grid").style.opacity).toBe("1");

      option("output-grid-input").click();
      expect($("#overlay-grid").style.opacity).toBe("0");
    });

    it("ignores the grid option once the grid is gone", async () => {
      renderOutputPanel();
      await mountTool();

      $("#overlay-grid").remove();

      expect(() => option("output-grid-input").click()).not.toThrow();
    });

    it("toggles the outline and the background of the output", async () => {
      renderOutputPanel();
      await mountTool();

      option("output-outline-input").click();
      option("output-background-input").click();
      expect(targetContainer().classList.contains("display-outline")).toBe(
        true,
      );
      expect(targetContainer().classList.contains("display-background")).toBe(
        true,
      );

      option("output-outline-input").click();
      option("output-background-input").click();
      expect(targetContainer().className).toBe("target-container");
    });
  });

  describe("Slide and Compare", () => {
    it("gets an icon and a hint", async () => {
      renderOutputPanel();
      await mountTool();

      const label = slideInput().closest("label");
      expect(label.getAttribute("data-hint")).toBe("Slide and Compare");
      expect(label.getAttribute("aria-label")).toBe("Slide and Compare");
      expect(label.className).toBe(
        "hint--bottom hint--left-if-slidencompare-alone",
      );
      expect(label.style.gap).toBe("0px");
      expect(label.lastElementChild.tagName).toBe("svg");
    });

    it("lifts the distance marker above the output", async () => {
      renderOutputPanel({
        extra: `<div class="Preview_previewDistance__abc"></div>`,
      });
      await mountTool();

      expect($(".Preview_previewDistance__abc").style.zIndex).toBe("100");
    });

    it("hides the DOM outline while it is on", async () => {
      renderOutputPanel({ extra: `<div id="dom-outline"></div>` });
      await mountTool();

      slideInput().click();
      expect($("#dom-outline").style.display).toBe("none");

      slideInput().click();
      expect($("#dom-outline").style.display).toBe("block");
    });

    it("does not need the DOM outline to be there", async () => {
      renderOutputPanel();
      await mountTool();

      expect(() => slideInput().click()).not.toThrow();
      expect(slideInput().checked).toBe(true);
    });
  });

  describe("Difference", () => {
    it("gets an icon and a hint", async () => {
      renderOutputPanel();
      await mountTool();

      const label = diffLabel();
      expect(label.getAttribute("data-hint")).toBe("Show the difference");
      expect(label.getAttribute("aria-label")).toBe("Show the difference");
      expect(label.className).toBe("hint--bottom-left");
      expect(label.style.gap).toBe("0px");
      expect(label.lastElementChild.tagName).toBe("svg");
    });

    it("toggles the diff mode with its checkbox", async () => {
      renderOutputPanel();
      await mountTool();

      diffLabel().querySelector("input").click();
      expect(document.body.classList.contains("diff-tool")).toBe(true);

      diffLabel().querySelector("input").click();
      expect(document.body.classList.contains("diff-tool")).toBe(false);
    });

    it("copes with a label that has no checkbox", async () => {
      renderOutputPanel({
        options: `
          <label><input type="checkbox" /> Slide</label>
          <label>Diff</label>`,
      });
      await mountTool({ defaultDifference: true });

      expect(diffLabel().getAttribute("data-hint")).toBe("Show the difference");
      expect(document.body.classList.contains("diff-tool")).toBe(false);
    });
  });

  describe("x2 target image", () => {
    const X1 = "https://cssbattle.dev/targets/1.png";
    const X2 = "https://cssbattle.dev/targets/1@2x.png";

    function renderPreview() {
      return `<img class="Preview_previewTargetImage__abc" src="${X1}" srcset="${X2} 2x" />`;
    }

    function preview() {
      return $(".Preview_previewTargetImage__abc");
    }

    it("switches to the 2x image when the setting is on", async () => {
      renderOutputPanel({ extra: renderPreview() });
      await mountTool({ x2Difference: true });

      expect(preview().src).toContain("@2x.png");
    });

    it("keeps the 1x image when the setting is off", async () => {
      renderOutputPanel({ extra: renderPreview() });
      await mountTool();

      expect(preview().src).toBe(X1);
    });

    it("waits for the preview image to render", async () => {
      renderOutputPanel();
      await mountTool({ x2Difference: true });

      document.body.insertAdjacentHTML("beforeend", renderPreview());
      await tick(100);

      expect(preview().src).toContain("@2x.png");
    });

    it("follows the setting as it changes", async () => {
      renderOutputPanel({ extra: renderPreview() });
      await mountTool({ x2Difference: true });

      storageChange({ x2Difference: { newValue: false } });
      expect(preview().src).toBe(X1);

      storageChange({ x2Difference: { newValue: true } });
      expect(preview().src).toContain("@2x.png");
    });

    it("ignores changes to other settings", async () => {
      renderOutputPanel({ extra: renderPreview() });
      await mountTool({ x2Difference: true });
      const before = preview().src;

      storageChange({ defaultGrid: { newValue: true } });

      expect(preview().src).toBe(before);
    });
  });

  describe("leaving the battle", () => {
    it("removes everything it added and restores cssbattle's nodes", async () => {
      renderOutputPanel({
        extra: `
          <img class="Preview_previewTargetImage__abc" src="https://cssbattle.dev/targets/1.png" />
          <div id="dom-outline"></div>`,
      });
      await mountTool(ALL_ON);

      await leave();

      OPTION_IDS.forEach((id) => expect(option(id)).toBeNull());
      expect($("#overlay-grid")).toBeNull();
      expect(target().id).toBe("");
      expect(target().style.opacity).toBe("");
      expect(document.body.className).toBe("");
      expect(targetContainer().className).toBe("target-container");
      expect(hstack().querySelectorAll("svg")).toHaveLength(0);
      chrome.storage.onChanged.addListener.mock.calls.forEach(([listener]) =>
        expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledWith(
          listener,
        ),
      );
    });

    it("stops listening to cssbattle's checkboxes", async () => {
      renderOutputPanel({ extra: `<div id="dom-outline"></div>` });
      await mountTool();

      await leave();
      slideInput().click();
      diffLabel().querySelector("input").click();

      expect($("#dom-outline").style.display).toBe("");
      expect(document.body.classList.contains("diff-tool")).toBe(false);
    });
  });
});
