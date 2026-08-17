import { describe, expect, it } from "vitest";
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
  `("$href -> '$expected'", ({ href, expected }) => {
    expect(targetId(href)).toBe(expected);
  });
});
