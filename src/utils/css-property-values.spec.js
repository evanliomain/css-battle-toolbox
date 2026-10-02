import { describe, expect, it } from "vitest";
import { propertyValuesAt } from "./css-property-values";
import { ANGLE, NUMBER } from "./css-values-grammar";

/** In a rule of an unclosed <style>, like most cssbattle golf. */
const rule = (declaration) => `<p></p><style>p{${declaration}`;

/** The labels offered after a declaration, `null` when not ours. */
const labelsAfter = (declaration) =>
  propertyValuesAt(rule(declaration))?.map(({ label }) => label) ?? null;

const words = (text) => text.trim().split(/\s+/);

const N = NUMBER.map(({ label }) => label);
const A = ANGLE.map(({ label }) => label);
const STYLES = words(`
  none hidden dotted dashed solid double groove ridge inset outset
`);
const CORNER_SHAPES = words(`
  round scoop bevel notch square squircle superellipse()
`);

describe("propertyValuesAt", () => {
  describe("which declaration", () => {
    it.each([
      ["another property", "position:"],
      ["a custom property", "--clip-path:"],
      ["the shorthand of radius and shape", "corner:"],
    ])("leaves %s to the site", (_, declaration) => {
      expect(labelsAfter(declaration)).toBeNull();
    });

    it("leaves code outside a declaration to the site", () => {
      expect(propertyValuesAt("<p>clip-path:")).toBeNull();
    });

    it.each([
      ["clip-path", "clip-path:"],
      ["the prefixed clip-path", "-webkit-clip-path:"],
      ["an uppercase property", "CLIP-PATH:"],
      ["a style attribute", '<p style="clip-path:'],
    ])("reads %s", (_, declaration) => {
      const code = declaration.startsWith("<")
        ? declaration
        : rule(declaration);

      expect(propertyValuesAt(code)).toHaveLength(16);
    });
  });

  describe("the values", () => {
    it("puts the functions of the property ahead of its keywords", () => {
      const values = propertyValuesAt(rule("clip-path:"));

      expect(values[0]).toEqual({
        label: "circle()",
        type: "function",
        boost: 50,
      });
      expect(values.find(({ label }) => "none" === label)).toEqual({
        label: "none",
        type: "keyword",
      });
    });

    it("keeps the numbers and the angles as they are", () => {
      expect(propertyValuesAt(rule("rotate:x "))).toEqual(ANGLE);
    });
  });

  describe("var(), attr() and the math functions", () => {
    it("leaves the name of a variable to the site", () => {
      expect(labelsAfter("clip-path:var(")).toBeNull();
      expect(labelsAfter("margin:1px var(")).toBeNull();
    });

    it.each([
      [
        "a value",
        "border:var(--b,",
        [...STYLES, "thin", "medium", "thick", ...N],
      ],
      ["the end of a value", "border:2px var(--b,", [...STYLES, "var()"]],
      ["the rest of a value", "border:2px var(--b,solid ", ["var()"]],
      ["more items", "box-shadow:var(--s,1px 1px,", ["inset", ...N]],
      [
        "a gradient",
        "background:radial-gradient(1q var(--g,1q ",
        ["circle", "ellipse", "at", "in"],
      ],
      [
        "a nested fallback",
        "border:var(--a,var(--b,2px ",
        [...STYLES, "var()"],
      ],
    ])("reads the fallback of var() as %s", (_, declaration, labels) => {
      expect(labelsAfter(declaration)).toEqual(labels);
    });

    it("offers nothing in a function of the fallback", () => {
      expect(labelsAfter("margin:var(--a,foo(")).toEqual([]);
    });

    it("offers nothing in a function of the variable name", () => {
      expect(labelsAfter("margin:var(foo(")).toEqual([]);
    });

    it.each([
      [
        "a comma of a list",
        "box-shadow:1px 1px 1px 1px var(--s,a,",
        ["inset", ...N],
      ],
      ["a comma of another value", "margin:var(--m,1px,", []],
    ])("reads the fallback of var() after %s", (_, declaration, labels) => {
      expect(labelsAfter(declaration)).toEqual(labels);
    });

    it("offers nothing in attr()", () => {
      expect(labelsAfter("rotate:attr(")).toEqual([]);
      expect(labelsAfter("rotate:attr(r ")).toEqual([]);
    });

    it.each([
      ["calc(", "clip-path:calc("],
      ["min(", "margin:min("],
      ["max(", "margin:max(1px,"],
      ["clamp(", "padding:clamp(1px,"],
      ["a math function in a shape", "clip-path:circle(calc("],
      ["a nested math function", "margin:min(5vw,calc("],
    ])("offers the numbers in %s", (_, declaration) => {
      expect(labelsAfter(declaration)).toEqual(N);
    });

    it("offers nothing in round(), no math function of ours", () => {
      expect(labelsAfter("margin:round(")).toEqual([]);
    });
  });

  describe("commas and nested functions", () => {
    it.each([["margin:1px,"], ["rotate:45deg,"], ["clip-path:circle(),"]])(
      "offers nothing after a comma in %s",
      (declaration) => {
        expect(labelsAfter(declaration)).toEqual([]);
      },
    );

    it.each([
      ["background:none,"],
      ["mask:none,"],
      ["box-shadow:1px 1px,"],
      ["text-shadow:1px 1px,"],
      ["font:1px a,"],
    ])("goes on after a comma in %s", (declaration) => {
      expect(labelsAfter(declaration).length).toBeGreaterThan(0);
    });

    it.each([
      ["clip-path:circle(rgb("],
      ["background:radial-gradient(rgb("],
      ["margin:foo("],
    ])("offers nothing in another function, in %s", (declaration) => {
      expect(labelsAfter(declaration)).toEqual([]);
    });
  });

  describe("margin and padding", () => {
    it.each([
      ["margin", 4],
      ["margin-block", 2],
      ["margin-inline", 2],
      ["margin-top", 1],
      ["margin-inline-end", 1],
    ])("offers auto and the numbers in %s, %i at most", (property, max) => {
      expect(labelsAfter(`${property}:${"1px ".repeat(max - 1)}`)).toEqual([
        "auto",
        ...N,
      ]);
      expect(labelsAfter(`${property}:${"1px ".repeat(max)}`)).toEqual([]);
    });

    it.each([
      ["padding", 4],
      ["padding-block", 2],
      ["padding-left", 1],
      ["padding-block-start", 1],
    ])("offers the numbers in %s, %i at most", (property, max) => {
      expect(labelsAfter(`${property}:${"1px ".repeat(max - 1)}`)).toEqual(N);
      expect(labelsAfter(`${property}:${"1px ".repeat(max)}`)).toEqual([]);
    });
  });

  describe("border-radius", () => {
    it.each([
      ["", N],
      ["1px 2px 3px ", N],
      ["1px 2px 3px 4px ", []],
      ["1px/", N],
      ["1px/1px 2px 3px ", N],
      ["1px/1px 2px 3px 4px ", []],
      ["1px/1px/", []],
    ])("offers after border-radius:%s", (value, labels) => {
      expect(labelsAfter(`border-radius:${value}`)).toEqual(labels);
    });

    it.each(
      words(`
        top-left top-right bottom-right bottom-left
        start-start start-end end-start end-end
      `),
    )("offers two numbers in the %s corner", (corner) => {
      expect(labelsAfter(`border-${corner}-radius:1px `)).toEqual(N);
      expect(labelsAfter(`border-${corner}-radius:1px 2px `)).toEqual([]);
    });
  });

  describe("the sizes", () => {
    it.each(words("width height inline-size block-size"))(
      "offers the sizing keywords in %s",
      (property) => {
        expect(labelsAfter(`${property}:`)).toEqual([
          ...words("auto min-content max-content fit-content stretch"),
          ...N,
        ]);
        expect(labelsAfter(`${property}:1px `)).toEqual([]);
      },
    );
  });

  describe("the single values", () => {
    it.each([
      ["color", ["var()"]],
      ["opacity", N],
      ["outline-offset", N],
      ["zoom", ["normal", ...N]],
      ["letter-spacing", ["normal", ...N]],
      ["float", words("none left right inline-start inline-end")],
    ])("offers in %s", (property, labels) => {
      expect(labelsAfter(`${property}:`)).toEqual(labels);
      expect(labelsAfter(`${property}:a `)).toEqual([]);
    });

    it("offers the display types of Chromium, no experimental one", () => {
      expect(labelsAfter("display:")).toEqual(
        words(`
          block inline inline-block flex inline-flex grid inline-grid
          flow-root none contents list-item flow table inline-table
          table-row-group table-header-group table-footer-group table-row
          table-column-group table-column table-cell table-caption ruby
          ruby-text math -webkit-box -webkit-inline-box
        `),
      );
      expect(labelsAfter("display:block ")).toEqual([]);
    });
  });

  describe("the shadows", () => {
    it.each([
      ["box-shadow:", ["none", "inset", ...N]],
      ["box-shadow:1px 1px ", ["inset", ...N]],
      ["box-shadow:inset 1px 1px 1px ", N],
      ["box-shadow:1px 1px 1px 1px ", ["inset", "var()"]],
      ["box-shadow:none ", []],
      ["box-shadow:1px 1px,", ["inset", ...N]],
      ["text-shadow:", ["none", ...N]],
      ["text-shadow:1px 1px ", N],
      ["text-shadow:1px 1px 1px ", ["var()"]],
      ["text-shadow:1px 1px,", N],
    ])("offers after %s", (declaration, labels) => {
      expect(labelsAfter(declaration)).toEqual(labels);
    });
  });

  describe("the transforms", () => {
    it.each([
      ["scale:", ["none", ...N]],
      ["scale:1 2 ", N],
      ["scale:1 2 3 ", []],
      ["scale:none ", []],
      ["translate:", ["none", ...N]],
      ["translate:1px ", N],
      ["rotate:", ["none", "x", "y", "z", ...A]],
      ["rotate:45deg ", ["x", "y", "z"]],
      ["rotate:x ", A],
      ["rotate:z 45deg ", []],
      ["rotate:45deg y ", []],
      ["rotate:none ", []],
      ["rotate:1 ", N],
      ["rotate:1 1 ", N],
      ["rotate:1 1 0 ", A],
      ["rotate:1 1 0 45deg ", []],
      ["rotate:1 1 1 1 ", []],
    ])("offers after %s", (declaration, labels) => {
      expect(labelsAfter(declaration)).toEqual(labels);
    });

    const FUNCTIONS = words(`
      matrix() matrix3d() perspective() rotate() rotate3d() rotateX()
      rotateY() rotateZ() scale() scale3d() scaleX() scaleY() scaleZ() skew()
      skewX() skewY() translate() translate3d() translateX() translateY()
      translateZ()
    `);

    it.each([
      ["", ["none", ...FUNCTIONS]],
      ["rotate() ", FUNCTIONS],
      ["none ", []],
    ])("offers the functions after transform:%s", (value, labels) => {
      expect(labelsAfter(`transform:${value}`)).toEqual(labels);
    });

    it.each([
      ["matrix", 6, N],
      ["matrix3d", 16, N],
      ["perspective", 1, N],
      ["rotate", 1, A],
      ["rotate3d", 4, A],
      ["rotateX", 1, A],
      ["rotateY", 1, A],
      ["rotateZ", 1, A],
      ["scale", 2, N],
      ["scale3d", 3, N],
      ["scaleX", 1, N],
      ["scaleY", 1, N],
      ["scaleZ", 1, N],
      ["skew", 2, A],
      ["skewX", 1, A],
      ["skewY", 1, A],
      ["translate", 2, N],
      ["translate3d", 3, N],
      ["translateX", 1, N],
      ["translateY", 1, N],
      ["translateZ", 1, N],
    ])("offers the arguments of %s(), %i of them", (name, count, last) => {
      const args = (n) => `transform:${name}(${"0,".repeat(n)}`;

      expect(labelsAfter(args(count - 1))).toEqual(last);
      expect(labelsAfter(args(count))).toEqual([]);
    });

    it.each([
      ["rotate(", A],
      ["rotateY(", A],
      ["skew(", A],
      ["skew(1deg,", A],
      ["skew(1deg,1deg,", []],
      ["skewX(", A],
      ["rotate3d(1,1,", N],
      ["rotate3d(1,1,1,", A],
      ["translateX(", N],
      ["translate(1px,", N],
      ["translate(1px,1px,", []],
      ["matrix(1,0,0,1,0,", N],
      ["matrix(1,0,0,1,0,0,", []],
      ["perspective(", N],
      ["rotate(45deg ", []],
      ["foo(", []],
    ])("offers the arguments of %s", (args, labels) => {
      expect(labelsAfter(`transform:${args}`)).toEqual(labels);
    });
  });

  describe("corner-shape", () => {
    it("offers the corner shapes, superellipse() as a function", () => {
      expect(labelsAfter("corner-shape:")).toEqual(CORNER_SHAPES);
    });

    it.each([
      ["corner-shape:round round round ", CORNER_SHAPES],
      ["corner-shape:round round round superellipse() ", []],
      ["corner-top-shape:bevel ", CORNER_SHAPES],
      ["corner-top-shape:bevel bevel ", []],
      ["corner-inline-end-shape:bevel bevel ", []],
      ["corner-top-left-shape:", CORNER_SHAPES],
      ["corner-top-left-shape:notch ", []],
      ["corner-end-end-shape:notch ", []],
    ])("counts the corners of %s", (declaration, labels) => {
      expect(labelsAfter(declaration)).toEqual(labels);
    });

    it.each([
      ["superellipse(", ["infinity", "-infinity", ...N]],
      ["superellipse(2 ", []],
      ["superellipse(2,", []],
      ["superellipse(calc(", N],
      ["foo(", []],
    ])("offers in %s", (args, labels) => {
      expect(labelsAfter(`corner-shape:${args}`)).toEqual(labels);
    });
  });
});
