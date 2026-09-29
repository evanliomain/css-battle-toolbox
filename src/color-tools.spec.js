/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stubChrome() {
  return {
    storage: {
      sync: { get: vi.fn(() => Promise.resolve({})) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: { getURL: (p) => `chrome-extension://test/${p}` },
  };
}

/** The target panel, with the palette cssbattle lists under the target. */
function renderTargetPanel(colors = ["#0b2429", "#998235"]) {
  document.body.innerHTML = `
    <div class="container__item--target">
      <div class="item__content"><div id="target-content"></div></div>
    </div>`;
  addPalette(colors);
}

function addPalette(colors) {
  document
    .querySelector(".container__item--target")
    .insertAdjacentHTML(
      "beforeend",
      `<div class="colors-list">${colors
        .map((color) => `<div class="colors-list__color">${color}</div>`)
        .join("")}</div>`,
    );
  // jsdom has no innerText, which is what the tool reads the palette from.
  document.querySelectorAll(".colors-list__color").forEach((node) =>
    Object.defineProperty(node, "innerText", {
      get: () => node.textContent,
      configurable: true,
    }),
  );
}

/**
 * Clicks a swatch the way Chrome does. jsdom skips the inline `onclick` of
 * nodes parsed by DOMParser (their document has no window), so run it by hand
 * first, as the browser runs it before the listeners added afterwards.
 */
function press(button) {
  new Function(button.getAttribute("onclick")).call(button);
  button.click();
}

function tool() {
  return document.getElementById("color-mixer-tool");
}

function input(id) {
  return document.getElementById(`color-input-${id}`);
}

function type(id, value) {
  input(id).value = value;
  input(id).dispatchEvent(new Event("input"));
}

/** Each suggestion as its label: the color, then the error in brackets. */
function results() {
  return [...document.querySelectorAll("#color-result button")].map((button) =>
    [...button.querySelectorAll("span")].map((span) => span.textContent),
  );
}

// Fake timers, so the pollers every tool leaves running die with the test.
function tick(ms = 200) {
  return vi.advanceTimersByTimeAsync(ms);
}

describe("color-tools", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal("chrome", stubChrome());
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.history.replaceState({}, "", "/play/123");
    document.body.innerHTML = "";
  });

  it("adds a background and a target swatch for each color of the palette", async () => {
    renderTargetPanel(["#0b2429", "#998235"]);

    await import("./color-tools.js");
    await tick();

    // Appended to the target content, not somewhere else on the page.
    expect(document.querySelector("#target-content").lastElementChild).toBe(
      tool(),
    );
    const labels = (container) =>
      [...container.querySelectorAll("button")].map((b) =>
        b.getAttribute("aria-label"),
      );
    const [background, target] = tool().querySelectorAll(".bullet-buttons");
    expect(labels(background)).toEqual([
      "Reset background",
      "Copy color #0b2429 as background",
      "Copy color #998235 as background",
    ]);
    expect(labels(target)).toEqual([
      "Copy color #0b2429 as foreground",
      "Copy color #998235 as foreground",
    ]);
  });

  it("waits for the palette before mounting", async () => {
    renderTargetPanel([]);

    await import("./color-tools.js");
    await tick();
    expect(tool()).toBeNull();

    addPalette(["#0b2429"]);
    await tick(100);

    expect(tool()).not.toBeNull();
  });

  it("finds the opaque color that gives the target on a white background", async () => {
    renderTargetPanel();
    await import("./color-tools.js");
    await tick();

    type("target", "#ff0000");

    expect(results()).toEqual([["#f00", "(0)"]]);
    const button = document.querySelector("#color-result button");
    expect(button.dataset.color).toBe("#f00");
    expect(button.title).toBe(
      "Click to copy color #f00, with error from #ff0000 is 0",
    );
  });

  it("suggests translucent colors, keeping only the closest ones", async () => {
    renderTargetPanel();
    await import("./color-tools.js");
    await tick();

    type("background", "#ffffff");
    type("target", "#808080");

    // Worse matches exist (#444a is off by 6), they are filtered out.
    expect(results()).toEqual([
      ["#1118", "(0)"],
      ["#777e", "(0)"],
    ]);
  });

  it("mixes the suggestions over the background that was typed", async () => {
    renderTargetPanel();
    await import("./color-tools.js");
    await tick();

    type("background", "#0000ff");
    type("target", "#ff0000");

    expect(results()).toEqual([["#f00", "(0)"]]);
  });

  it("shows ten suggestions at most", async () => {
    renderTargetPanel();
    await import("./color-tools.js");
    await tick();

    // Any color at alpha 0 leaves a black background black, a single step off
    // the target: thousands of suggestions tie within the error margin.
    type("background", "#000000");
    type("target", "#000001");

    expect(results()).toHaveLength(10);
  });

  it("shows nothing when no color gets close enough", async () => {
    renderTargetPanel();
    await import("./color-tools.js");
    await tick();

    type("target", "#080808");

    expect(results()).toEqual([]);
  });

  it("clears the suggestions once the target is emptied or matches the background", async () => {
    renderTargetPanel();
    await import("./color-tools.js");
    await tick();
    type("target", "#ff0000");
    expect(results()).toHaveLength(1);

    type("target", "");
    expect(results()).toEqual([]);

    type("background", "#ff0000");
    type("target", "#ff0000");
    expect(results()).toEqual([]);
  });

  it("copies a palette color into the inputs and recomputes on click", async () => {
    renderTargetPanel(["#0000ff", "#ff0000"]);
    await import("./color-tools.js");
    await tick();

    press(
      tool().querySelector('[aria-label="Copy color #0000ff as background"]'),
    );
    press(
      tool().querySelector('[aria-label="Copy color #ff0000 as foreground"]'),
    );

    expect(input("background").value).toBe("#0000ff");
    expect(input("target").value).toBe("#ff0000");
    expect(results()).toEqual([["#f00", "(0)"]]);
  });

  it("resets the background to white", async () => {
    renderTargetPanel();
    await import("./color-tools.js");
    await tick();
    type("background", "#000000");
    type("target", "#808080");

    press(tool().querySelector('[aria-label="Reset background"]'));

    expect(input("background").value).toBe("");
    expect(results()).toEqual([
      ["#1118", "(0)"],
      ["#777e", "(0)"],
    ]);
  });

  it("removes the panel when the battle is left", async () => {
    renderTargetPanel();
    await import("./color-tools.js");
    await tick();
    expect(tool()).not.toBeNull();

    window.history.replaceState({}, "", "/leaderboard");
    await tick(300);

    expect(tool()).toBeNull();
  });
});
