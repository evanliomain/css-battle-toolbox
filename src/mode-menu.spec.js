/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPEN_OPTIONS } from "./utils/open-options";

function stubChrome(get = () => Promise.resolve({})) {
  return {
    storage: {
      sync: { get: vi.fn(get) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: { sendMessage: vi.fn() },
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

/**
 * Holds the settings read back instead of resolving it, and returns a getter
 * for the callback the menu chained on it. Calling that callback directly lets
 * a test see it throw, where a rejected promise would only surface as an
 * unhandled rejection.
 */
function settingsCallback() {
  let callback;
  vi.stubGlobal(
    "chrome",
    stubChrome(() => ({ then: (fn) => (callback = fn) })),
  );
  return () => callback;
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

  it("draws an icon on the menu button and on each entry", async () => {
    await import("./mode-menu.js");
    await tick();

    expect(menu().querySelector(".dropdown-btn > svg")).not.toBeNull();
    expect(
      document.querySelector("#increment-mode-toggle > svg"),
    ).not.toBeNull();
    expect(document.querySelector("#go-to-options > svg")).not.toBeNull();
  });

  it("names itself in the warning when the editor header never renders", async () => {
    document.body.innerHTML = "";

    await import("./mode-menu.js");
    await tick(20000);

    expect(menu()).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      "[cbt] mode-menu gave up after 20000ms",
    );
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
    const applySettings = settingsCallback();

    await import("./mode-menu.js");
    await tick();

    expect(() => applySettings()(undefined)).not.toThrow();
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

  it("asks the background worker to open the options page", async () => {
    await import("./mode-menu.js");
    await tick();

    document.getElementById("go-to-options").click();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledExactlyOnceWith({
      type: OPEN_OPTIONS,
    });
    expect(window.location.hash).toBe("");
  });

  it("opens on a click on its button and closes on a click outside", async () => {
    await import("./mode-menu.js");
    await tick();

    menu().querySelector(".dropdown-btn").click();
    expect(checkbox().checked).toBe(true);

    document.getElementById("outside").click();
    expect(checkbox().checked).toBe(false);
  });

  it("closes on a second click on its button", async () => {
    await import("./mode-menu.js");
    await tick();

    menu().querySelector(".dropdown-btn").click();
    menu().querySelector(".dropdown-btn").click();

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
    // A listener that throws does not throw out of click(): jsdom reports it
    // on the window instead.
    const errors = [];
    const onError = (event) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener("error", onError);

    document.getElementById("outside").click();

    window.removeEventListener("error", onError);
    expect(errors).toEqual([]);
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
    const applySettings = settingsCallback();
    await import("./mode-menu.js");
    await tick();

    await leaveBattle();

    expect(() => applySettings()({ strKbdToggleIncrement: "K" })).not.toThrow();
    expect(keyLetter()).toBeUndefined();
  });
});
