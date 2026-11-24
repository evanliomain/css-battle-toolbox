import { describe, expect, it } from "vitest";
import { DOM_COLOR } from "../utils/dom-color";
import {
  boxModelImage,
  DEPTH,
  ghostCss,
  HIDDEN,
  HOVER,
  OUTLINE_FLAG,
  OWN,
} from "./ghost-sheet";

/** The declarations of the first rule whose selector list ends with `selector`. */
function rule(selector) {
  const css = ghostCss();
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf("}", start));
}

const RGB = String.raw`rgb\([^)]+\)`;

describe("the ghost stylesheet", () => {
  it("keeps the root background see-through, but never empty", () => {
    // An empty root background hands the canvas the one of <body>, painted over
    // the whole render and outside every transform.
    expect(rule(":root")).toContain(
      "background: linear-gradient(transparent, transparent) !important;",
    );
  });

  it("hides the nodes the tool adds to the head", () => {
    const css = ghostCss();
    const rule = css.slice(css.indexOf(`[${OWN}]`));

    // A head is display:none until the player writes head,style{display:block}
    // to show their own code, and the ghost would then paint ours as well.
    expect(rule).toMatch(/^\[data-cbt-own\] \{\s*display: none !important;/);
  });

  it("switches the contour of the root off with all the others", () => {
    // A descendant combinator starts below the element it names, so gating on
    // ":root:not(...) [data-cbt-depth]" alone left <html> outlined while the
    // option was unchecked.
    expect(ghostCss()).toContain(
      `:root:not([${OUTLINE_FLAG}]):not([${HOVER}]),`,
    );
  });

  it("keeps everything in a layer, so an !important of the player loses", () => {
    expect(ghostCss().startsWith("@layer cbt {")).toBe(true);
  });

  it("gives each depth the colour of its level in the panel, one rule a line", () => {
    const depths = ghostCss()
      .split("\n")
      .map((line) =>
        line.match(/^ {2}\[data-cbt-depth="(\d+)"\] \{ --cbt-color: (.+); \}$/),
      )
      .filter(Boolean)
      .map(([, depth, color]) => [Number(depth), color]);

    expect(depths).toEqual(DOM_COLOR.map((color, depth) => [depth, color]));
    expect(rule(`[${DEPTH}]`)).toContain(
      "outline: 3px dotted var(--cbt-color) !important;",
    );
  });

  it("paints the box model of the hovered layer as a border-image", () => {
    const hover = rule(`[${HOVER}]`);

    // Not a background: the one of the root is painted on the canvas, outside
    // the transforms of <html>.
    expect(hover).not.toContain("background");
    expect(hover).toContain(
      "border-image: var(--cbt-box, none) 0 fill / 0 / var(--cbt-outset, 0px) stretch !important;",
    );
    expect(hover).toContain("outline: none !important;");
    expect(hover).toContain(
      "box-shadow: inset 0 0 0 3px var(--cbt-color) !important;",
    );
  });

  it("greys out the contour of a layer switched off", () => {
    const off = rule(`[${HIDDEN}]`).match(
      new RegExp(String.raw`outline-color: (${RGB}) !important;`),
    );

    expect(off).not.toBeNull();
    // Grey, so it reads apart from every depth colour.
    expect(DOM_COLOR).not.toContain(off[1]);
  });

  it("leaves the labels to the host page", () => {
    expect(ghostCss()).not.toContain("cbt-label");
  });
});

describe("the box model image", () => {
  /** The SVG behind the data URL. */
  function svg(bands) {
    const url = boxModelImage(bands);
    const prefix = 'url("data:image/svg+xml,';
    expect(url.startsWith(prefix)).toBe(true);
    expect(url.endsWith('")')).toBe(true);
    return decodeURIComponent(url.slice(prefix.length, -2));
  }

  function rects(bands) {
    return [
      ...svg(bands).matchAll(/<rect style="([^"]+)" fill="([^"]+)"\/>/g),
    ].map(([, style, fill]) => ({ style, fill }));
  }

  it("nests the margin, border, padding and content boxes, each inset by the bands outside it", () => {
    const boxes = rects([
      [1, 2, 3, 4],
      [10, 20, 30, 40],
      [100, 200, 300, 400],
    ]);

    expect(boxes.map(({ style }) => style)).toEqual([
      "x:0px;y:0px;width:calc(100% - 0px);height:calc(100% - 0px)",
      "x:4px;y:1px;width:calc(100% - 6px);height:calc(100% - 4px)",
      "x:44px;y:11px;width:calc(100% - 66px);height:calc(100% - 44px)",
      "x:444px;y:111px;width:calc(100% - 666px);height:calc(100% - 444px)",
    ]);
  });

  it("gives each box its own opaque colour, made see-through as a whole", () => {
    const zero = [0, 0, 0, 0];
    const fills = rects([zero, zero, zero]).map(({ fill }) => fill);

    expect(new Set(fills).size).toBe(4);
    fills.forEach((fill) => expect(fill).toMatch(/^rgb\(\d+ \d+ \d+\)$/));
    // Opaque boxes under one group opacity: a band never shows the box below.
    expect(svg([zero, zero, zero])).toMatch(
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"><g opacity="0\.55">.*<\/g><\/svg>$/,
    );
  });

  it("escapes the SVG, so the quotes cannot close the url()", () => {
    const zero = [0, 0, 0, 0];
    const url = boxModelImage([zero, zero, zero]);

    expect(url.slice(5, -2)).not.toMatch(/["<>#]/);
  });
});
