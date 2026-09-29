/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/daily"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { download } from "./download";

const URL_TO_FETCH = "https://cssbattle.dev/targets/today.png";

describe("download", () => {
  let blob;

  beforeEach(() => {
    vi.useFakeTimers();
    // Months and days are zero-padded in the suggested name.
    vi.setSystemTime(new Date(2026, 2, 7, 12));
    blob = new Blob(["png"], { type: "image/png" });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ blob: () => Promise.resolve(blob) })),
    );
  });

  afterEach(() => {
    delete window.showSaveFilePicker;
    delete URL.createObjectURL;
    delete URL.revokeObjectURL;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  describe("with the File System Access API", () => {
    function stubPicker() {
      const writable = { write: vi.fn(), close: vi.fn() };
      const handle = { createWritable: vi.fn(() => Promise.resolve(writable)) };
      window.showSaveFilePicker = vi.fn(() => Promise.resolve(handle));
      return writable;
    }

    it("lets the user pick where to save the fetched image", async () => {
      const writable = stubPicker();

      await download(URL_TO_FETCH);

      expect(fetch).toHaveBeenCalledWith(URL_TO_FETCH);
      expect(window.showSaveFilePicker).toHaveBeenCalledWith({
        types: [
          {
            description: "All Files",
            accept: { "application/octet-stream": [".png"] },
          },
        ],
        suggestedName: "2026-03-07.png",
      });
      expect(writable.write).toHaveBeenCalledWith(blob);
      expect(writable.close).toHaveBeenCalledOnce();
    });

    it("logs, without throwing, when the user cancels the picker", async () => {
      const error = new DOMException(
        "The user aborted a request.",
        "AbortError",
      );
      window.showSaveFilePicker = vi.fn(() => Promise.reject(error));
      vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(download(URL_TO_FETCH)).resolves.toBeUndefined();

      expect(console.error).toHaveBeenCalledWith(error);
    });
  });

  describe("without the File System Access API", () => {
    it("falls back to a temporary download link", async () => {
      URL.createObjectURL = vi.fn(() => "blob:https://cssbattle.dev/abc");
      URL.revokeObjectURL = vi.fn();
      const clicked = [];
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
        function () {
          clicked.push({
            href: this.href,
            download: this.download,
            attached: this.isConnected,
          });
        },
      );

      await download(URL_TO_FETCH);

      expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
      expect(clicked).toEqual([
        {
          href: "blob:https://cssbattle.dev/abc",
          download: "2026-03-07.png",
          attached: true,
        },
      ]);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(
        "blob:https://cssbattle.dev/abc",
      );
      // The link is only there for the click.
      expect(document.querySelector("a")).toBeNull();
    });
  });
});
