import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAPTURE_TAB } from "./utils/capture-tab";
import { OPEN_OPTIONS } from "./utils/open-options";

describe("background worker", () => {
  let listener;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("chrome", {
      runtime: {
        onMessage: { addListener: vi.fn() },
        openOptionsPage: vi.fn(),
      },
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

  describe("two captures a second at most", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("takes the next capture half a second after the previous one", async () => {
      chrome.tabs.captureVisibleTab.mockResolvedValue(
        "data:image/png;base64,x",
      );

      const first = send({ type: CAPTURE_TAB });
      const second = send({ type: CAPTURE_TAB });
      await vi.advanceTimersByTimeAsync(0);
      expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(499);
      expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(1);
      expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledTimes(2);
      await expect(first).resolves.toEqual({
        dataUrl: "data:image/png;base64,x",
      });
      await expect(second).resolves.toEqual({
        dataUrl: "data:image/png;base64,x",
      });
    });

    it("takes a capture right away after a pause", async () => {
      chrome.tabs.captureVisibleTab.mockResolvedValue(
        "data:image/png;base64,x",
      );

      await send({ type: CAPTURE_TAB });
      await vi.advanceTimersByTimeAsync(800);
      send({ type: CAPTURE_TAB });
      await vi.advanceTimersByTimeAsync(0);

      expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledTimes(2);
    });

    it("goes on after a failed capture", async () => {
      chrome.tabs.captureVisibleTab
        .mockRejectedValueOnce(new Error("Denied"))
        .mockResolvedValue("data:image/png;base64,x");

      const first = send({ type: CAPTURE_TAB });
      const second = send({ type: CAPTURE_TAB });
      await vi.advanceTimersByTimeAsync(500);

      await expect(first).resolves.toEqual({ error: "Denied" });
      await expect(second).resolves.toEqual({
        dataUrl: "data:image/png;base64,x",
      });
    });
  });

  it("opens the options page", async () => {
    await expect(send({ type: OPEN_OPTIONS })).resolves.toBe(false);
    expect(chrome.runtime.openOptionsPage).toHaveBeenCalledOnce();
    expect(chrome.tabs.captureVisibleTab).not.toHaveBeenCalled();
  });

  it.each([[{ type: "other" }], [undefined]])(
    "leaves any other message alone: %o",
    async (message) => {
      await expect(send(message)).resolves.toBe(false);
      expect(chrome.tabs.captureVisibleTab).not.toHaveBeenCalled();
      expect(chrome.runtime.openOptionsPage).not.toHaveBeenCalled();
    },
  );
});
