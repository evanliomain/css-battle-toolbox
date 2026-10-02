import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAPTURE_TAB } from "./utils/capture-tab";

describe("background worker", () => {
  let listener;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("chrome", {
      runtime: { onMessage: { addListener: vi.fn() } },
      tabs: { captureVisibleTab: vi.fn() },
    });
    await import("./background.js");
    [[listener]] = chrome.runtime.onMessage.addListener.mock.calls;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function send(message, sender = { tab: { windowId: 7 } }) {
    return new Promise((resolve) => {
      const async = listener(message, sender, resolve);
      if (!async) {
        resolve(async);
      }
    });
  }

  it("captures the window of the tab that asks, as a PNG", async () => {
    chrome.tabs.captureVisibleTab.mockResolvedValue("data:image/png;base64,x");

    await expect(send({ type: CAPTURE_TAB })).resolves.toEqual({
      dataUrl: "data:image/png;base64,x",
    });
    expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledWith(7, {
      format: "png",
    });
  });

  it("captures the current window for a sender without a tab", async () => {
    chrome.tabs.captureVisibleTab.mockResolvedValue("data:image/png;base64,x");

    await send({ type: CAPTURE_TAB }, {});

    expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledWith(undefined, {
      format: "png",
    });
  });

  it("answers with the error when the capture fails", async () => {
    chrome.tabs.captureVisibleTab.mockRejectedValue(new Error("Denied"));

    await expect(send({ type: CAPTURE_TAB })).resolves.toEqual({
      error: "Denied",
    });
  });

  it.each([[{ type: "other" }], [undefined]])(
    "leaves any other message alone: %o",
    async (message) => {
      await expect(send(message)).resolves.toBe(false);
      expect(chrome.tabs.captureVisibleTab).not.toHaveBeenCalled();
    },
  );
});
