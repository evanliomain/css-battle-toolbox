/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function renderEditor(buttons) {
  document.body.innerHTML = `
    <div class="container__item--editor">
      <div class="btn-group">${buttons
        .map((label) => `<button>${label}</button>`)
        .join("")}</div>
    </div>
    <div contenteditable="true"></div>`;
}

function buttons() {
  return [...document.querySelectorAll(".btn-group > button")];
}

function button(label) {
  return buttons().find((b) => label === (b.innerText ?? b.textContent));
}

function hidden() {
  return buttons()
    .filter((b) => undefined !== b.dataset.hide)
    .map((b) => b.innerText ?? b.textContent);
}

function editor() {
  return document.querySelector("[contenteditable]");
}

// Fake timers, so the polls a test leaves running die with it instead of
// firing once the jsdom environment is gone.
function tick(ms = 400) {
  return vi.advanceTimersByTimeAsync(ms);
}

describe("editor-buttons", () => {
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

  it("prepends Minify and Prettify", async () => {
    renderEditor(["a", "b"]);

    await import("./editor-buttons.js");
    await tick();

    expect(buttons().map((b) => b.innerText ?? b.textContent)).toEqual([
      "Prettify",
      "Minify",
      "a",
      "b",
    ]);
  });

  it("marks cssbattle's first four buttons to be hidden", async () => {
    renderEditor(["a", "b", "c", "d", "e"]);

    await import("./editor-buttons.js");
    await tick();

    // addButton marks our own two as well; only "e" is left visible.
    expect(hidden()).toEqual(["Prettify", "Minify", "a", "b", "c", "d"]);
  });

  it("hides cssbattle's buttons that render after the group", async () => {
    renderEditor(["a"]);

    await import("./editor-buttons.js");
    await tick();
    expect(hidden()).toEqual(["Prettify", "Minify", "a"]);

    document
      .querySelector(".btn-group")
      .insertAdjacentHTML("beforeend", "<button>b</button><button>c</button>");
    await tick(100);

    expect(hidden()).toEqual(["Prettify", "Minify", "a", "b", "c"]);
  });

  it("minifies the code on click", async () => {
    renderEditor([]);
    editor().textContent = "<p>  </p>\n<style>p { margin: 0 }</style>";

    await import("./editor-buttons.js");
    await tick();
    button("Minify").click();
    await tick(0);

    expect(editor().textContent).toBe("<p></p><style>p{margin:0");
  });

  it("prettifies the code on click", async () => {
    renderEditor([]);
    editor().textContent = "<p></p><style>p{margin:0}</style>";

    await import("./editor-buttons.js");
    await tick();
    button("Prettify").click();
    await tick(0);

    const { prettify } = await import("./utils/prettify.js");
    expect(editor().textContent).toBe(
      await prettify("<p></p><style>p{margin:0}</style>"),
    );
    expect(editor().textContent).toContain("\n");
  });

  it("removes its buttons and unhides cssbattle's when leaving the battle", async () => {
    renderEditor(["a", "b", "c", "d"]);

    await import("./editor-buttons.js");
    await tick();

    window.history.replaceState({}, "", "/leaderboard");
    // The SPA router polls the URL every 300ms.
    await tick(300);

    expect(buttons().map((b) => b.innerText ?? b.textContent)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(hidden()).toEqual([]);
  });
});
