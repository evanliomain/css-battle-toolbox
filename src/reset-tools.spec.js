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
});
