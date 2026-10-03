import { describe, expect, it } from "vitest";
import { dependsOnFonts } from "./font-dependent";

describe("dependsOnFonts", () => {
  it.each([
    ["5ch", "<style>*{border:5ch solid}"],
    ["15ex", "<style>*{box-shadow:15ex 0}"],
    [".85lh", "<style>*{border:solid.85lh}"],
    ["1cap", "<style>*{margin:1cap}"],
    ["2ic", "<style>*{margin:2ic}"],
    ["rch", "<style>*{margin:3rch}"],
    ["rlh", "<style>*{margin:3rlh}"],
    ["UPPERCASE units", "<style>*{margin:3CH}"],
    ["font", '<style>*{font:5pc""}'],
    ["font-size", "<style>*{font-size:9px}"],
    ["font-family", "<style>*{font-family:a}"],
    ["font with a space before its colon", "<style>*{font :9px a}"],
    ["text before the style", "----- <style>*{margin:0}"],
    ["text in a tag", "<p>.</p><style>*{margin:0}"],
    ["text after the style", "<style>*{margin:0}</style>x"],
  ])("is true with %s", (_, code) => {
    expect(dependsOnFonts(code)).toBe(true);
  });

  it.each([
    ["only em", "<style>*{margin:5em 2rem}"],
    ["pixels", "<style>*{margin:10px 20;background:#f00}"],
    ["tags only", "<p><p x><style>*{margin:0}"],
    ["blank lines", "<p>\n  <p>\n<style>\n*{margin:0}\n</style>\n"],
    ["a comment", "<!-- a note --><style>*{margin:0}"],
    ["a comment with a > in it", "<!-- 1 > 0 --><style>*{margin:0}"],
    ["an unclosed comment", "<style>*{margin:0}</style><!-- a > b"],
    ["an unclosed tag", "<style>*{margin:0}</style><p"],
    ["a word ending like a unit", "<style>*{background:teal}"],
    ["no code", ""],
  ])("is false with %s", (_, code) => {
    expect(dependsOnFonts(code)).toBe(false);
  });
});
