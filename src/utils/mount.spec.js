/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Poll interval of the SPA router, and settle delay before a re-mount.
const POLL = 300;
const SETTLE = 500;

function tick(ms) {
  return vi.advanceTimersByTimeAsync(ms);
}

/** Navigates client-side, as Next.js does, and lets the router notice it. */
async function navigate(path) {
  window.history.pushState(null, "", path);
  await tick(POLL);
}

describe("mount", () => {
  let mount;

  beforeEach(async () => {
    // The registry and the router both live in module state.
    vi.resetModules();
    vi.useFakeTimers();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    ({ mount } = await import("./mount"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.history.replaceState(null, "", "/play/123");
    document.body.innerHTML = "";
  });

  it("runs init right away once every selector resolves", async () => {
    document.body.innerHTML = `<div id="editor"></div>`;
    const init = vi.fn();

    mount("tool", { selectors: { editor: "#editor" }, init });
    await tick(0);

    expect(init).toHaveBeenCalledExactlyOnceWith(
      { editor: document.getElementById("editor") },
      expect.any(Function),
      expect.any(AbortSignal),
    );
  });

  it("runs init with no selectors at all", async () => {
    const init = vi.fn();

    mount("tool", { init });
    await tick(0);

    expect(init).toHaveBeenCalledWith(
      {},
      expect.any(Function),
      expect.any(AbortSignal),
    );
  });

  it("waits for a missing node before running init", async () => {
    const init = vi.fn();
    mount("tool", { selectors: { editor: "#editor" }, init });
    await tick(50);
    expect(init).not.toHaveBeenCalled();

    document.body.innerHTML = `<div id="editor"></div>`;
    await tick(100);

    expect(init).toHaveBeenCalledTimes(1);
  });

  it("only mounts on /play pages by default", async () => {
    window.history.replaceState(null, "", "/daily");
    const init = vi.fn();

    mount("tool", { init });
    await tick(1000);

    expect(init).not.toHaveBeenCalled();
  });

  it("mounts wherever `when` says", async () => {
    window.history.replaceState(null, "", "/daily");
    const when = vi.fn(() => true);
    const init = vi.fn();

    mount("tool", { when, init });
    await tick(0);

    expect(when).toHaveBeenCalledWith("https://cssbattle.dev/daily");
    expect(init).toHaveBeenCalledTimes(1);
  });

  describe("selectors", () => {
    it("resolves `all` to every matching node, and waits for at least one", async () => {
      const init = vi.fn();
      mount("tool", { selectors: { items: { all: "li" } }, init });
      await tick(50);
      expect(init).not.toHaveBeenCalled();

      document.body.innerHTML = `<li></li><li></li>`;
      await tick(100);

      expect(init.mock.calls[0][0].items).toHaveLength(2);
    });

    it("never blocks on an `optional` node", async () => {
      const init = vi.fn();

      mount("tool", { selectors: { maybe: { optional: "#nope" } }, init });
      await tick(0);

      expect(init.mock.calls[0][0]).toEqual({ maybe: null });
    });

    it("hands a function selector the refs declared above it", async () => {
      document.body.innerHTML = `<div id="editor"><p></p></div>`;
      const init = vi.fn();

      mount("tool", {
        selectors: {
          editor: "#editor",
          paragraph: ({ editor }) => editor.querySelector("p"),
          ready: () => false,
        },
        init,
      });
      await tick(0);

      expect(init.mock.calls[0][0]).toEqual({
        editor: document.getElementById("editor"),
        paragraph: document.querySelector("p"),
        // Only null/undefined block: `false` is a resolved value.
        ready: false,
      });
    });

    it("waits while a function selector returns undefined", async () => {
      let value;
      const init = vi.fn();
      mount("tool", { selectors: { value: () => value }, init });
      await tick(50);
      expect(init).not.toHaveBeenCalled();

      value = 0;
      await tick(100);

      expect(init.mock.calls[0][0]).toEqual({ value: 0 });
    });

    it("rejects an unknown selector shape and never runs init", async () => {
      const init = vi.fn();

      mount("tool", { selectors: { bad: { nope: "#x" } }, init, timeout: 250 });
      await tick(500);

      expect(init).not.toHaveBeenCalled();
      expect(console.debug).toHaveBeenCalledWith(
        "[cbt] tool threw, retrying",
        expect.objectContaining({
          message: '[cbt] unsupported selector: {"nope":"#x"}',
        }),
      );
      expect(console.warn).toHaveBeenCalledWith(
        "[cbt] tool gave up after 250ms",
      );
    });
  });

  describe("navigation", () => {
    it("tears down in reverse order, then mounts again once the page settled", async () => {
      const order = [];
      const init = vi.fn((refs, onCleanup) => {
        onCleanup(() => order.push("first"));
        onCleanup(() => order.push("second"));
      });
      mount("tool", { init });

      await navigate("/play/456");

      expect(order).toEqual(["second", "first"]);
      expect(init).toHaveBeenCalledTimes(1);

      await tick(SETTLE);

      expect(init).toHaveBeenCalledTimes(2);
    });

    it("aborts the signal init was given", async () => {
      let signal;
      mount("tool", {
        init(refs, onCleanup, attemptSignal) {
          signal = attemptSignal;
        },
      });
      await tick(0);
      expect(signal.aborted).toBe(false);

      await navigate("/play/456");

      expect(signal.aborted).toBe(true);
    });

    it("ignores a fragment change", async () => {
      const cleanup = vi.fn();
      const init = vi.fn((refs, onCleanup) => onCleanup(cleanup));
      mount("tool", { init });

      await navigate("/play/123#");
      await tick(SETTLE);

      expect(cleanup).not.toHaveBeenCalled();
      expect(init).toHaveBeenCalledTimes(1);
    });

    it("stays unmounted after leaving for a page it does not match", async () => {
      const cleanup = vi.fn();
      const init = vi.fn((refs, onCleanup) => onCleanup(cleanup));
      mount("tool", { init });

      await navigate("/daily");
      await tick(SETTLE);

      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(init).toHaveBeenCalledTimes(1);
    });

    it("skips a re-mount that a newer navigation made stale", async () => {
      const init = vi.fn();
      mount("tool", { init });

      await navigate("/play/456");
      await navigate("/play/789");
      await tick(SETTLE);

      // One for the first page, one for the last: /play/456 never mounted.
      expect(init).toHaveBeenCalledTimes(2);
    });

    it("undoes a cleanup registered after the teardown straight away", async () => {
      let register;
      mount("tool", {
        init(refs, onCleanup) {
          register = onCleanup;
        },
      });
      await navigate("/daily");

      const late = vi.fn();
      register(late);

      expect(late).toHaveBeenCalledTimes(1);
    });

    it("keeps tearing down when a cleanup throws", async () => {
      const after = vi.fn();
      mount("tool", {
        init(refs, onCleanup) {
          onCleanup(after);
          onCleanup(() => {
            throw new Error("boom");
          });
        },
      });

      await navigate("/daily");

      expect(after).toHaveBeenCalledTimes(1);
      expect(console.debug).toHaveBeenCalledWith(
        "[cbt] tool cleanup threw",
        expect.any(Error),
      );
    });
  });

  describe("a failing init", () => {
    it.each([
      ["an async", true],
      ["a synchronous", false],
    ])("rolls back what %s init did, then retries", async (_, isAsync) => {
      const cleanup = vi.fn();
      const signals = [];
      let calls = 0;
      function attempt(refs, onCleanup, signal) {
        signals.push(signal);
        onCleanup(cleanup);
        calls += 1;
        if (1 === calls) {
          throw new Error("not yet");
        }
      }
      const init = vi.fn(
        isAsync ? async (...args) => attempt(...args) : attempt,
      );

      mount("tool", { init });
      await tick(0);

      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(signals[0].aborted).toBe(true);

      await tick(100);

      expect(init).toHaveBeenCalledTimes(2);
      expect(signals[1].aborted).toBe(false);
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it("runs a cleanup registered by another cleanup during the rollback", async () => {
      const nested = vi.fn();
      let calls = 0;
      mount("tool", {
        init(refs, onCleanup) {
          calls += 1;
          if (1 === calls) {
            onCleanup(() => onCleanup(nested));
            return Promise.reject(new Error("not yet"));
          }
        },
      });

      await tick(0);

      expect(nested).toHaveBeenCalledTimes(1);
    });
  });

  it("drops the first mount when a tool registers twice under one name", async () => {
    const cleanup = vi.fn();
    mount("tool", { init: (refs, onCleanup) => onCleanup(cleanup) });
    await tick(0);

    mount("tool", { init: vi.fn() });

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(console.debug).toHaveBeenCalledWith(
      "[cbt] tool registered twice, dropping the first mount",
    );
  });

  it("keeps tools with different names apart", async () => {
    const cleanup = vi.fn();
    mount("one", { init: (refs, onCleanup) => onCleanup(cleanup) });
    await tick(0);

    mount("two", { init: vi.fn() });

    expect(cleanup).not.toHaveBeenCalled();
  });
});
