import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAPTURE_TAB } from "./utils/capture-tab";
import { FETCH_IMAGE } from "./utils/fetch-image";
import {
  HOLD_RENDERER,
  RELEASE_RENDERER,
  RENDER_CODE,
} from "./utils/render-code";

vi.mock("./utils/hidden-renderer", () => ({
  listen: vi.fn(),
  hold: vi.fn(() => Promise.resolve()),
  release: vi.fn(() => Promise.resolve()),
  render: vi.fn(() => Promise.resolve("data:image/png;base64,cmVuZGVy")),
}));
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

  it("downloads an image for a content script, as a data URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => "image/png" },
          arrayBuffer: () => Promise.resolve(new Uint8Array([104, 105]).buffer),
        }),
      ),
    );

    await expect(
      send({
        type: FETCH_IMAGE,
        url: "https://firebasestorage.googleapis.com/t.png",
      }),
    ).resolves.toEqual({ dataUrl: "data:image/png;base64,aGk=" });
    expect(fetch).toHaveBeenCalledWith(
      "https://firebasestorage.googleapis.com/t.png",
    );
    expect(chrome.tabs.captureVisibleTab).not.toHaveBeenCalled();
  });

  it("answers with the error when the image cannot be downloaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );

    await expect(
      send({ type: FETCH_IMAGE, url: "https://a/t.png" }),
    ).resolves.toEqual({ error: "offline" });
  });

  describe("renderer", () => {
    let renderer;

    beforeEach(async () => {
      renderer = await import("./utils/hidden-renderer");
    });

    it("starts listening to the browser's events", () => {
      expect(renderer.listen).toHaveBeenCalled();
    });

    it("renders the code for a content script", async () => {
      await expect(send({ type: RENDER_CODE, code: "<p>" })).resolves.toEqual({
        dataUrl: "data:image/png;base64,cmVuZGVy",
      });
      expect(renderer.render).toHaveBeenCalledWith("<p>");
    });

    it("answers with the error when the render fails", async () => {
      renderer.render.mockRejectedValueOnce(new Error("refused"));

      await expect(send({ type: RENDER_CODE, code: "<p>" })).resolves.toEqual({
        error: "refused",
      });
    });

    it("holds the renderer for the tab that asks", async () => {
      await expect(
        send({ type: HOLD_RENDERER }, { tab: { id: 4, windowId: 7 } }),
      ).resolves.toEqual({ ok: true });
      expect(renderer.hold).toHaveBeenCalledWith(4, 7);
    });

    it("answers with the error when the renderer cannot open", async () => {
      renderer.hold.mockRejectedValueOnce(new Error("no debugger"));

      await expect(send({ type: HOLD_RENDERER })).resolves.toEqual({
        error: "no debugger",
      });
    });

    it("releases the renderer for the tab that asks", async () => {
      await expect(
        send({ type: RELEASE_RENDERER }, { tab: { id: 4, windowId: 7 } }),
      ).resolves.toBe(false);
      expect(renderer.release).toHaveBeenCalledWith(4);
    });

    it("holds and releases nothing for a sender without a tab", async () => {
      await send({ type: HOLD_RENDERER }, {});
      await send({ type: RELEASE_RENDERER }, {});

      expect(renderer.hold).toHaveBeenCalledWith(undefined, undefined);
      expect(renderer.release).toHaveBeenCalledWith(undefined);
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
