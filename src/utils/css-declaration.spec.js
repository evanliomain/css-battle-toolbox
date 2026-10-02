import { describe, expect, it } from "vitest";
import { declarationAt } from "./css-declaration";

// Where the CSS is, and what breaks it, is covered by css-color-slot.spec.js.
describe("declarationAt", () => {
  it("reads the property, trimmed and lowercase", () => {
    expect(declarationAt("<style>p{ Clip-Path :")).toEqual({
      property: "clip-path",
      stack: [{ name: undefined, index: 0, tokens: [] }],
    });
  });

  it("reads a style attribute", () => {
    expect(declarationAt('<p style="corner-shape:round ').property).toBe(
      "corner-shape",
    );
  });

  it("splits the value into lowercase tokens", () => {
    expect(declarationAt("<style>p{a:Border-Box  circle() ").stack).toEqual([
      { name: undefined, index: 0, tokens: ["border-box", "circle()"] },
    ]);
  });

  it("tracks the functions still open, and the item of each", () => {
    expect(
      declarationAt("<style>p{a:shape(from 0 0,curve to 1px 2px with 3px/")
        .stack,
    ).toEqual([
      { name: undefined, index: 0, tokens: [] },
      {
        name: "shape",
        index: 1,
        tokens: ["curve", "to", "1px", "2px", "with", "3px", "/"],
      },
    ]);
  });

  it("closes the nested functions", () => {
    expect(
      declarationAt("<style>p{a:inset(calc(1px + 2px) ").stack.at(-1),
    ).toEqual({ name: "inset", index: 0, tokens: ["calc()"] });
  });

  it.each([
    ["plain HTML", "<p>a:"],
    ["no colon yet", "<style>p{clip-path"],
    ["an !important", "<style>p{clip-path:none !"],
    ["a string", '<style>p{clip-path:path("M0 0'],
    ["a closing parenthesis too many", "<style>p{clip-path:circle())"],
    ["a word glued to the previous one", "<style>p{clip-path:circle()a"],
  ])("finds no declaration value in %s", (_, code) => {
    expect(declarationAt(code)).toBeNull();
  });
});
