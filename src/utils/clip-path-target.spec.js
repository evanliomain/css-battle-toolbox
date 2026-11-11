/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findElement,
  measure,
  targetAt,
  viewportFrame,
} from "./clip-path-target";

/** The target at `|`, the caret. */
function at(code) {
  const pos = code.indexOf("|");
  return targetAt(code.replace("|", ""), pos);
}

describe("targetAt", () => {
  it("finds a style attribute by its rank", () => {
    expect(
      at(`<a style="x"></a><b></b><p style='y'></p><i style="clip-path:|"`),
    ).toEqual({ style: 2 });
  });

  it("finds the selector of the rule", () => {
    expect(at("<style>p{color:red}div.a{clip-path:|}</style>")).toEqual({
      selector: "div.a",
    });
  });

  it("resolves nested rules", () => {
    expect(at("<style>&{*{clip-path:|")).toEqual({ selector: ":is(:root) *" });
    expect(at("<style>a,b{&:hover,>i{clip-path:|")).toEqual({
      selector: ":is(a,b):hover,:is(a,b) >i",
    });
  });

  it("keeps the commas within parentheses", () => {
    expect(at('<style>:is(a,b),[c="d,e"]{clip-path:|')).toEqual({
      selector: ':is(a,b),[c="d,e"]',
    });
  });

  it("skips the at-rules and the closed rules", () => {
    expect(at("<style>@media (x){a{}p{clip-path:|")).toEqual({
      selector: "p",
    });
  });

  it("skips the comments", () => {
    expect(at("<style>/* a{ */p{clip-path:|")).toEqual({ selector: "p" });
  });

  it("is null outside a rule", () => {
    expect(at("<style>clip-path:|")).toBeNull();
    expect(at("<style>@media (x){clip-path:|")).toBeNull();
  });

  it("is null in plain HTML", () => {
    expect(at("<p>|")).toBeNull();
  });
});

describe("findElement", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  /** jsdom lays nothing out: every element but <head>'s gets a box. */
  function layout() {
    vi.spyOn(Element.prototype, "getClientRects").mockImplementation(
      function () {
        return this.closest("head") ? [] : [{}];
      },
    );
  }

  it("finds the element of a style attribute", () => {
    document.body.innerHTML = `<a style="x"></a><b style="y"></b>`;

    expect(findElement(document, { style: 1 }).element.tagName).toBe("B");
  });

  it("finds no element past the last style attribute", () => {
    expect(findElement(document, { style: 3 })).toEqual({
      element: null,
      reason: "element not found",
    });
  });

  it("finds the first element of the selector with a box", () => {
    layout();
    document.body.innerHTML = `<p></p>`;

    expect(findElement(document, { selector: ":root *" }).element.tagName).toBe(
      "BODY",
    );
  });

  it("finds no element the selector matches", () => {
    layout();

    expect(findElement(document, { selector: "canvas" })).toEqual({
      element: null,
      reason: "element not found",
    });
  });

  it("finds no element for an invalid selector", () => {
    expect(findElement(document, { selector: "a[" })).toEqual({
      element: null,
      reason: "element not found",
    });
  });

  it("finds no pseudo-element", () => {
    expect(findElement(document, { selector: "p::before" })).toEqual({
      element: null,
      reason: "pseudo-element",
    });
    expect(findElement(document, { selector: "p:after" }).reason).toBe(
      "pseudo-element",
    );
  });
});

/**
 * An element as `measure` reads it: its computed style, its offsets and its
 * client rect, with an optional parent.
 */
function element({ style = {}, rect, offset, parent = null }) {
  const values = {
    "font-size": "10px",
    "transform-origin": "50px 25px",
    ...style,
  };
  const computed = {
    getPropertyValue: (name) => values[name] ?? "",
    fontSize: values["font-size"],
  };
  const win = {
    getComputedStyle: (el) =>
      el === root ? { fontSize: "20px" } : el.computed,
  };
  const root = {};
  return {
    computed,
    ownerDocument: { defaultView: win, documentElement: root },
    parentElement: parent,
    getBoundingClientRect: () => rect,
    ...offset,
  };
}

/** A parent the child's `getComputedStyle` reaches through its window. */
function withParent(child, parentStyle) {
  const parent = element({ style: parentStyle });
  child.parentElement = parent;
  const own = child.ownerDocument.defaultView.getComputedStyle;
  child.ownerDocument.defaultView.getComputedStyle = (el) =>
    el === parent ? parent.computed : own(el);
  return child;
}

describe("measure", () => {
  const rect = { x: 10, y: 20, width: 100, height: 50 };

  it("reads the client rect of an element without transform", () => {
    expect(measure(element({ rect }), null)).toEqual({
      x: 10,
      y: 20,
      transform: "",
      box: { x: 0, y: 0, width: 100, height: 50 },
      fontSize: 10,
      rootFontSize: 20,
    });
  });

  it("reads the reference box", () => {
    const style = {
      "border-top-width": "1px",
      "border-right-width": "2px",
      "border-bottom-width": "3px",
      "border-left-width": "4px",
      "padding-top": "10px",
      "padding-left": "20px",
      "margin-top": "5px",
      "margin-right": "6px",
    };
    const box = (keyword) => measure(element({ rect, style }), keyword).box;

    expect(box("border-box")).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    expect(box("padding-box")).toEqual({ x: 4, y: 1, width: 94, height: 46 });
    expect(box("content-box")).toEqual({
      x: 24,
      y: 11,
      width: 74,
      height: 36,
    });
    expect(box("margin-box")).toEqual({
      x: -0,
      y: -5,
      width: 106,
      height: 55,
    });
  });

  it("lays out a transformed element from its offsets", () => {
    const parent = { offsetLeft: 5, offsetTop: 6, clientLeft: 1, clientTop: 2 };
    const el = element({
      rect,
      style: { rotate: "30deg" },
      offset: {
        offsetLeft: 10,
        offsetTop: 20,
        offsetWidth: 80,
        offsetHeight: 40,
        offsetParent: { ...parent, offsetParent: null },
      },
    });

    expect(measure(el, null)).toMatchObject({
      x: 16,
      y: 28,
      transform: "translate(50 25) rotate(30) translate(-50 -25)",
      box: { width: 80, height: 40 },
    });
  });

  it("applies the transforms in the order of CSS", () => {
    const el = element({
      rect,
      style: {
        translate: "10px 20px",
        rotate: "45deg",
        scale: "2",
        transform: "matrix(1, 0, 0, 1, 5, 6)",
      },
      offset: {
        offsetLeft: 0,
        offsetTop: 0,
        offsetWidth: 80,
        offsetHeight: 40,
        offsetParent: null,
      },
    });

    expect(measure(el, null).transform).toBe(
      "translate(50 25) translate(10 20) rotate(45) scale(2 2) matrix(1 0 0 1 5 6) translate(-50 -25)",
    );
  });

  it("reads the transforms written in short", () => {
    const transform = (style) =>
      measure(
        element({
          rect,
          style,
          offset: { offsetLeft: 0, offsetTop: 0, offsetParent: null },
        }),
        null,
      ).transform;

    expect(transform({ translate: "10px" })).toBe(
      "translate(50 25) translate(10 0) translate(-50 -25)",
    );
    expect(transform({ scale: "2 3" })).toBe(
      "translate(50 25) scale(2 3) translate(-50 -25)",
    );
    // 3D: left out.
    expect(transform({ rotate: "x 30deg" })).toBe("");
    expect(transform({ transform: "matrix3d(1)" })).toBe("");
  });

  it("measures an element transformed by an ancestor from its offsets", () => {
    const el = withParent(
      element({
        rect,
        offset: {
          offsetLeft: 3,
          offsetTop: 4,
          offsetWidth: 80,
          offsetHeight: 40,
          offsetParent: null,
        },
      }),
      { transform: "matrix(1, 0, 0, 1, 0, 0)" },
    );

    expect(measure(el, null)).toMatchObject({ x: 3, y: 4, transform: "" });
  });

  it("reads the client rect of a transformed SVG element", () => {
    const el = element({ rect, style: { rotate: "30deg" } });

    expect(measure(el, null)).toMatchObject({ x: 10, y: 20 });
  });
});

describe("viewportFrame", () => {
  it("covers the whole render", () => {
    expect(viewportFrame(400, 300)).toEqual({
      x: 0,
      y: 0,
      transform: "",
      box: { x: 0, y: 0, width: 400, height: 300 },
      fontSize: 16,
      rootFontSize: 16,
    });
  });
});
