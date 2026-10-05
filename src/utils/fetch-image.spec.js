import { afterEach, describe, expect, it, vi } from "vitest";
import { FETCH_IMAGE, fetchImage, imageAsDataUrl } from "./fetch-image";

describe("fetchImage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubAnswer(response) {
    vi.stubGlobal("chrome", {
      runtime: { sendMessage: vi.fn(() => Promise.resolve(response)) },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((url) =>
        Promise.resolve({ blob: () => Promise.resolve(`blob of ${url}`) }),
      ),
    );
  }

  it("asks the background worker, and turns its data URL into a blob", async () => {
    stubAnswer({ dataUrl: "data:image/png;base64,eA==" });

    await expect(
      fetchImage("https://firebasestorage.googleapis.com/t.png"),
    ).resolves.toBe("blob of data:image/png;base64,eA==");
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: FETCH_IMAGE,
      url: "https://firebasestorage.googleapis.com/t.png",
    });
  });

  it("throws the error the worker answers with", async () => {
    stubAnswer({ error: "The image could not be downloaded: 404" });

    await expect(fetchImage("https://a/t.png")).rejects.toThrow(
      "The image could not be downloaded: 404",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws when nobody answers", async () => {
    stubAnswer(undefined);

    await expect(fetchImage("https://a/t.png")).rejects.toThrow(
      "The image could not be downloaded",
    );
  });
});

describe("imageAsDataUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubResponse({
    ok = true,
    status = 200,
    type = "image/png",
    bytes = [],
  } = {}) {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok,
          status,
          headers: { get: () => type },
          arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer),
        }),
      ),
    );
  }

  it("downloads the image as a base64 data URL of its type", async () => {
    stubResponse({ type: "image/webp", bytes: [104, 105] });

    await expect(imageAsDataUrl("https://a/t.png")).resolves.toBe(
      "data:image/webp;base64,aGk=",
    );
    expect(fetch).toHaveBeenCalledWith("https://a/t.png");
  });

  it("takes an image without a type for a PNG", async () => {
    stubResponse({ type: null, bytes: [104, 105] });

    await expect(imageAsDataUrl("http://a/t")).resolves.toBe(
      "data:image/png;base64,aGk=",
    );
  });

  it("encodes an image bigger than a chunk whole", async () => {
    const bytes = Array.from({ length: 0x8000 * 2 + 3 }, (_, i) => i % 256);
    stubResponse({ bytes });

    const dataUrl = await imageAsDataUrl("https://a/t.png");

    const decoded = atob(dataUrl.split(",")[1]);
    expect(decoded).toHaveLength(bytes.length);
    expect([...decoded].map((c) => c.charCodeAt(0))).toEqual(bytes);
  });

  it("fails on an HTTP error", async () => {
    stubResponse({ ok: false, status: 404 });

    await expect(imageAsDataUrl("https://a/t.png")).rejects.toThrow(
      "The image could not be downloaded: 404",
    );
  });

  it.each(["chrome-extension://x/a.png", "file:///etc/passwd", "data:,x"])(
    "downloads nothing but web images: %s",
    async (url) => {
      stubResponse();

      await expect(imageAsDataUrl(url)).rejects.toThrow("Not a web image");
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
