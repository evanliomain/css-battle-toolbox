/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TARGET = "https://cssbattle.dev/targets/1.png";
const PREVIEWER = "https://cssutils.com/cssbattle-previewer/?mode=custom&image=";

function renderTargetPanel(src = TARGET) {
  document.body.innerHTML = `
    <div class="container__item--target">
      <div class="item__header"><div class="first"></div></div>
      <img src="${src}" />
    </div>`;
}

function copyButton() {
  return document.getElementById("cbt-copy-image-url");
}

function previewerLink() {
  return document.getElementById("cbt-link-to-previewer-url");
}

// Fake timers, so the polls a test leaves running die with it instead of
// firing once the jsdom environment is gone.
function tick(ms = 400) {
  return vi.advanceTimersByTimeAsync(ms);
}

describe("target-tools", () => {
  let writeText;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    writeText = vi.fn(() => Promise.resolve());
    // jsdom has no clipboard.
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete navigator.clipboard;
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/play/123");
  });

  it("puts both buttons in the first child of the target header", async () => {
    renderTargetPanel();

    await import("./target-tools.js");
    await tick();

    const container = document.querySelector(".item__header .first");
    expect([...container.children]).toEqual([copyButton(), previewerLink()]);
  });

  it("waits for the target header to render", async () => {
    document.body.innerHTML = `
      <div class="container__item--target"><img src="${TARGET}" /></div>`;

    await import("./target-tools.js");
    await tick();
    expect(copyButton()).toBeNull();

    document
      .querySelector(".container__item--target")
      .insertAdjacentHTML(
        "afterbegin",
        `<div class="item__header"><div class="first"></div></div>`,
      );
    await tick(100);

    expect(copyButton()).not.toBeNull();
    expect(previewerLink()).not.toBeNull();
  });

  it("copies the target image url to the clipboard", async () => {
    renderTargetPanel();

    await import("./target-tools.js");
    await tick();
    copyButton().click();

    expect(writeText).toHaveBeenCalledWith(TARGET);
  });

  it("links to the previewer with the target image", async () => {
    renderTargetPanel();

    await import("./target-tools.js");
    await tick();

    expect(previewerLink().getAttribute("href")).toBe(
      PREVIEWER + encodeURIComponent(TARGET),
    );
    expect(previewerLink().getAttribute("target")).toBe("_blank");
  });

  it("points the previewer at the current target, not the one it was built with", async () => {
    renderTargetPanel();

    await import("./target-tools.js");
    await tick();

    const next = "https://cssbattle.dev/targets/2.png";
    // The previewer link has an <img> of its own, ahead of the target's.
    document.querySelector(".container__item--target > img").src = next;
    // jsdom does not navigate, but keep it from trying.
    document.addEventListener("click", (e) => e.preventDefault(), {
      capture: true,
      once: true,
    });
    previewerLink().click();

    expect(previewerLink().getAttribute("href")).toBe(
      PREVIEWER + encodeURIComponent(next),
    );
  });

  it("removes both buttons when leaving the battle", async () => {
    renderTargetPanel();

    await import("./target-tools.js");
    await tick();

    window.history.replaceState({}, "", "/leaderboard");
    // The SPA router polls the URL every 300ms.
    await tick(300);

    expect(copyButton()).toBeNull();
    expect(previewerLink()).toBeNull();
  });
});
