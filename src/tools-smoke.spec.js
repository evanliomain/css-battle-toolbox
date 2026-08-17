/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Every tool is its own content-script entry, but they all share utils/mount.js.
// A throw at import time in any of them means that tool never runs at all — and
// a throw inside the shared chunk takes all fifteen down together, which reads
// as "the extension is not active".
const TOOLS = [
  "./unit-tools.js",
  "./color-tools.js",
  "./editor-buttons.js",
  "./reset-tools.js",
  "./score-tools.js",
  "./output-tools.js",
  "./autoclose-tools.js",
  "./character-tools.js",
  "./options-effect.js",
  "./incrementor-tools.js",
  "./target-tools.js",
  "./leaderboard-tools.js",
  "./dom-tools.js",
  "./mode-menu.js",
  "./dowload-tools.js",
];

function stubChrome() {
  return {
    storage: {
      sync: { get: vi.fn(() => Promise.resolve({})) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: {
      getURL: (p) => `chrome-extension://test/${p}`,
      openOptionsPage: vi.fn(),
    },
  };
}

describe("content script entry points", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("chrome", stubChrome());
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each(TOOLS)("%s imports without throwing on a bare page", async (tool) => {
    await expect(import(tool)).resolves.toBeDefined();
  });

  it("imports every tool together, as the browser does", async () => {
    for (const tool of TOOLS) {
      await import(tool);
    }
    // A shared-chunk failure would have surfaced above; this also proves the
    // fifteen mounts do not collide in mount.js's name registry.
    expect(console.debug).not.toHaveBeenCalledWith(
      expect.stringContaining("registered twice"),
    );
  });
});
