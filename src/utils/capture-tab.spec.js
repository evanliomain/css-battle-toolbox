import { afterEach, describe, expect, it, vi } from "vitest";
import { CAPTURE_TAB, captureTab } from "./capture-tab";

function stubAnswer(response) {
  vi.stubGlobal("chrome", {
    runtime: { sendMessage: vi.fn(() => Promise.resolve(response)) },
  });
}

describe("captureTab", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks the background worker for the capture", async () => {
    stubAnswer({ dataUrl: "data:image/png;base64,x" });

    await expect(captureTab()).resolves.toBe("data:image/png;base64,x");
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: CAPTURE_TAB,
    });
  });

  it("throws the error the worker answers with", async () => {
    stubAnswer({ error: "Denied" });

    await expect(captureTab()).rejects.toThrow("Denied");
  });

  it("throws when nobody answers", async () => {
    stubAnswer(undefined);

    await expect(captureTab()).rejects.toThrow("The tab could not be captured");
  });
});
