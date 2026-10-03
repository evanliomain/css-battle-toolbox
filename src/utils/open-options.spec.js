import { afterEach, describe, expect, it, vi } from "vitest";
import { OPEN_OPTIONS, openOptions } from "./open-options";

describe("openOptions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks the background worker to open the options page", () => {
    vi.stubGlobal("chrome", { runtime: { sendMessage: vi.fn() } });

    openOptions();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: OPEN_OPTIONS,
    });
  });
});
