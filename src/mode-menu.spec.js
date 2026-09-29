/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stubChrome(get = () => Promise.resolve({})) {
  return {
    storage: {
      sync: { get: vi.fn(get) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: {
      getURL: (p) => `chrome-extension://test/${p}`,
      openOptionsPage: vi.fn(),
    },
  };
}

function renderEditorHeader() {
  document.body.innerHTML = `
    <div class="Editor-module__abc">
      <div class="item__header">
        <div class="header__extra-info"><div class="hstack"></div></div>
      </div>
    </div>
    <p id="outside">elsewhere</p>`;
}

function menu() {
  return document.querySelector(".hstack > .cbt-dropdown");
}

function checkbox() {
  return document.getElementById("mode-menu-editor-checkbox");
}

function keyLetter() {
  return document.getElementById("toggle-key-letter")?.textContent;
}

/** The listener the menu registered on chrome.storage.onChanged. */
function storageListener() {
  return chrome.storage.onChanged.addListener.mock.calls[0][0];
}

async function leaveBattle() {
  window.history.replaceState({}, "", "/leaderboard");
  await tick(300);
}

// Fake timers, so the pollers every tool leaves running die with the test.
function tick(ms = 200) {
  return vi.advanceTimersByTimeAsync(ms);
}

describe("mode-menu", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal("chrome", stubChrome());
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    renderEditorHeader();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.history.replaceState({}, "", "/play/123");
    document.body.innerHTML = "";
  });

  it("adds the menu to the editor header", async () => {
    await import("./mode-menu.js");
    await tick();

    expect(menu()).not.toBeNull();
    expect([...menu().querySelectorAll("nav > a")].map((a) => a.id)).toEqual([
      "increment-mode-toggle",
      "go-to-options",
    ]);
  });

  it("shows Ctrl+Shift+I as the increment shortcut by default", async () => {
    await import("./mode-menu.js");
    await tick();

    expect(chrome.storage.sync.get).toHaveBeenCalledWith(null);
    expect(keyLetter()).toBe("I");
  });

  it("shows the shortcut key picked in the options", async () => {
    vi.stubGlobal(
      "chrome",
      stubChrome(() => Promise.resolve({ strKbdToggleIncrement: "K" })),
    );

    await import("./mode-menu.js");
    await tick();

    expect(keyLetter()).toBe("K");
  });

  it("keeps the default key when the settings cannot be read", async () => {
    vi.stubGlobal(
      "chrome",
      stubChrome(() => Promise.resolve(undefined)),
    );

    await import("./mode-menu.js");
    await tick();

    expect(keyLetter()).toBe("I");
  });

  it("follows the shortcut key when the options change", async () => {
    await import("./mode-menu.js");
    await tick();

    storageListener()({
      strKbdToggleIncrement: { oldValue: "I", newValue: "J" },
    });
    expect(keyLetter()).toBe("J");

    // Another setting changing leaves the key as it is.
    storageListener()({ hideLeaderboard: { oldValue: false, newValue: true } });
    expect(keyLetter()).toBe("J");
  });

  it("opens the options page", async () => {
    await import("./mode-menu.js");
    await tick();

    document.getElementById("go-to-options").click();

    expect(chrome.runtime.openOptionsPage).toHaveBeenCalledOnce();
  });

  it("opens the options in a new tab where openOptionsPage is missing", async () => {
    delete chrome.runtime.openOptionsPage;
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    await import("./mode-menu.js");
    await tick();

    document.getElementById("go-to-options").click();

    expect(open).toHaveBeenCalledWith(
      "chrome-extension://test/src/options.html",
    );
  });

  it("opens on a click on its button and closes on a click outside", async () => {
    await import("./mode-menu.js");
    await tick();

    menu().querySelector(".dropdown-btn").click();
    expect(checkbox().checked).toBe(true);

    document.getElementById("outside").click();
    expect(checkbox().checked).toBe(false);
  });

  it("keeps the page's own click handlers away from its toggle", async () => {
    await import("./mode-menu.js");
    await tick();
    const pageHandler = vi.fn();
    document.addEventListener("click", pageHandler);

    checkbox().click();

    expect(checkbox().checked).toBe(true);
    expect(pageHandler).not.toHaveBeenCalled();
    document.removeEventListener("click", pageHandler);
  });

  it("ignores outside clicks once the page has removed the menu", async () => {
    await import("./mode-menu.js");
    await tick();
    menu().remove();

    expect(() => document.getElementById("outside").click()).not.toThrow();
  });

  it("removes the menu and its listeners when the battle is left", async () => {
    const addListener = vi.spyOn(document, "addEventListener");
    const removeListener = vi.spyOn(document, "removeEventListener");
    await import("./mode-menu.js");
    await tick();
    const onStorageChange = storageListener();
    const [, onDocumentClick] = addListener.mock.calls.find(
      ([type]) => "click" === type,
    );

    await leaveBattle();

    expect(menu()).toBeNull();
    expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledWith(
      onStorageChange,
    );
    expect(removeListener).toHaveBeenCalledWith("click", onDocumentClick);
  });

  it("does not fail when the settings arrive after the battle was left", async () => {
    let settle;
    vi.stubGlobal(
      "chrome",
      stubChrome(() => new Promise((resolve) => (settle = resolve))),
    );
    await import("./mode-menu.js");
    await tick();

    await leaveBattle();
    settle({ strKbdToggleIncrement: "K" });
    await tick(0);

    expect(keyLetter()).toBeUndefined();
  });
});
