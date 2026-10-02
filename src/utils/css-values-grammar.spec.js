import { describe, expect, it } from "vitest";
import {
  ANGLE,
  MATH,
  NUMBER,
  VAR,
  isAngle,
  isFunction,
  isNumber,
  upTo,
  words,
} from "./css-values-grammar";

describe("css-values-grammar", () => {
  it("splits words on any whitespace", () => {
    expect(words("\n  a b\n  c  ")).toEqual(["a", "b", "c"]);
  });

  it("stands for a number with functions, behind the keywords", () => {
    expect(NUMBER).toEqual(
      words("var() attr() calc() min() max() clamp()").map((label) => ({
        label,
        type: "function",
        boost: -10,
      })),
    );
  });

  it("stands for any other value with var()", () => {
    expect(VAR).toEqual([{ label: "var()", type: "function", boost: -10 }]);
  });

  it("offers the usual angles in whole degrees, then the functions", () => {
    expect(ANGLE.map(({ label, detail }) => [label, detail])).toEqual([
      ["0deg", "0"],
      ["30deg", "π/6"],
      ["45deg", "π/4"],
      ["60deg", "π/3"],
      ["90deg", "π/2"],
      ["120deg", "2π/3"],
      ["135deg", "3π/4"],
      ["150deg", "5π/6"],
      ["180deg", "π"],
      ["-30deg", "−π/6"],
      ["-45deg", "−π/4"],
      ["-60deg", "−π/3"],
      ["-90deg", "−π/2"],
      ["-120deg", "−2π/3"],
      ["-135deg", "−3π/4"],
      ["-150deg", "−5π/6"],
      ...NUMBER.map(({ label }) => [label, undefined]),
    ]);
  });

  it("keeps the angles in order, between the keywords and the functions", () => {
    const angles = ANGLE.slice(0, 16);

    expect(angles.every(({ type }) => "constant" === type)).toBe(true);
    expect(angles[0].boost).toBe(-1);
    expect(angles[1].boost).toBe(-1.5);
    expect(angles[15].boost).toBe(-8.5);
  });

  it("knows the math functions", () => {
    expect([...MATH]).toEqual(["calc", "min", "max", "clamp"]);
  });

  it.each([
    ["1", true],
    ["-1px", true],
    ["+.5", true],
    [".5em", true],
    ["-.5", true],
    ["var()", true],
    ["attr()", true],
    ["clamp()", true],
    ["round()", false],
    ["a1", false],
    ["-a", false],
    ["#123", false],
  ])("tells whether %s is a number", (token, expected) => {
    expect(isNumber(token)).toBe(expected);
  });

  it.each([
    ["45deg", true],
    ["-1.5rad", true],
    ["+.5turn", true],
    ["100grad", true],
    ["1.deg", true],
    ["10.5deg", true],
    [".55turn", true],
    ["45", false],
    ["45px", false],
    ["deg", false],
    ["a45deg", false],
    ["45degs", false],
    ["calc()", false],
  ])("tells whether %s is an angle", (token, expected) => {
    expect(isAngle(token)).toBe(expected);
  });

  it.each([
    ["circle()", true],
    ["circle", false],
    ["()a", false],
  ])("tells whether %s is a function", (token, expected) => {
    expect(isFunction(token)).toBe(expected);
  });

  it("offers values while the property takes more", () => {
    expect(upTo(["a"], 2, ["b"])).toEqual(["b"]);
    expect(upTo(["a", "a"], 2, ["b"])).toEqual([]);
  });
});
