import { describe, expect, it } from "vitest";
import { DOM_COLOR } from "../utils/dom-color";
import {
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
  it("cuts the label layer off from the played code", () => {
    const css = ghostCss();

    // The labels are elements of the played document, so `* * { scale: -1 }` —
    // ordinary golf — used to mirror every one of them.
    expect(css).toContain("cbt-labels *,");
    expect(css).toContain("all: initial !important;");
  });

  it("resets the labels before styling them, not after", () => {
    const css = ghostCss();

    // `cbt-labels *` and `cbt-label` have the same specificity, so the reset
    // would wipe the position and the colour if it came last.
    expect(css.indexOf("all: initial")).toBeLessThan(
      css.indexOf("cbt-label {"),
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

  it("paints the box model of the hovered layer like the devtools", () => {
    const hover = rule(`[${HOVER}]`);
    // One flat gradient per band, painted from the content box outwards.
    const bands = [
      ...hover.matchAll(
        new RegExp(String.raw`linear-gradient\((${RGB}), \1\)`, "g"),
      ),
    ].map(([, color]) => color);
    const margin = hover.match(
      new RegExp(
        String.raw`outline: var\(--cbt-margin, 0px\) solid (${RGB}) !important;`,
      ),
    );

    expect(bands).toHaveLength(3);
    expect(margin).not.toBeNull();
    // Content, padding, border and margin each get their own colour.
    expect(new Set([...bands, margin[1]]).size).toBe(4);
    expect(hover).toContain(
      "background-clip: content-box, padding-box, border-box !important;",
    );
  });

  it("greys out the contour and the label of a layer switched off", () => {
    const off = rule(`[${HIDDEN}]`).match(
      new RegExp(String.raw`outline-color: (${RGB}) !important;`),
    );
    const label = rule(`cbt-label[${HIDDEN}]`);

    expect(off).not.toBeNull();
    expect(label).toContain(`  color: ${off[1]} !important;`);
    expect(label).toContain(`-webkit-text-fill-color: ${off[1]} !important;`);
    // Grey, so it reads apart from every depth colour.
    expect(DOM_COLOR).not.toContain(off[1]);
  });
});
