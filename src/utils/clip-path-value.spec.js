import { describe, expect, it } from "vitest";
import { clipPathAt } from "./clip-path-value";

/** The value around `|`, the caret. */
function at(code) {
  const pos = code.indexOf("|");
  return clipPathAt(code.replace("|", ""), pos);
}

describe("clipPathAt", () => {
  it("finds the value of a clip-path in a rule", () => {
    const code = "<style>p{clip-path:polygon(1px |2px);color:red}</style>";

    expect(at(code)).toEqual({
      from: 19,
      to: 35,
      text: "polygon(1px 2px)",
    });
  });

  it("finds an empty value", () => {
    expect(at("<style>p{clip-path:|}</style>")).toEqual({
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
