import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hold,
  listen,
  PREFIX,
  release,
  render,
  resetRenderer,
} from "./hidden-renderer";

const TAB = { id: 70, windowId: 7 };
const TARGET = { tabId: 70 };

function event() {
  const listeners = [];
  return {
    addListener: vi.fn((listener) => listeners.push(listener)),
    fire: (...args) => listeners.forEach((listener) => listener(...args)),
  };
}

let location;
let stored;

function stubChrome() {
  location = "about:blank";
  stored = {};
  vi.stubGlobal("chrome", {
    tabs: {
      create: vi.fn(() => Promise.resolve(TAB)),
      remove: vi.fn(() => Promise.resolve()),
      group: vi.fn(() => Promise.resolve(3)),
      onRemoved: event(),
      onUpdated: event(),
    },
    tabGroups: { update: vi.fn(() => Promise.resolve()) },
    storage: {
      session: {
        get: vi.fn(() => Promise.resolve({ ...stored })),
        set: vi.fn((items) => {
          Object.assign(stored, items);
          return Promise.resolve();
        }),
      },
    },
    debugger: {
      attach: vi.fn(() => Promise.resolve()),
      detach: vi.fn(() => Promise.resolve()),
      onDetach: event(),
      sendCommand: vi.fn((target, method, params) => {
        if (
          "Runtime.evaluate" === method &&
          "location.href" === params.expression
        ) {
          return Promise.resolve({ result: { value: location } });
        }
        if ("Page.captureScreenshot" === method) {
          return Promise.resolve({ data: "cG5n" });
        }
        return Promise.resolve({});
      }),
    },
  });
}

function commands() {
  return chrome.debugger.sendCommand.mock.calls.map(([, method]) => method);
}

function settle() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("hidden renderer", () => {
  beforeEach(() => {
    stubChrome();
    resetRenderer();
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("hold", () => {
    it("opens a background tab in the window of the tab, once", async () => {
      await hold(1, 7);
      await hold(2, 8);

      expect(chrome.tabs.create).toHaveBeenCalledOnce();
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        windowId: 7,
        url: "about:blank",
        active: false,
      });
      expect(stored).toEqual({ rendererTabId: 70 });
    });

    it("folds the tab away in a collapsed group", async () => {
      await hold(1, 7);

      expect(chrome.tabs.group).toHaveBeenCalledWith({
        tabIds: 70,
        createProperties: { windowId: 7 },
      });
      expect(chrome.tabGroups.update).toHaveBeenCalledWith(3, {
        collapsed: true,
        title: "CSS Battle Toolbox: match",
        color: "grey",
      });
    });

    it("renders all the same in a window without tab groups", async () => {
      chrome.tabs.group.mockRejectedValueOnce(new Error("no groups"));

      await hold(1, 7);

      expect(chrome.debugger.attach).toHaveBeenCalled();
      expect(console.debug).toHaveBeenCalledWith(
        "[cbt] hidden-renderer: no tab group",
        expect.any(Error),
      );
    });

    it("sets the page up as cssbattle's renderer: 400×300 at 1x, no script, no network", async () => {
      await hold(1, 7);

      expect(chrome.debugger.attach).toHaveBeenCalledWith(TARGET, "1.3");
      expect(chrome.debugger.sendCommand.mock.calls).toEqual([
        [
          TARGET,
          "Emulation.setDeviceMetricsOverride",
          { width: 400, height: 300, deviceScaleFactor: 1, mobile: false },
        ],
        [TARGET, "Emulation.setScriptExecutionDisabled", { value: true }],
        [TARGET, "Network.enable", {}],
        [TARGET, "Network.setBlockedURLs", { urls: ["*://*/*"] }],
      ]);
    });

    it("opens again after a failure", async () => {
      chrome.debugger.attach.mockRejectedValueOnce(new Error("busy"));

      await expect(hold(1, 7)).rejects.toThrow("busy");
      await hold(1, 7);

      expect(chrome.tabs.create).toHaveBeenCalledTimes(2);
    });
  });

  describe("render", () => {
    it("writes cssbattle's prefix and the code, and shoots 400×300", async () => {
      await expect(render('<p>"a"</p>')).resolves.toBe(
        "data:image/png;base64,cG5n",
      );

      expect(chrome.debugger.sendCommand).toHaveBeenCalledWith(
        TARGET,
        "Runtime.evaluate",
        {
          expression: `document.open();document.write(${JSON.stringify(`${PREFIX}<p>"a"</p>`)});document.close();`,
        },
      );
      expect(chrome.debugger.sendCommand).toHaveBeenLastCalledWith(
        TARGET,
        "Page.captureScreenshot",
        {
          format: "png",
          clip: { x: 0, y: 0, width: 400, height: 300, scale: 1 },
        },
      );
      expect(PREFIX).toBe("<style>body{overflow:hidden}</style>");
      expect(commands()).not.toContain("Page.navigate");
    });

    it("brings the page back to blank when the code took it away", async () => {
      location = "https://example.com/";

      await render("<p>");

      expect(chrome.debugger.sendCommand).toHaveBeenCalledWith(
        TARGET,
        "Page.navigate",
        { url: "about:blank" },
      );
      expect(commands().indexOf("Page.navigate")).toBeLessThan(
        commands().lastIndexOf("Runtime.evaluate"),
      );
    });

    it("renders one code at a time", async () => {
      let finish;
      chrome.debugger.sendCommand.mockImplementationOnce(
        () => new Promise((resolve) => (finish = resolve)),
      );

      const first = render("<a>");
      const second = render("<b>");
      await settle();
      const shots = () =>
        commands().filter((method) => "Page.captureScreenshot" === method)
          .length;
      expect(shots()).toBe(0);

      finish({});
      await first;
      await second;
      expect(shots()).toBe(2);
    });

    it("goes on after a failed render", async () => {
      await hold(1, 7);
      chrome.debugger.sendCommand.mockRejectedValueOnce(new Error("gone"));

      await expect(render("<a>")).rejects.toThrow("gone");
      await expect(render("<b>")).resolves.toBe("data:image/png;base64,cG5n");
    });
  });

  describe("release", () => {
    it("closes the tab and the debugger once no tab holds it", async () => {
      await hold(1, 7);
      await hold(2, 7);

      await release(1);
      expect(chrome.tabs.remove).not.toHaveBeenCalled();

      await release(2);
      expect(chrome.debugger.detach).toHaveBeenCalledWith(TARGET);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(70);

      await hold(1, 7);
      expect(chrome.tabs.create).toHaveBeenCalledTimes(2);
    });

    it("does nothing with nothing open", async () => {
      await release(1);

      expect(chrome.tabs.remove).not.toHaveBeenCalled();
    });

    it("does nothing when the tab never opened", async () => {
      chrome.tabs.create.mockRejectedValueOnce(new Error("no"));
      const opening = hold(1, 7).catch(() => {});

      await release(1);
      await opening;

      expect(chrome.debugger.detach).not.toHaveBeenCalled();
    });

    it("closes even when the debugger is already gone", async () => {
      await hold(1, 7);
      chrome.debugger.detach.mockRejectedValueOnce(new Error("detached"));
      chrome.tabs.remove.mockRejectedValueOnce(new Error("closed"));

      await expect(release(1)).resolves.toBeUndefined();
    });
  });

  describe("listen", () => {
    beforeEach(() => {
      listen();
    });

    it("never attaches again once the user cancels Chrome's banner", async () => {
      await hold(1, 7);

      chrome.debugger.onDetach.fire(TARGET, "canceled_by_user");

      expect(chrome.tabs.remove).toHaveBeenCalledWith(70);
      await expect(render("<p>")).rejects.toThrow(
        "Debugging was cancelled: reload the page to measure again",
      );
      expect(chrome.tabs.create).toHaveBeenCalledOnce();
    });

    it("attaches again on the next page load after a refusal", async () => {
      await hold(1, 7);
      chrome.debugger.onDetach.fire(TARGET, "canceled_by_user");

      await hold(1, 7);

      expect(chrome.tabs.create).toHaveBeenCalledTimes(2);
    });

    it("opens afresh after the debugger detached on its own", async () => {
      await hold(1, 7);

      chrome.debugger.onDetach.fire(TARGET, "target_closed");
      await render("<p>");

      expect(chrome.tabs.create).toHaveBeenCalledTimes(2);
    });

    it("lets a tab already closed be, when the debugger detaches", async () => {
      await hold(1, 7);
      chrome.tabs.remove.mockRejectedValueOnce(new Error("closed"));

      chrome.debugger.onDetach.fire(TARGET, "target_closed");
      await settle();

      expect(chrome.tabs.remove).toHaveBeenCalledWith(70);
    });

    it("ignores the detach of another tab", async () => {
      await hold(1, 7);

      chrome.debugger.onDetach.fire({ tabId: 99 }, "canceled_by_user");
      await render("<p>");

      expect(chrome.tabs.create).toHaveBeenCalledOnce();
      expect(chrome.tabs.remove).not.toHaveBeenCalled();
    });

    it("ignores a detach with nothing open", () => {
      expect(() =>
        chrome.debugger.onDetach.fire(TARGET, "target_closed"),
      ).not.toThrow();
    });

    it("opens afresh after the user closed the hidden tab", async () => {
      await hold(1, 7);

      chrome.tabs.onRemoved.fire(71);
      await render("<p>");
      expect(chrome.tabs.create).toHaveBeenCalledOnce();

      chrome.tabs.onRemoved.fire(70);
      await render("<p>");
      expect(chrome.tabs.create).toHaveBeenCalledTimes(2);
    });

    it("releases a tab once closed", async () => {
      await hold(1, 7);

      chrome.tabs.onRemoved.fire(2);
      await settle();
      expect(chrome.tabs.remove).not.toHaveBeenCalled();

      chrome.tabs.onRemoved.fire(1);
      await settle();
      expect(chrome.tabs.remove).toHaveBeenCalledWith(70);
    });

    it("releases a tab once it leaves the play pages", async () => {
      await hold(1, 7);

      chrome.tabs.onUpdated.fire(1, { status: "loading" });
      chrome.tabs.onUpdated.fire(1, { url: "https://cssbattle.dev/play/2" });
      chrome.tabs.onUpdated.fire(2, { url: "https://cssbattle.dev/battles" });
      await settle();
      expect(chrome.tabs.remove).not.toHaveBeenCalled();

      chrome.tabs.onUpdated.fire(1, { url: "https://cssbattle.dev/battles" });
      await settle();
      expect(chrome.tabs.remove).toHaveBeenCalledWith(70);
    });
  });

  describe("on start", () => {
    it("closes the tab a previous worker left open", async () => {
      stored = { rendererTabId: 30 };

      listen();
      await settle();

      expect(chrome.tabs.remove).toHaveBeenCalledWith(30);
    });

    it("leaves its own tab open", async () => {
      await hold(1, 7);

      listen();
      await settle();

      expect(chrome.tabs.remove).not.toHaveBeenCalled();
    });

    it("does nothing without a tab left", async () => {
      listen();
      await settle();

      expect(chrome.tabs.remove).not.toHaveBeenCalled();
    });

    it("lets a tab already gone be", async () => {
      stored = { rendererTabId: 30 };
      chrome.tabs.remove.mockRejectedValueOnce(new Error("gone"));

      listen();
      await settle();

      expect(chrome.tabs.remove).toHaveBeenCalledWith(30);
    });
  });
});
