/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function counter() {
  return document.getElementById("nb-minified-characters");
}

function editor() {
  return document.querySelector("[contenteditable]");
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

describe("character-tools", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    document.body.innerHTML = `
      <div class="Editor-module__abc">
        <div class="item__header">
          <div class="header__extra-info"><div class="hstack"><span id="other"></span></div></div>
        </div>
      </div>
      <div contenteditable="true">div { width: 100px }</div>`;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.history.replaceState({}, "", "/play/123");
    document.body.innerHTML = "";
  });

  it("shows the length of the minified code first in the header", async () => {
    await import("./character-tools.js");
    await tick(150);

    // Minified to "div{width:100px", the closing brace being optional.
    expect(counter().innerText).toBe("{15}");
    expect(document.querySelector(".hstack").firstElementChild).toBe(counter());
  });

  it("counts again as the code changes", async () => {
    await import("./character-tools.js");
    await tick(150);

    editor().replaceChildren(document.createTextNode("<p></p>"));
    await tick(0);

    expect(counter().innerText).toBe("{7}");
  });

  it("waits for the editor before mounting", async () => {
    editor().remove();

    await import("./character-tools.js");
    await tick(150);
    expect(counter()).toBeNull();

    document.body.insertAdjacentHTML(
      "beforeend",
      `<div contenteditable="true">a</div>`,
    );
    await tick(150);

    expect(counter().innerText).toBe("{1}");
  });

  it("removes the counter and stops counting once the user leaves the battle", async () => {
    await import("./character-tools.js");
    await tick(150);
    const insertedCounter = counter();

    navigateAway();
    editor().replaceChildren(document.createTextNode("<p></p>"));
    await tick(0);

    expect(counter()).toBeNull();
    expect(insertedCounter.innerText).toBe("{15}");
  });
});
