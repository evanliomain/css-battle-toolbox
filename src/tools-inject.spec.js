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
    runtime: {
      getURL: (p) => `chrome-extension://test/${p}`,
      openOptionsPage: vi.fn(),
    },
  };
}

/** Lets the doAsync poll (100ms) and any settle delay run. */
function tick(ms = 400) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("tools inject into a cssbattle-shaped DOM", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("chrome", stubChrome());
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("editor-buttons adds Minify and Prettify to the editor button group", async () => {
    document.body.innerHTML = `
      <div class="container__item--editor">
        <div class="btn-group">
          <button>a</button><button>b</button><button>c</button><button>d</button>
        </div>
      </div>`;

    await import("./editor-buttons.js");
    await tick();

    const labels = [...document.querySelectorAll(".btn-group button")].map(
      (b) => b.innerText ?? b.textContent,
    );
    expect(labels).toContain("Minify");
    expect(labels).toContain("Prettify");
  });

  it("editor-buttons injects exactly once, not twice", async () => {
    document.body.innerHTML = `
      <div class="container__item--editor"><div class="btn-group"></div></div>`;

    await import("./editor-buttons.js");
    await tick();

    const minify = [...document.querySelectorAll(".btn-group button")].filter(
      (b) => "Minify" === (b.innerText ?? b.textContent),
    );
    expect(minify).toHaveLength(1);
  });

  it("character-tools inserts the minified-character counter", async () => {
    document.body.innerHTML = `
      <div class="Editor-module__abc">
        <div class="item__header">
          <div class="header__extra-info"><div class="hstack"></div></div>
        </div>
      </div>
      <div contenteditable>div{width:100px}</div>`;

    await import("./character-tools.js");
    await tick();

    const counter = document.getElementById("nb-minified-characters");
    expect(counter).not.toBeNull();
  });

  it("target-tools adds the copy-url and previewer buttons", async () => {
    document.body.innerHTML = `
      <div class="container__item--target">
        <div class="item__header"><div class="first"></div></div>
        <img src="https://cssbattle.dev/targets/1.png" />
      </div>`;

    await import("./target-tools.js");
    await tick();

    expect(document.getElementById("cbt-copy-image-url")).not.toBeNull();
    expect(document.getElementById("cbt-link-to-previewer-url")).not.toBeNull();
  });

  it("does nothing on a non-play page", async () => {
    document.body.innerHTML = `
      <div class="container__item--editor"><div class="btn-group"></div></div>`;
    // /leaderboard is not a battle, so the editor tools must stay out of it.
    window.history.replaceState({}, "", "/leaderboard");

    await import("./editor-buttons.js");
    await tick();

    expect(document.querySelectorAll(".btn-group button")).toHaveLength(0);

    window.history.replaceState({}, "", "/play/123");
  });
});
