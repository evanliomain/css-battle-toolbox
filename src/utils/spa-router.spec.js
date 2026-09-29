/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isDailyPage, isPlayPage, mountKey, targetId } from "./spa-router";

describe("mountKey", () => {
  it.each`
    a                                     | b                                       | same
    ${"https://cssbattle.dev/play/123"}   | ${"https://cssbattle.dev/play/123#"}    | ${true}
    ${"https://cssbattle.dev/play/123"}   | ${"https://cssbattle.dev/play/123?x=1"} | ${true}
    ${"https://cssbattle.dev/play/123#a"} | ${"https://cssbattle.dev/play/123#b"}   | ${true}
    ${"https://cssbattle.dev/play/123"}   | ${"https://cssbattle.dev/play/124"}     | ${false}
    ${"https://cssbattle.dev/play/123"}   | ${"https://cssbattle.dev/daily"}        | ${false}
  `("$a vs $b -> same: $same", ({ a, b, same }) => {
    expect(mountKey(a) === mountKey(b)).toBe(same);
  });

  it("ignores the fragment, so mode-menu's href='#' links are not navigations", () => {
    // Clicking <a href="#"> turns /play/123 into /play/123#, which used to tear
    // every tool down and re-mount it.
    expect(mountKey("https://cssbattle.dev/play/123#")).toBe(
      mountKey("https://cssbattle.dev/play/123"),
    );
  });
});

describe("isPlayPage", () => {
  it.each`
    href                                              | expected
    ${"https://cssbattle.dev/play/123"}               | ${true}
    ${"https://cssbattle.dev/play/123/"}              | ${true}
    ${"https://cssbattle.dev/play/123?foo=bar"}       | ${true}
    ${"https://cssbattle.dev/play/123#anchor"}        | ${true}
    ${"https://cssbattle.dev/play/daily-2026-08-14"}  | ${true}
    ${"https://cssbattle.dev/play"}                   | ${false}
    ${"https://cssbattle.dev/play/"}                  | ${false}
    ${"https://cssbattle.dev/"}                       | ${false}
    ${"https://cssbattle.dev/daily"}                  | ${false}
    ${"https://cssbattle.dev/leaderboard/target/123"} | ${false}
  `("$href -> $expected", ({ href, expected }) => {
    expect(isPlayPage(href)).toBe(expected);
  });
});

describe("isDailyPage", () => {
  it.each`
    href                                        | expected
    ${"https://cssbattle.dev/daily"}            | ${true}
    ${"https://cssbattle.dev/daily/"}           | ${true}
    ${"https://cssbattle.dev/daily?ref=x"}      | ${true}
    ${"https://cssbattle.dev/daily#today"}      | ${true}
    ${"https://cssbattle.dev/dailies"}          | ${false}
    ${"https://cssbattle.dev/daily/2026-08-14"} | ${false}
    ${"https://cssbattle.dev/play/123"}         | ${false}
  `("$href -> $expected", ({ href, expected }) => {
    expect(isDailyPage(href)).toBe(expected);
  });
});

describe("targetId", () => {
  it.each`
    href                                       | expected
    ${"https://cssbattle.dev/play/123"}        | ${"123"}
    ${"https://cssbattle.dev/play/123/"}       | ${"123"}
    ${"https://cssbattle.dev/play/123?foo=1"}  | ${"123"}
    ${"https://cssbattle.dev/play/123#anchor"} | ${"123"}
    ${"https://cssbattle.dev/play/abc-def"}    | ${"abc-def"}
    ${"https://cssbattle.dev/daily"}           | ${""}
    ${"https://cssbattle.dev/"}                | ${""}
    ${"not a url"}                             | ${""}
    ${"http://exa mple.com/play/123"}          | ${""}
  `("$href -> '$expected'", ({ href, expected }) => {
    expect(targetId(href)).toBe(expected);
  });

  it("reads the current URL by default", () => {
    expect(targetId()).toBe("123");
    expect(isPlayPage()).toBe(true);
    expect(isDailyPage()).toBe(false);
    expect(mountKey()).toBe("/play/123");
  });
});

describe("onNavigate", () => {
  let onNavigate;
  let windowListeners;

  beforeEach(async () => {
    // The router keeps its listeners in module state: a fresh module per test.
    vi.resetModules();
    vi.useFakeTimers();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    windowListeners = vi.spyOn(window, "addEventListener");
    ({ onNavigate } = await import("./spa-router"));
  });

  afterEach(() => {
    // The window outlives the module, so unbind the previous module's handlers.
    windowListeners.mock.calls.forEach(([type, handler]) =>
      window.removeEventListener(type, handler),
    );
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.history.replaceState(null, "", "/play/123");
  });

  it("calls back right away with the current URL", () => {
    const cb = vi.fn();

    onNavigate(cb);

    expect(cb).toHaveBeenCalledExactlyOnceWith(
      "https://cssbattle.dev/play/123",
    );
  });

  it("catches a pushState navigation on the next poll", async () => {
    const cb = vi.fn();
    onNavigate(cb);

    window.history.pushState(null, "", "/play/456");
    expect(cb).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(300);

    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith("https://cssbattle.dev/play/456");
  });

  it("does not call back while the URL stays the same", async () => {
    const cb = vi.fn();
    onNavigate(cb);

    await vi.advanceTimersByTimeAsync(3000);

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it.each(["popstate", "hashchange"])(
    "reacts to %s without waiting for the poll",
    (type) => {
      const cb = vi.fn();
      onNavigate(cb);

      window.history.pushState(null, "", "/play/123#a");
      window.dispatchEvent(new Event(type));

      expect(cb).toHaveBeenLastCalledWith("https://cssbattle.dev/play/123#a");
    },
  );

  it("notifies every listener once, however many subscribed", async () => {
    const first = vi.fn();
    const second = vi.fn();
    onNavigate(first);
    onNavigate(second);

    window.history.pushState(null, "", "/daily");
    await vi.advanceTimersByTimeAsync(300);

    // A single poller: a second subscription must not double the calls.
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(2);
    expect(window.addEventListener).toHaveBeenCalledTimes(2);
  });

  it("keeps notifying the other listeners when one throws", async () => {
    const broken = vi.fn((href) => {
      if (href.endsWith("/daily")) {
        throw new Error("boom");
      }
    });
    const healthy = vi.fn();
    onNavigate(broken);
    onNavigate(healthy);

    window.history.pushState(null, "", "/daily");
    await vi.advanceTimersByTimeAsync(300);

    expect(healthy).toHaveBeenLastCalledWith("https://cssbattle.dev/daily");
    expect(console.debug).toHaveBeenCalledWith(
      "[cbt] navigation listener threw",
      expect.any(Error),
    );
  });
});
