import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { doAsync } from "./do-async";

// Real timers with a tiny interval: fake timers and promise chains interleave
// awkwardly, and these polls resolve in a few milliseconds anyway.
const FAST = { interval: 1, timeout: 200 };

describe("doAsync", () => {
  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls the callback once when it succeeds immediately", async () => {
    const cb = vi.fn(() => true);

    await doAsync(cb, FAST)();

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("retries while the callback returns a falsy value", async () => {
    let calls = 0;
    const cb = vi.fn(() => {
      calls += 1;
      return 3 === calls;
    });

    await doAsync(cb, FAST)();

    expect(cb).toHaveBeenCalledTimes(3);
  });

  it.each`
    falsy        | label
    ${false}     | ${"false"}
    ${undefined} | ${"undefined"}
    ${null}      | ${"null"}
    ${0}         | ${"0"}
  `("treats $label as not-ready and retries", async ({ falsy }) => {
    let calls = 0;
    const cb = vi.fn(() => {
      calls += 1;
      return 1 === calls ? falsy : true;
    });

    await doAsync(cb, FAST)();

    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("retries after a throw instead of dying", async () => {
    let calls = 0;
    const cb = vi.fn(() => {
      calls += 1;
      if (calls < 3) {
        throw new TypeError("Cannot read properties of null");
      }
      return true;
    });

    await doAsync(cb, FAST)();

    expect(cb).toHaveBeenCalledTimes(3);
    expect(console.debug).toHaveBeenCalled();
  });

  it("retries after a rejected promise", async () => {
    let calls = 0;
    const cb = vi.fn(() => {
      calls += 1;
      return calls < 2
        ? Promise.reject(new Error("nope"))
        : Promise.resolve(true);
    });

    await doAsync(cb, FAST)();

    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("awaits an async callback before deciding to retry", async () => {
    let calls = 0;
    const cb = vi.fn(async () => {
      calls += 1;
      await Promise.resolve();
      return 2 === calls;
    });

    await doAsync(cb, FAST)();

    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("gives up at the timeout and warns with the tool name", async () => {
    const cb = vi.fn(() => false);

    await doAsync(cb, { name: "my-tool", interval: 1, timeout: 20 })();

    expect(cb.mock.calls.length).toBeGreaterThan(1);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("my-tool"),
    );
  });

  it("keeps polling a never-ready callback only until the timeout", async () => {
    const cb = vi.fn(() => false);

    await doAsync(cb, { interval: 1, timeout: 20 })();
    const callsAtGiveUp = cb.mock.calls.length;

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(cb.mock.calls.length).toBe(callsAtGiveUp);
  });

  it("stops immediately when the signal is aborted", async () => {
    const controller = new AbortController();
    const cb = vi.fn(() => false);

    const running = doAsync(cb, {
      interval: 5,
      timeout: 5000,
      signal: controller.signal,
    })();

    controller.abort();
    await running;
    const callsAtAbort = cb.mock.calls.length;

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(cb.mock.calls.length).toBe(callsAtAbort);
  });

  it("never calls the callback when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const cb = vi.fn(() => true);

    await doAsync(cb, { ...FAST, signal: controller.signal })();

    expect(cb).not.toHaveBeenCalled();
  });

  it("supports the legacy doAsync(cb)() call shape", async () => {
    const cb = vi.fn(() => true);

    await expect(doAsync(cb)()).resolves.toBeUndefined();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
