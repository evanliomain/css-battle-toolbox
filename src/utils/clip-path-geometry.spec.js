import { describe, expect, it } from "vitest";
import { basisLength, format, toPx, unitFactor } from "./clip-path-geometry";

const box = {
  width: 200,
  height: 100,
  fontSize: 10,
  rootFontSize: 20,
  viewport: { width: 400, height: 300 },
};

const number = (value, unit) => ({ type: "number", value, unit });

describe("unitFactor", () => {
  it.each([
    ["px", "x", 1],
    ["in", "x", 96],
    ["pc", "x", 16],
    ["%", "x", 2],
    ["%", "y", 1],
    ["vw", "y", 4],
    ["vh", "x", 3],
    ["vmin", "x", 3],
    ["vmax", "x", 4],
    ["em", "x", 10],
    ["rem", "x", 20],
  ])("converts %s along %s", (unit, basis, factor) => {
    expect(unitFactor(unit, basis, box)).toBe(factor);
  });

  it("knows no other unit", () => {
    expect(unitFactor("foo", "x", box)).toBeNull();
  });
});

describe("basisLength", () => {
  it("measures a radius against the diagonal over √2", () => {
    expect(basisLength("r", { width: 300, height: 400 })).toBeCloseTo(
      500 / Math.SQRT2,
    );
  });
});

describe("toPx", () => {
  it("converts a length", () => {
    expect(toPx(number(50, "%"), "x", box)).toBe(100);
  });

  it("reads a unitless 0", () => {
    expect(toPx(number(0, ""), "x", box)).toBe(0);
  });

  it("does not read another unitless number", () => {
    expect(toPx(number(5, ""), "x", box)).toBeNull();
  });

  it("does not read an unknown unit", () => {
    expect(toPx(number(5, "foo"), "x", box)).toBeNull();
  });

  it("does not read a function", () => {
    expect(toPx({ type: "function" }, "x", box)).toBeNull();
  });
});

describe("format", () => {
  it("writes whole numbers", () => {
    expect(format(33.3, "%", "x", box)).toBe("17%");
  });

  it("writes a decimal more to fine tune", () => {
    expect(format(33.4, "%", "x", box, 1)).toBe("16.7%");
  });

  it("writes a decimal more for a large unit", () => {
    expect(format(33, "em", "x", box)).toBe("3.3em");
  });

  it("drops the unit of 0", () => {
    expect(format(-0.2, "px", "x", box)).toBe("0");
  });

  it("writes 0 in a box with no size", () => {
    expect(format(10, "%", "x", { ...box, width: 0 })).toBe("0");
  });

  it("writes 0 in an unknown unit", () => {
    expect(format(10, "foo", "x", box)).toBe("0");
  });
});
