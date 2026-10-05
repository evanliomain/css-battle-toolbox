import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetTarget, oneX, targetImageData } from "./target-image";

describe("oneX", () => {
  it.each([
    ["/targets/12.png", "/targets/12.png"],
    ["/targets/12@2x.png", "/targets/12.png"],
    // What the x2 option leaves, after copying the srcset into src.
    [
      "https://cssbattle.dev/targets/12@2x.png%202x",
      "https://cssbattle.dev/targets/12.png",
    ],
  ])("turns %s into %s", (src, url) => {
    expect(oneX(src)).toBe(url);
  });
});

describe("targetImageData", () => {
  let bitmaps;
  let contexts;

  beforeEach(() => {
    bitmaps = [];
    contexts = [];
    // The background worker answers with the image as a data URL.
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: vi.fn(({ url }) =>
          Promise.resolve({ dataUrl: `data:${url}` }),
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
      vi.fn((blob) => {
        const bitmap = { blob, close: vi.fn() };
        bitmaps.push(bitmap);
        return Promise.resolve(bitmap);
      }),
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
            getImageData: vi.fn(() => ({ pixels: contexts.length })),
          };
          contexts.push(context);
          return context;
        }
      },
    );
    forgetTarget();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the pixels of the 1x image, at 400×300", async () => {
    const data = await targetImageData("/targets/12@2x.png");

    // Downloaded by the background worker, which no CORS rule stops.
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "cbt:fetch-image",
      url: "/targets/12.png",
    });
    expect(bitmaps).toHaveLength(1);
    expect(bitmaps[0].blob).toBe("blob of data:/targets/12.png");
    const [context] = contexts;
    expect(context.type).toBe("2d");
    expect(context.canvas.size).toEqual([400, 300]);
    expect(context.options).toEqual({ willReadFrequently: true });
    expect(context.drawImage).toHaveBeenCalledWith(bitmaps[0], 0, 0, 400, 300);
    expect(context.getImageData).toHaveBeenCalledWith(0, 0, 400, 300);
    expect(data).toEqual({ pixels: 1 });
  });

  it("frees the bitmap once drawn", async () => {
    await targetImageData("/targets/12.png");

    expect(bitmaps[0].close).toHaveBeenCalledOnce();
  });

  it("frees the bitmap even when it cannot be drawn", async () => {
    const draw = vi.fn(() => {
      throw new Error("draw");
    });
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return { drawImage: draw };
        }
      },
    );

    await expect(targetImageData("/targets/12.png")).rejects.toThrow("draw");
    expect(bitmaps[0].close).toHaveBeenCalledOnce();
  });

  it("loads a target once, whatever its src says", async () => {
    const first = await targetImageData("/targets/12.png");
    const second = await targetImageData("/targets/12@2x.png");

    expect(second).toBe(first);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce();
  });

  it("keeps only the last target", async () => {
    await targetImageData("/targets/12.png");
    await targetImageData("/targets/13.png");
    await targetImageData("/targets/12.png");

    expect(
      chrome.runtime.sendMessage.mock.calls.map(([{ url }]) => url),
    ).toEqual(["/targets/12.png", "/targets/13.png", "/targets/12.png"]);
  });

  it("fails when the image cannot be downloaded, and keeps nothing", async () => {
    chrome.runtime.sendMessage.mockResolvedValueOnce({ error: "offline" });

    await expect(targetImageData("/targets/12.png")).rejects.toThrow("offline");
    expect(createImageBitmap).not.toHaveBeenCalled();

    await targetImageData("/targets/12.png");
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });
});
