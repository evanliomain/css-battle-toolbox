import { describe, expect, it } from "vitest";
import { prettify } from "./prettify";

describe("prettify", () => {
  it("leaves code without a <style> tag alone", async () => {
    expect(await prettify("<div></div>")).toBe("<div></div>");
  });

  it("drops the leading line break", async () => {
    expect(await prettify("\n<p></p>")).toBe("<p></p>");
  });

  it("formats the CSS and puts <style> on its own line", async () => {
    expect(await prettify("<p></p><style>a{margin:0 auto")).toBe(
      "<p></p>\n<style>\na {\n  margin: 0 auto;\n}\n</style>",
    );
  });

  it("drops a closing brace that has no opening one", async () => {
    expect(await prettify("<style>a{color:red}}b{color:blue")).toBe(
      "<style>\na {\n  color: red;\n}\nb {\n  color: blue;\n}\n</style>",
    );
  });
});
