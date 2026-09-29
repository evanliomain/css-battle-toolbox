/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OPTIONS_HTML from "./options.html?raw";

const TEMPLATE = `<style>
& {
  background: ;
  * {
  }
}
</style>`;

const DEFAULT_KEYS = {
  strKbdIncrement: "=",
  strKbdDecrement: ":",
  strKbdIncreaseIncrement: "<",
  strKbdDecreaseIncrement: "w",
  strKbdToggleIncrement: "I",
};

function $(id) {
  return document.getElementById(id);
}

function tick(ms) {
  return vi.advanceTimersByTimeAsync(ms);
}

describe("options page", () => {
  let stored;
  let documentListeners;

  /** Loads the page as Chrome does: body first, then options.js at its end. */
  async function open() {
    document.body.innerHTML = new DOMParser().parseFromString(
      OPTIONS_HTML,
      "text/html",
    ).body.innerHTML;
    await import("./options.js");
    document.dispatchEvent(new Event("DOMContentLoaded"));
    await tick(0);
  }

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    documentListeners = vi.spyOn(document, "addEventListener");
    stored = {};
    vi.stubGlobal("chrome", {
      storage: {
        sync: {
          get: vi.fn(() => Promise.resolve(stored)),
          set: vi.fn((items, cb) => cb?.()),
        },
      },
    });
  });

  afterEach(() => {
    // The document outlives the module: unbind the previous page's restore.
    documentListeners.mock.calls.forEach(([type, handler]) =>
      document.removeEventListener(type, handler),
    );
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  describe("restore", () => {
    it("fills the form with the stored options", async () => {
      stored = {
        hideGrid: true,
        hideHeader: false,
        nbBrightnessDifference: "4",
        strDefaultCode: "<p></p>",
        strKbdToggleIncrement: "k",
      };

      await open();

      expect($("hideGrid").checked).toBe(true);
      expect($("hideHeader").checked).toBe(false);
      expect($("nbBrightnessDifference").value).toBe("4");
      expect($("strDefaultCode").value).toBe("<p></p>");
      expect($("strKbdToggleIncrement").value).toBe("k");
      // jsdom has no innerText, but the page only writes it.
      expect($("toggle-key-letter").innerText).toBe("K");
    });

    it("skips a stored key that has no field on the page", async () => {
      stored = { someRemovedOption: true, hideGrid: true };

      await open();

      expect($("hideGrid").checked).toBe(true);
    });

    it("fills and saves the defaults on a first run", async () => {
      await open();

      expect($("strDefaultCode").value).toBe(TEMPLATE);
      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        strDefaultCode: TEMPLATE,
      });
      for (const [key, value] of Object.entries(DEFAULT_KEYS)) {
        expect($(key).value).toBe(value);
        expect(chrome.storage.sync.set).toHaveBeenCalledWith({ [key]: value });
      }
      expect($("toggle-key-letter").innerText).toBe("I");
    });

    it("does not overwrite what the user already chose", async () => {
      stored = { strDefaultCode: "", ...DEFAULT_KEYS, strKbdIncrement: "+" };

      await open();

      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
      expect($("strKbdIncrement").value).toBe("+");
      expect($("strDefaultCode").value).toBe("");
    });
  });

  describe("save", () => {
    it("stores every option, typed by its prefix", async () => {
      await open();
      chrome.storage.sync.set.mockClear();
      $("hideGrid").checked = true;
      $("nbBrightnessDifference").value = "7";
      $("strKbdIncrement").value = "+";
      $("strKbdToggleIncrement").value = "j";

      $("save").click();

      const [saved] = chrome.storage.sync.set.mock.calls[0];
      expect(Object.keys(saved)).toHaveLength(40);
      expect(saved).toMatchObject({
        hideGrid: true,
        hideHeader: false,
        nbBrightnessDifference: "7",
        strKbdIncrement: "+",
        strDefaultCode: TEMPLATE,
        // Stored upper-case: the shortcut is matched with Shift held.
        strKbdToggleIncrement: "J",
      });
    });

    it("saves an empty toggle key when the field has no value", async () => {
      await open();
      Object.defineProperty($("strKbdToggleIncrement"), "value", {
        get: () => undefined,
      });

      $("save").click();

      expect(
        chrome.storage.sync.set.mock.lastCall[0].strKbdToggleIncrement,
      ).toBe("");
    });

    it("confirms the save for a moment", async () => {
      await open();

      $("save").click();

      expect($("status").textContent).toBe("Options saved.");
      await tick(750);
      expect($("status").textContent).toBe("");
    });
  });

  it("resets the code template", async () => {
    stored = { strDefaultCode: "<p></p>" };
    await open();

    $("resetTemplate").click();

    expect($("strDefaultCode").value).toBe(TEMPLATE);
  });

  it("shows the toggle shortcut as it is typed", async () => {
    await open();

    $("strKbdToggleIncrement").value = "m";
    $("strKbdToggleIncrement").dispatchEvent(new Event("input"));

    expect($("toggle-key-letter").innerText).toBe("M");
  });
});
