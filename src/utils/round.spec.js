import { describe, expect, it } from "vitest";
import { round } from "./round";

describe("round", () => {
  it.each`
    n            | precision    | expected
    ${1.2345}    | ${undefined} | ${"1.23"}
    ${1.5}       | ${undefined} | ${"1.5"}
    ${10.5}      | ${undefined} | ${"10.5"}
    ${1.05}      | ${undefined} | ${"1.05"}
    ${2}         | ${undefined} | ${"2"}
    ${100}       | ${undefined} | ${"100"}
    ${0.1 + 0.2} | ${undefined} | ${"0.3"}
    ${1.23456}   | ${3}         | ${"1.235"}
    ${1.2}       | ${3}         | ${"1.2"}
    ${1.6}       | ${0}         | ${"2"}
  `("round($n, $precision) -> $expected", ({ n, precision, expected }) => {
    expect(round(n, precision)).toBe(expected);
  });

  it.each([["12px"], [undefined], [null]])(
    "returns a non-number as is: %s",
    (value) => {
      expect(round(value)).toBe(value);
    },
  );
});
