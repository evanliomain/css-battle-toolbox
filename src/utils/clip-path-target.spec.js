/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findElement,
  measure,
  targetAt,
  toRender,
  unitSizes,
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
  /** Where the corners of the reference box land in the render. */
  const corners = (frame) => {
    const { width, height } = frame.box;
    return [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ].map(([x, y]) => {
      const at = toRender(frame, { x, y });
      return [Number(at.x.toFixed(6)) + 0, Number(at.y.toFixed(6)) + 0];
    });
  };

  it("reads the client rect of an element without transform", () => {
    expect(measure(element({ rect }), null)).toEqual({
      transform: "translate(10 20)",
      matrix: { a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 },
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
    expect(box("half-border-box")).toEqual({
      x: 2,
      y: 0.5,
      width: 97,
      height: 48,
    });
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

  it("turns a rotated element in its client rect", () => {
    // 80×40, turned a quarter around its center (140, 70).
    const el = element({
      rect: { x: 120, y: 30, width: 40, height: 80 },
      style: { rotate: "90deg" },
      offset: { offsetWidth: 80, offsetHeight: 40 },
    });

    const frame = measure(el, null);
    expect(frame.transform).toBe("matrix(0 1 -1 0 160 30)");
    expect(corners(frame)).toEqual([
      [160, 30],
      [160, 110],
      [120, 110],
      [120, 30],
    ]);
  });

  it("applies the transforms in the order of CSS", () => {
    // Scaled twice as wide, then turned a quarter: 80 tall.
    const el = element({
      rect: { x: 0, y: 0, width: 40, height: 80 },
      style: {
        translate: "10px 20px",
        rotate: "0.25turn",
        scale: "2 1",
        transform: "matrix(1, 0, 0, 1, 5, 6)",
      },
      offset: { offsetWidth: 40, offsetHeight: 40 },
    });

    expect(corners(measure(el, null))).toEqual([
      [40, 0],
      [40, 80],
      [0, 80],
      [0, 0],
    ]);
  });

  it("reads the rotations, scales and skews written in every way", () => {
    const transform = (style) =>
      measure(
        element({
          rect,
          style,
          offset: { offsetWidth: 100, offsetHeight: 50 },
        }),
        null,
      ).transform;

    expect(transform({ rotate: "z 180deg" })).toBe("matrix(-1 0 0 -1 110 70)");
    expect(transform({ rotate: "0 0 1 3.14159265rad" })).toBe(
      "matrix(-1 0 0 -1 110 70)",
    );
    expect(transform({ rotate: "200grad" })).toBe("matrix(-1 0 0 -1 110 70)");
    expect(transform({ scale: "-1" })).toBe("matrix(-1 0 0 -1 110 70)");
    expect(transform({ transform: "matrix(1, 0, 1, 1, 0, 0)" })).toBe(
      "matrix(1 0 1 1 10 20)",
    );
    // Moves only: the client rect has them.
    expect(transform({ translate: "10px 20%" })).toBe("translate(10 20)");
    // 3D: left out.
    expect(transform({ rotate: "x 30deg" })).toBe("translate(10 20)");
    expect(transform({ transform: "matrix3d(1)" })).toBe("translate(10 20)");
    // Inline boxes do not take transforms.
    expect(transform({ rotate: "90deg", display: "inline" })).toBe(
      "translate(10 20)",
    );
  });

  it("applies the transforms of the ancestors after its own", () => {
    // Stretched twice as wide by itself, then turned a quarter by its parent.
    const el = withParent(
      element({
        rect: { x: 0, y: 0, width: 40, height: 80 },
        style: { scale: "2 1" },
        offset: { offsetWidth: 40, offsetHeight: 40 },
      }),
      { rotate: "90deg" },
    );

    expect(corners(measure(el, null))).toEqual([
      [40, 0],
      [40, 80],
      [0, 80],
      [0, 0],
    ]);
  });

  it("mirrors an element in a mirrored ancestor", () => {
    const el = withParent(
      element({ rect, offset: { offsetWidth: 100, offsetHeight: 50 } }),
      { scale: "-1 1" },
    );

    expect(corners(measure(el, null))).toEqual([
      [110, 20],
      [10, 20],
      [10, 70],
      [110, 70],
    ]);
  });

  it("sizes a transformed SVG element from its client rect", () => {
    const el = element({ rect, style: { scale: "-1 1" } });

    expect(measure(el, null).box).toMatchObject({ width: 100, height: 50 });
  });
});

describe("unitSizes", () => {
  /** The font style of each probe. */
  let fonts;

  afterEach(() => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    vi.restoreAllMocks();
  });

  /** jsdom computes no length: the margin is read as the render would. */
  function resolving(sizes) {
    fonts = [];
    const own = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((el) => {
      const style = own(el);
      if ("CBT-PROBE" !== el.tagName) {
        return style;
      }
      fonts.push(el.style.getPropertyValue("font-style"));
      return {
        get marginLeft() {
          // jsdom drops a unit it does not know, as the render would.
          const [, value, unit] = /^([\d.]+)([a-z]+)$/.exec(
            el.style.marginLeft,
          ) ?? [, 0, "px"];
          return `${value * (sizes[unit] ?? 1)}px`;
        },
      };
    });
  }

  it("resolves the units on a probe with the element's font", () => {
    resolving({ lh: 18, ch: 8.5 });
    const p = document.createElement("p");
    p.style.font = "italic 20px serif";
    document.body.append(p);

    expect(unitSizes(p, ["lh", "ch", "lh"])).toEqual({ lh: 18, ch: 8.5 });
    expect(fonts).toEqual(["italic"]);
    // Gone at once.
    expect(document.querySelector("cbt-probe")).toBeNull();
  });

  it("leaves out the units the render does not know, and containers'", () => {
    resolving({ lh: 18, cqw: 4 });

    expect(unitSizes(document.body, ["foo", "cqw", "lh"])).toEqual({ lh: 18 });
  });

  it("measures again only when the element or its font changes", () => {
    resolving({ lh: 18 });
    const p = document.createElement("p");
    document.body.append(p);
    const append = vi.spyOn(document.documentElement, "append");

    unitSizes(p, ["lh"]);
    unitSizes(p, ["lh"]);
    expect(append).toHaveBeenCalledTimes(1);

    p.style.fontStyle = "italic";
    unitSizes(p, ["lh"]);
    expect(append).toHaveBeenCalledTimes(2);

    const other = document.createElement("p");
    document.body.append(other);
    unitSizes(other, ["lh"]);
    expect(append).toHaveBeenCalledTimes(3);
  });

  it("asks nothing for no unit", () => {
    const spy = vi.spyOn(document, "createElement");

    expect(unitSizes(document.body, [])).toEqual({});
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("toRender", () => {
  it("places a point of the reference box", () => {
    const frame = {
      matrix: { a: 0, b: 1, c: -1, d: 0, e: 100, f: 10 },
      box: { x: 5, y: 0, width: 10, height: 10 },
    };

    expect(toRender(frame, { x: 1, y: 2 })).toEqual({ x: 98, y: 16 });
  });
});

describe("viewportFrame", () => {
  it("covers the whole render", () => {
    expect(viewportFrame(400, 300)).toEqual({
      transform: "translate(0 0)",
      matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      box: { x: 0, y: 0, width: 400, height: 300 },
      fontSize: 16,
      rootFontSize: 16,
    });
  });
});
