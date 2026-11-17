import { describe, expect, it } from "vitest";
import { parseClipPath } from "./clip-path-shape";
import { shapeParts, shapeValueAt } from "./clip-path-value";

/** The value around `|`, the caret. */
function at(code) {
  const pos = code.indexOf("|");
  return shapeValueAt(code.replace("|", ""), pos);
}

describe("shapeValueAt", () => {
  it("finds the value of a clip-path in a rule", () => {
    const code = "<style>p{clip-path:polygon(1px |2px);color:red}</style>";

    expect(at(code)).toEqual({
      property: "clip-path",
      from: 19,
      to: 35,
      text: "polygon(1px 2px)",
    });
  });

  it("finds an empty value", () => {
    expect(at("<style>p{clip-path:|}</style>")).toEqual({
      property: "clip-path",
      from: 19,
      to: 19,
      text: "",
    });
  });

  it("finds it with the caret in a number glued to another", () => {
    expect(at("<style>p{clip-path:polygon(5|0%0,1 1)}")?.text).toBe(
      "polygon(50%0,1 1)",
    );
  });

  it("finds the prefixed property", () => {
    expect(at("<style>p{-webkit-clip-path: |circle()")?.text).toBe(" circle()");
  });

  it("finds a border-shape", () => {
    expect(at("<style>p{border-shape:circle(|) inset(9px)}")).toEqual({
      property: "border-shape",
      from: 22,
      to: 41,
      text: "circle() inset(9px)",
    });
  });

  it("finds it in a style attribute", () => {
    expect(at(`<p style="clip-path:inset(|1px)"></p>`)?.text).toBe(
      "inset(1px)",
    );
  });

  it("stops before !important", () => {
    expect(at("<style>p{clip-path:circle(|) !important}")?.text).toBe(
      "circle() ",
    );
  });

  it("keeps a ! within a function", () => {
    expect(at("<style>p{clip-path:circle(|calc(!))}")?.text).toBe(
      "circle(calc(!))",
    );
  });

  it("stops at the end of the rule", () => {
    expect(at("<style>p{clip-path:circle(|)}")?.text).toBe("circle()");
  });

  it("stops an unclosed function at the end of the declaration", () => {
    expect(at("<style>p{clip-path:polygon(1px |2px;color:red}")?.text).toBe(
      "polygon(1px 2px",
    );
  });

  it("reads up to the end of the code", () => {
    expect(at("<style>p{clip-path:circle(|")?.text).toBe("circle(");
  });

  it("is null in another property", () => {
    expect(at("<style>p{color:|red}")).toBeNull();
  });

  it("is null outside a declaration", () => {
    expect(at("<p>|</p>")).toBeNull();
  });

  it("is null in the property name", () => {
    expect(at("<style>p{clip-pa|th:circle()}")).toBeNull();
  });
});

describe("shapeParts", () => {
  /** The shapes and boxes of a value, as names. */
  const parts = (text, property = "border-shape") =>
    shapeParts(parseClipPath(text), property).map(({ shape, box }) => [
      shape?.name ?? null,
      box,
    ]);

  describe("of a clip-path", () => {
    it("takes the shape and its box, in any order", () => {
      expect(parts("content-box circle()", "clip-path")).toEqual([
        ["circle", "content-box"],
      ]);
    });

    it("leaves the box out when none is written", () => {
      expect(parts("polygon()", "clip-path")).toEqual([["polygon", null]]);
    });

    it("draws the box alone without a shape", () => {
      expect(parts("", "-webkit-clip-path")).toEqual([[null, null]]);
    });
  });

  describe("of a border-shape", () => {
    it("strokes a single shape halfway through the border", () => {
      expect(parts("circle(50%)")).toEqual([["circle", "half-border-box"]]);
    });

    it("fills between two shapes, on the border and padding boxes", () => {
      expect(parts("polygon(0 0) polygon(1px 1px)")).toEqual([
        ["polygon", "border-box"],
        ["polygon", "padding-box"],
      ]);
    });

    it("gives each shape the box written after it", () => {
      expect(parts("circle() content-box inset(1px)")).toEqual([
        ["circle", "content-box"],
        ["inset", "padding-box"],
      ]);
      expect(parts("circle() inset(1px) margin-box")).toEqual([
        ["circle", "border-box"],
        ["inset", "margin-box"],
      ]);
      expect(parts("circle() half-border-box")).toEqual([
        ["circle", "half-border-box"],
      ]);
    });

    it("keeps a path() in its place, to draw the other shape right", () => {
      expect(parts("path('M0 0') circle()")).toEqual([
        ["path", "border-box"],
        ["circle", "padding-box"],
      ]);
    });

    it("leaves out a box before any shape, or after another box", () => {
      expect(parts("border-box circle() padding-box content-box")).toEqual([
        ["circle", "padding-box"],
      ]);
    });

    it("leaves out a third shape", () => {
      expect(parts("circle() circle() circle()")).toEqual([
        ["circle", "border-box"],
        ["circle", "padding-box"],
      ]);
    });

    it("draws the box a first shape goes in without a shape", () => {
      expect(parts("")).toEqual([[null, "half-border-box"]]);
      expect(parts("none content-box")).toEqual([[null, "content-box"]]);
    });
  });
});
