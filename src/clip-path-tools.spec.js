/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function renderBattle() {
  document.body.innerHTML = `<div class="cm-editor"><div class="cm-content" contenteditable="true"></div></div>`;
}

function pageScripts() {
  return document.querySelectorAll("#cbt-clip-path-script");
}

// Fake timers, so the polls a test leaves running die with it instead of
// firing once the jsdom environment is gone.
function tick(ms = 400) {
  return vi.advanceTimersByTimeAsync(ms);
}

describe("clip-path-tools", () => {
  let attached;
  let detached;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.stubGlobal("chrome", {
      runtime: { getURL: (path) => `chrome-extension://test/${path}` },
    });
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    attached = vi.fn();
    detached = vi.fn();
    document.addEventListener("cbt-clip-path-attach", attached);
    document.addEventListener("cbt-clip-path-detach", detached);
  });

  afterEach(() => {
    document.removeEventListener("cbt-clip-path-attach", attached);
    document.removeEventListener("cbt-clip-path-detach", detached);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/play/123");
  });

  it("injects the page script as a module from the extension", async () => {
    renderBattle();

    await import("./clip-path-tools.js");
    await tick();

    expect(pageScripts()).toHaveLength(1);
    const [script] = pageScripts();
    expect(script.type).toBe("module");
    expect(script.src).toMatch(/^chrome-extension:\/\/test\/.*clip-path-page/);
  });

  it("asks the page script to follow the editor", async () => {
    renderBattle();

    await import("./clip-path-tools.js");
    await tick();

    expect(attached).toHaveBeenCalledTimes(1);
  });

  it("waits for the editor", async () => {
    await import("./clip-path-tools.js");
    await tick();
    expect(attached).not.toHaveBeenCalled();

    renderBattle();
    await tick();

    expect(attached).toHaveBeenCalledTimes(1);
  });

  it("injects the page script once, and attaches again on each battle", async () => {
    renderBattle();
    await import("./clip-path-tools.js");
    await tick();

    window.history.pushState({}, "", "/play/456");
    await tick(1000);

    expect(pageScripts()).toHaveLength(1);
    expect(detached).toHaveBeenCalledTimes(1);
    expect(attached).toHaveBeenCalledTimes(2);
  });

  it("asks the page script to take its overlay down off a battle", async () => {
    renderBattle();
    await import("./clip-path-tools.js");
    await tick();

    window.history.pushState({}, "", "/");
    await tick(1000);

    expect(detached).toHaveBeenCalledTimes(1);
  });
});
