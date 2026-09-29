/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOILERPLATE } from "./utils/saved-code";

const TEMPLATE = "<style>& { background: red }</style>";
const USER_CODE = "<p></p><style>p{margin:0}</style>";

function stubChrome() {
  return {
    storage: {
      sync: {
        get: vi.fn(() => Promise.resolve({ strDefaultCode: TEMPLATE })),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  };
}

function editor() {
  return document.querySelector("[contenteditable]");
}

// Fake timers, so the polls a test leaves running die with it instead of
// firing once the jsdom environment is gone.
function tick(ms) {
  return vi.advanceTimersByTimeAsync(ms);
}

describe("reset-tools", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal("chrome", stubChrome());
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    document.body.innerHTML = `<div contenteditable="true">${BOILERPLATE}</div>`;
    // `innerHTML` would parse the boilerplate as markup.
    editor().textContent = BOILERPLATE;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/play/123");
    document.body.innerHTML = "";
  });

  it("replaces the boilerplate of a fresh battle with the template", async () => {
    await import("./reset-tools.js");
    await tick(600);

    expect(editor().textContent).toBe(TEMPLATE);
  });

  it("leaves the boilerplate alone while cssbattle has saved code to restore", async () => {
    window.localStorage.setItem("lastCode-123", USER_CODE);

    await import("./reset-tools.js");
    await tick(600);

    expect(editor().textContent).toBe(BOILERPLATE);
  });

  it("keeps the code cssbattle restores after a refresh", async () => {
    window.localStorage.setItem("lastCode-123", USER_CODE);

    await import("./reset-tools.js");
    await tick(200);
    // cssbattle reads its key, drops it, then puts the code back a bit later.
    window.localStorage.removeItem("lastCode-123");
    await tick(50);
    editor().textContent = USER_CODE;
    await tick(600);

    expect(editor().textContent).toBe(USER_CODE);
  });

  it("still resets once cssbattle drops its key without restoring anything", async () => {
    window.localStorage.setItem("lastCode-123", USER_CODE);

    await import("./reset-tools.js");
    await tick(200);
    window.localStorage.removeItem("lastCode-123");
    await tick(600);

    expect(editor().textContent).toBe(TEMPLATE);
  });

  it("puts back the code the extension saved, rather than the template", async () => {
    window.localStorage.setItem("cbt-lastCode-123", USER_CODE);

    await import("./reset-tools.js");
    await tick(600);

    expect(editor().textContent).toBe(USER_CODE);
  });

  it("only puts back the code saved for this target", async () => {
    window.localStorage.setItem("cbt-lastCode-124", USER_CODE);

    await import("./reset-tools.js");
    await tick(600);

    expect(editor().textContent).toBe(TEMPLATE);
  });

  it("never replaces code that is not the boilerplate", async () => {
    window.localStorage.setItem("cbt-lastCode-123", USER_CODE);
    editor().textContent = "<a></a>";

    await import("./reset-tools.js");
    await tick(600);

    expect(editor().textContent).toBe("<a></a>");
  });

  it("falls back on its own template when none is set in the options", async () => {
    chrome.storage.sync.get.mockResolvedValue({});

    await import("./reset-tools.js");
    await tick(600);

    expect(editor().textContent).toContain("background: ;");
  });

  it("keys a long target id on the raw string, as cssbattle does", async () => {
    window.history.replaceState({}, "", "/play/abcdefgh");
    window.localStorage.setItem("lastCode-abcdefgh", USER_CODE);

    await import("./reset-tools.js");
    await tick(600);

    expect(editor().textContent).toBe(BOILERPLATE);
  });

  it("keys a short target id on its number", async () => {
    window.history.replaceState({}, "", "/play/007");
    window.localStorage.setItem("lastCode-7", USER_CODE);

    await import("./reset-tools.js");
    await tick(600);

    expect(editor().textContent).toBe(BOILERPLATE);
  });

  it("never resets while the storage cannot be read", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    await import("./reset-tools.js");
    await tick(600);

    expect(editor().textContent).toBe(BOILERPLATE);
  });

  it("backs off when cssbattle saves code while the reset settles", async () => {
    await import("./reset-tools.js");
    await tick(100);
    window.localStorage.setItem("lastCode-123", USER_CODE);
    await tick(600);

    expect(editor().textContent).toBe(BOILERPLATE);
  });

  it("keeps what the user typed while the reset settled", async () => {
    await import("./reset-tools.js");
    await tick(100);
    editor().textContent = "<a></a>";
    await tick(600);

    expect(editor().textContent).toBe("<a></a>");
    expect(chrome.storage.sync.get).toHaveBeenCalled();
  });

  it("drops a reset still settling when the user leaves the battle", async () => {
    editor().textContent = "";

    await import("./reset-tools.js");
    // The boilerplate shows up just before the URL poll notices the navigation,
    // so the reset is still settling when the mount is torn down.
    await tick(150);
    editor().textContent = BOILERPLATE;
    window.history.replaceState({}, "", "/leaderboard");
    await tick(1000);

    expect(editor().textContent).toBe(BOILERPLATE);
    expect(chrome.storage.sync.get).not.toHaveBeenCalled();
  });
});
