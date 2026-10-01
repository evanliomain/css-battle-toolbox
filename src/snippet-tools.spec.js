/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function renderBattle(colors = ["#1A4341", "#F3AC3C"]) {
  document.body.innerHTML = `
    <div class="colors-list">
      ${colors.map((color) => `<div class="colors-list__color">${color}</div>`).join("")}
    </div>
    <div class="cm-editor"><div class="cm-content" contenteditable="true"></div></div>`;
  // jsdom has no innerText.
  document.querySelectorAll(".colors-list__color").forEach((node) => {
    node.innerText = node.textContent;
  });
}

function pageScripts() {
  return document.querySelectorAll("#cbt-snippet-script");
}

function swatches() {
  return document.getElementById("cbt-snippet-swatches");
}

// Fake timers, so the polls a test leaves running die with it instead of
// firing once the jsdom environment is gone.
function tick(ms = 400) {
  return vi.advanceTimersByTimeAsync(ms);
}

describe("snippet-tools", () => {
  let attached;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.stubGlobal("chrome", {
      runtime: { getURL: (path) => `chrome-extension://test/${path}` },
    });
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    attached = vi.fn();
    document.addEventListener("cbt-snippet-attach", attached);
  });

  afterEach(() => {
    document.removeEventListener("cbt-snippet-attach", attached);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/play/123");
  });

  it("injects the page script as a module from the extension", async () => {
    renderBattle();

    await import("./snippet-tools.js");
    await tick();

    expect(pageScripts()).toHaveLength(1);
    const [script] = pageScripts();
    expect(script.type).toBe("module");
    expect(script.src).toMatch(/^chrome-extension:\/\/test\/.*snippet-page/);
  });

  it("asks the page script to reach the editor", async () => {
    renderBattle();

    await import("./snippet-tools.js");
    await tick();

    expect(attached).toHaveBeenCalledTimes(1);
  });

  it("waits for the editor and the palette", async () => {
    document.body.innerHTML = `<div class="cm-content"></div>`;

    await import("./snippet-tools.js");
    await tick();
    expect(pageScripts()).toHaveLength(0);

    renderBattle();
    await tick(100);

    expect(pageScripts()).toHaveLength(1);
  });

  it("colors each swatch like its target color", async () => {
    renderBattle();

    await import("./snippet-tools.js");
    await tick();

    expect(swatches().textContent).toBe(
      ".cm-completionIcon-cbt-color-1a4341{--cbt-swatch:#1A4341}\n" +
        ".cm-completionIcon-cbt-color-f3ac3c{--cbt-swatch:#F3AC3C}",
    );
  });

  it("writes nothing but hex colors into the stylesheet", async () => {
    renderBattle(["#fff", "}body{x:#000", "#000}body{x:y", "#12345"]);

    await import("./snippet-tools.js");
    await tick();

    expect(swatches().textContent).toBe(
      ".cm-completionIcon-cbt-color-fff{--cbt-swatch:#fff}\n" +
        ".cm-completionIcon-cbt-color-12345{--cbt-swatch:#12345}",
    );
  });

  it("injects the page script once, but reaches each battle's editor", async () => {
    renderBattle();
    await import("./snippet-tools.js");
    await tick();

    window.history.replaceState({}, "", "/leaderboard");
    // The SPA router polls the URL every 300ms.
    await tick(300);
    expect(swatches()).toBeNull();

    renderBattle(["#000"]);
    window.history.replaceState({}, "", "/play/456");
    await tick(1000);

    expect(pageScripts()).toHaveLength(1);
    expect(attached).toHaveBeenCalledTimes(2);
    expect(swatches().textContent).toContain("--cbt-swatch:#000");
  });
});
