/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fake timers, so the polls a test leaves running die with it instead of
// firing once the jsdom environment is gone.
function tick(ms) {
  return vi.advanceTimersByTimeAsync(ms);
}

describe("autoclose-tools", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("closes the Code Golf objective pill", async () => {
    document.body.innerHTML = `<a class="BattleModeInfoPill_closeBtn__x1"></a>`;
    const onClick = vi.fn();
    document.querySelector("a").addEventListener("click", onClick);

    await import("./autoclose-tools.js");
    await tick(150);

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("closes a pill that only shows up once the battle has rendered", async () => {
    await import("./autoclose-tools.js");
    await tick(1000);

    document.body.innerHTML = `<a class="BattleModeInfoPill_closeBtn__x1"></a>`;
    const onClick = vi.fn();
    document.querySelector("a").addEventListener("click", onClick);
    await tick(150);

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("gives up quickly outside Code Golf battles", async () => {
    await import("./autoclose-tools.js");
    await tick(5100);

    expect(console.warn).toHaveBeenCalledWith(
      "[cbt] autoclose-tools gave up after 5000ms",
    );

    // Past the timeout, a late pill is left alone.
    document.body.innerHTML = `<a class="BattleModeInfoPill_closeBtn__x1"></a>`;
    const onClick = vi.fn();
    document.querySelector("a").addEventListener("click", onClick);
    await tick(1000);

    expect(onClick).not.toHaveBeenCalled();
  });
});
