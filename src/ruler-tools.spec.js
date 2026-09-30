/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Where the target image sits in the page, and its panel. */
const PANEL = { left: 20, top: 50 };
const IMAGE = { left: 40, top: 70 };

function renderTargetPanel({ width = 400 } = {}) {
  document.body.innerHTML = `
    <div class="container__item--target">
      <div class="item__content">
        <img class="levelpage__target" width="400" />
        <div class="colors"></div>
      </div>
    </div>`;
  // jsdom has no layout.
  layout(document.querySelector(".item__content"), PANEL, 440, 600);
  layout(targetImage(), IMAGE, width, (width * 3) / 4);
}

function layout(node, { left, top }, width, height) {
  node.getBoundingClientRect = () => ({ left, top, width, height });
}

function targetImage() {
  return document.querySelector(".levelpage__target");
}

function ruler() {
  return document.getElementById("cbt-ruler");
}

function distance(axis) {
  return ruler().querySelector(`.cbt-ruler__distance--${axis}`).textContent;
}

/** Moves the mouse to a point of the displayed image. */
function hover(x, y) {
  targetImage().dispatchEvent(
    new MouseEvent("mousemove", {
      clientX: IMAGE.left + x,
      clientY: IMAGE.top + y,
    }),
  );
}

// Fake timers, so the polls a test leaves running die with it instead of
// firing once the jsdom environment is gone.
function tick(ms = 400) {
  return vi.advanceTimersByTimeAsync(ms);
}

describe("ruler-tools", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/play/123");
  });

  it("adds the ruler to the target panel, hidden until hovered", async () => {
    renderTargetPanel();

    await import("./ruler-tools.js");
    await tick();

    expect(ruler().parentElement).toBe(
      document.querySelector(".item__content"),
    );
    expect(ruler().hidden).toBe(true);
  });

  it("waits for the target image to render", async () => {
    document.body.innerHTML = `
      <div class="container__item--target"><div class="item__content"></div></div>`;

    await import("./ruler-tools.js");
    await tick();
    expect(ruler()).toBeNull();

    renderTargetPanel();
    await tick(100);

    expect(ruler()).not.toBeNull();
  });

  it("shows (0,0) at the top left corner of the target", async () => {
    renderTargetPanel();

    await import("./ruler-tools.js");
    await tick();
    hover(0, 0);

    expect(ruler().hidden).toBe(false);
    expect(distance("x")).toBe("0");
    expect(distance("y")).toBe("0");
  });

  it("crosses the rulers under the cursor", async () => {
    renderTargetPanel();

    await import("./ruler-tools.js");
    await tick();
    hover(123.6, 45.2);

    expect(distance("x")).toBe("123");
    expect(distance("y")).toBe("45");
    expect(ruler().style.getPropertyValue("--x")).toBe("123px");
    expect(ruler().style.getPropertyValue("--y")).toBe("45px");
  });

  it("lays the ruler over the image", async () => {
    renderTargetPanel();

    await import("./ruler-tools.js");
    await tick();
    hover(10, 10);

    const { left, top, width, height } = ruler().style;
    expect({ left, top, width, height }).toEqual({
      left: "20px",
      top: "20px",
      width: "400px",
      height: "300px",
    });
  });

  it("gives target pixels when the image is shown smaller", async () => {
    renderTargetPanel({ width: 200 });

    await import("./ruler-tools.js");
    await tick();
    hover(100, 51);

    expect(distance("x")).toBe("200");
    expect(distance("y")).toBe("102");
    // The rulers stay on the displayed pixel.
    expect(ruler().style.getPropertyValue("--x")).toBe("100px");
    expect(ruler().style.getPropertyValue("--y")).toBe("51px");
  });

  it("stops at the last pixel of the target", async () => {
    renderTargetPanel();

    await import("./ruler-tools.js");
    await tick();
    hover(400, 300);

    expect(distance("x")).toBe("399");
    expect(distance("y")).toBe("299");
  });

  it("never goes below 0", async () => {
    renderTargetPanel();

    await import("./ruler-tools.js");
    await tick();
    hover(-0.5, -0.5);

    expect(distance("x")).toBe("0");
    expect(distance("y")).toBe("0");
  });

  it("hides the ruler once the mouse leaves the target", async () => {
    renderTargetPanel();

    await import("./ruler-tools.js");
    await tick();
    hover(10, 10);
    targetImage().dispatchEvent(new MouseEvent("mouseleave"));

    expect(ruler().hidden).toBe(true);
  });

  it("removes the ruler and stops listening when leaving the battle", async () => {
    renderTargetPanel();

    await import("./ruler-tools.js");
    await tick();
    const removed = ruler();

    window.history.replaceState({}, "", "/leaderboard");
    // The SPA router polls the URL every 300ms.
    await tick(300);
    hover(10, 10);

    expect(ruler()).toBeNull();
    expect(removed.hidden).toBe(true);
  });
});
