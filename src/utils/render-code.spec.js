import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  forgetCanvas,
  HOLD_RENDERER,
  holdRenderer,
  RELEASE_RENDERER,
  releaseRenderer,
  RENDER_CODE,
  renderCode,
} from "./render-code";

const IMAGE = { kind: "pixels" };

describe("render-code", () => {
  let bitmap;
  let contexts;

  beforeEach(() => {
    bitmap = { close: vi.fn() };
    contexts = [];
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: vi.fn(() =>
          Promise.resolve({ dataUrl: "data:image/png;base64,cG5n" }),
        ),
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((url) =>
        Promise.resolve({ blob: () => Promise.resolve(`blob of ${url}`) }),
      ),
    );
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.resolve(bitmap)),
    );
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        constructor(width, height) {
          this.size = [width, height];
        }
        getContext(type, options) {
          const context = {
            type,
            options,
            canvas: this,
            drawImage: vi.fn(),
            getImageData: vi.fn(() => IMAGE),
          };
          contexts.push(context);
          return context;
        }
      },
    );
    forgetCanvas();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("renderCode", () => {
    it("asks the background worker for the render, and reads its pixels", async () => {
      await expect(renderCode("<p>")).resolves.toBe(IMAGE);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: RENDER_CODE,
        code: "<p>",
      });
      expect(fetch).toHaveBeenCalledWith("data:image/png;base64,cG5n");
      expect(createImageBitmap).toHaveBeenCalledWith(
        "blob of data:image/png;base64,cG5n",
      );
      const [context] = contexts;
      expect(context.type).toBe("2d");
      expect(context.canvas.size).toEqual([400, 300]);
      expect(context.options).toEqual({ willReadFrequently: true });
      expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0);
      expect(context.getImageData).toHaveBeenCalledWith(0, 0, 400, 300);
      expect(bitmap.close).toHaveBeenCalledOnce();
    });

    it("reads every render on one canvas", async () => {
      await renderCode("<p>");
      await renderCode("<a>");

      expect(contexts).toHaveLength(1);
    });

    it("frees the bitmap even when it cannot be drawn", async () => {
      await renderCode("<p>");
      contexts[0].drawImage.mockImplementationOnce(() => {
        throw new Error("draw");
      });

      await expect(renderCode("<a>")).rejects.toThrow("draw");
      expect(bitmap.close).toHaveBeenCalledTimes(2);
    });

    it("throws the error the worker answers with", async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({ error: "gone" });

      await expect(renderCode("<p>")).rejects.toThrow("gone");
      expect(fetch).not.toHaveBeenCalled();
    });

    it("throws when nobody answers", async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce(undefined);

      await expect(renderCode("<p>")).rejects.toThrow(
        "The code could not be rendered",
      );
    });
  });

  it("asks the worker to hold its renderer for this tab", async () => {
    chrome.runtime.sendMessage.mockResolvedValueOnce({ ok: true });

    await expect(holdRenderer()).resolves.toEqual({ ok: true });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: HOLD_RENDERER,
    });
  });

  it("tells the worker this tab no longer needs its renderer", async () => {
    await releaseRenderer();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: RELEASE_RENDERER,
    });
  });
});
