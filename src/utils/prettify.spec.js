import { describe, expect, it, vi } from "vitest";
import { prettify } from "./prettify";

// The extension is bundled for the browser, where "prettier" resolves to its
// standalone build: it ships without any parser, so the CSS plugin is needed.
vi.mock("prettier", async () => await import("prettier/standalone"));

const style = (css) => `<style>\n${css}</style>`;

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

  it("formats a <style> tag that has attributes", async () => {
    expect(await prettify('<style id="x">a{color:red')).toBe(
      style("a {\n  color: red;\n}\n"),
    );
  });

  it("drops a closing brace that has no opening one", async () => {
    expect(await prettify("<style>a{color:red}}b{color:blue")).toBe(
      "<style>\na {\n  color: red;\n}\nb {\n  color: blue;\n}\n</style>",
    );
  });

  it("collapses the spaces inside a string", async () => {
    expect(await prettify('<style>a{content:"a  b"}')).toBe(
      style('a {\n  content: "a b";\n}\n'),
    );
  });

  describe("unfinished code", () => {
    it("closes a single quote left open at the end", async () => {
      expect(await prettify("<style>a{content:'")).toBe(
        style('a {\n  content: "";\n}\n'),
      );
    });

    it("closes a quote left open before trailing spaces", async () => {
      expect(await prettify("<style>a{content:'   ")).toBe(
        style('a {\n  content: "";\n}\n'),
      );
    });

    it("closes a double quote left open at the end", async () => {
      expect(await prettify('<style>a{content:"')).toBe(
        style('a {\n  content: "";\n}\n'),
      );
    });

    it("leaves complete strings alone", async () => {
      expect(await prettify("<style>a{content:'x'}")).toBe(
        style('a {\n  content: "x";\n}\n'),
      );
      expect(await prettify('<style>a{content:"x"}')).toBe(
        style('a {\n  content: "x";\n}\n'),
      );
    });

    it("closes a parenthesis left open", async () => {
      expect(await prettify("<style>a{background:rgb(0 0 0")).toBe(
        style("a {\n  background: rgb(0 0 0);\n}\n"),
      );
    });
  });

  describe("minified values", () => {
    it("separates a colour glued to the previous word", async () => {
      expect(await prettify("<style>a{border:1px solid#000}")).toBe(
        style("a {\n  border: 1px solid #000;\n}\n"),
      );
    });

    it("separates a minus sign glued to a closing parenthesis", async () => {
      expect(await prettify("<style>a{margin:var(--a)-1px}")).toBe(
        style("a {\n  margin: var(--a) -1px;\n}\n"),
      );
    });

    it("separates a percentage from the next value", async () => {
      expect(await prettify("<style>a{background-position:50%50%}")).toBe(
        style("a {\n  background-position: 50% 50%;\n}\n"),
      );
    });

    it("puts spaces around a slash", async () => {
      expect(await prettify("<style>a{aspect-ratio:1/2}")).toBe(
        style("a {\n  aspect-ratio: 1 / 2;\n}\n"),
      );
    });

    it("separates decimals glued together", async () => {
      expect(await prettify("<style>a{margin:.25.5}")).toBe(
        style("a {\n  margin: 0.25 0.5;\n}\n"),
      );
    });

    it("separates a decimal glued to a unit", async () => {
      expect(await prettify("<style>a{margin:5px.5px}")).toBe(
        style("a {\n  margin: 5px 0.5px;\n}\n"),
      );
      expect(await prettify("<style>a{transition:1s.5s}")).toBe(
        style("a {\n  transition: 1s 0.5s;\n}\n"),
      );
    });

    it("separates three decimals glued together", async () => {
      expect(await prettify("<style>a{margin:.5.0.1ch}")).toBe(
        style("a {\n  margin: 0.5 0 0.1ch;\n}\n"),
      );
    });

    it("separates a decimal glued to a word", async () => {
      expect(await prettify("<style>a{outline:solid.6lh}")).toBe(
        style("a {\n  outline: solid 0.6lh;\n}\n"),
      );
      expect(await prettify("<style>a{outline:SOLID.6lh}")).toBe(
        style("a {\n  outline: SOLID 0.6lh;\n}\n"),
      );
    });

    it.each(["#abcdef", "#abcd", "#abc", "#abc123", "#ab12", "#a12"])(
      "separates a decimal glued to the colour %s",
      async (color) => {
        expect(await prettify(`<style>a{box-shadow:0 0 ${color}.5em`)).toBe(
          style(`a {\n  box-shadow: 0 0 ${color} 0.5em;\n}\n`),
        );
      },
    );

    it("writes #0000 as transparent", async () => {
      expect(await prettify("<style>a{background:#0000}")).toBe(
        style("a {\n  background: transparent;\n}\n"),
      );
    });
  });

  describe("plus sign", () => {
    it("sticks the number to the + of a formula", async () => {
      expect(await prettify("<style>li:nth-child(2n+1){color:red}")).toBe(
        style("li:nth-child(2n +1) {\n  color: red;\n}\n"),
      );
    });

    it("sticks the number to the + even when the line wraps after it", async () => {
      const long = "111111111111111111111111";
      expect(
        await prettify(
          `<style>a{width:calc(${long}1px + ${long}2px + ${long}3px)}`,
        ),
      ).toBe(
        style(
          `a {\n  width: calc(\n    ${long}1px +${long}2px +${long}3px\n  );\n}\n`,
        ),
      );
    });
  });
});
