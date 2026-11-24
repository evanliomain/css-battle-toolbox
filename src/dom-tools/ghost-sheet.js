import { DOM_COLOR } from "../utils/dom-color";

/** Depth index, `0` on `<html>`. Drives the outline colour. */
export const DEPTH = "data-cbt-depth";
/** Set on the ghost node matching the hovered panel row. */
export const HOVER = "data-cbt-hover";
/** Set on the ghost node of a layer the user switched off from the panel. */
export const HIDDEN = "data-cbt-hidden";
/** Set on the nodes this tool adds to the ghost, which the player never wrote. */
export const OWN = "data-cbt-own";
/** Mirrors of the host classes that toggle the two display modes. */
export const OUTLINE_FLAG = "data-cbt-outline";
export const BACKGROUND_FLAG = "data-cbt-background";

/**
 * Devtools-like box model colours. Opaque, because the four boxes are drawn
 * nested, one over the other: the see-through comes from the opacity of the
 * group, so a band never shows the colour of the box under it.
 */
const BOX_COLORS = [
  "rgb(249 204 158)", // margin
  "rgb(251 220 169)", // border
  "rgb(196 222 184)", // padding
  "rgb(161 197 232)", // content
];
const BOX_OPACITY = 0.55;

/** Reads on both a light and a dark render, and on none of the depth colours. */
const OFF = "rgb(160 160 160 / 0.9)";

/**
 * The stylesheet injected into the ghost document.
 *
 * Everything here is paint: not one declaration can change a box, so the ghost
 * lays out exactly like the document it clones — which is the whole point of
 * cloning rather than rebuilding boxes by hand.
 *
 * It all lives in a cascade layer on purpose. For `!important` declarations the
 * layer order is reversed and unlayered styles come last, so a layered
 * `!important` beats the player's own `!important` — which a specificity fight
 * between `*` and, say, `.a::before` would lose.
 */
export function ghostCss() {
  const colors = DOM_COLOR.map(
    (color, depth) => `  [${DEPTH}="${depth}"] { --cbt-color: ${color}; }`,
  ).join("\n");

  return `@layer cbt {
  /* The canvas has to stay see-through, and that takes both halves: a
     transparent root background, and a used color-scheme equal to the one on
     the <iframe> element, which createGhost pins to normal for this. Disagree
     on either and Chrome paints the canvas opaque, hiding the render under it.
   *
   * Transparent, but not empty: a root with no background at all hands the
   * canvas the one of <body>, which is then painted over the whole render and
   * outside the transforms of both — the background mode filled the output
   * with the colour of body. An image, even a see-through one, stops that. */
  :root {
    background: linear-gradient(transparent, transparent) !important;
    color-scheme: normal !important;
  }

  /* The content property is never touched: none drops a pseudo-element's box
     and "" empties it, and either one moves the boxes around it. Same reason
     border-color is neutralised but border-style is not: none forces the used
     border width to zero. */
  *,
  *::before,
  *::after {
    background: none !important;
    border-color: transparent !important;
    border-image: none !important;
    box-shadow: none !important;
    clip-path: none !important;
    color: transparent !important;
    mask: none !important;
    -webkit-mask: none !important;
    -webkit-text-fill-color: transparent !important;
    -webkit-text-stroke-color: transparent !important;
    mix-blend-mode: normal !important;
    opacity: 1 !important;
    outline-offset: 0 !important;
    text-decoration-color: transparent !important;
    text-shadow: none !important;
    visibility: visible !important;
  }

  /* The <base> and the <style> elements this tool adds to the head. A head is
     display:none until the player writes head,style{display:block} to put their
     own code on screen — and then the ghost would grow three boxes the render
     has not. Hiding a <style> does not stop its rules from applying. */
  [${OWN}] {
    display: none !important;
  }

${colors}

  [${DEPTH}] {
    outline: 3px dotted var(--cbt-color) !important;
  }

  /* Pseudo-elements are shapes too, and the panel cannot list them — a dashed
     grey contour is the only place they show up at all. */
  *::before,
  *::after {
    outline: 2px dashed rgb(136 136 136 / 0.65) !important;
  }

  /* A layer switched off from the panel. It is gone from the render, but its
     contour stays right where it was, in grey — which only works because the
     hiding uses opacity: it does not reflow, so the ghost, which never receives
     the rule, still lays out exactly like the render. */
  [${HIDDEN}] {
    outline-color: ${OFF} !important;
  }

  /* The root is named on its own, element and pseudo-elements alike: a
     descendant combinator cannot reach the element it starts from, so the html
     contour stayed on screen with the option unchecked. */
  :root:not([${OUTLINE_FLAG}]):not([${HOVER}]),
  :root:not([${OUTLINE_FLAG}])::before,
  :root:not([${OUTLINE_FLAG}])::after,
  :root:not([${OUTLINE_FLAG}]) [${DEPTH}]:not([${HOVER}]),
  :root:not([${OUTLINE_FLAG}]) *::before,
  :root:not([${OUTLINE_FLAG}]) *::after {
    outline: none !important;
  }

  :root[${BACKGROUND_FLAG}] [${DEPTH}] {
    background-color: color-mix(in srgb, var(--cbt-color) 40%, transparent) !important;
  }

  /* Must stay after the depth rule: same specificity, so source order decides.
   *
   * A border-image, not a background: the background of the root is the one of
   * the canvas, painted outside every transform of <html>, so on a rotated root
   * the box model showed up in the top-left corner, far from the shape. A
   * border-image belongs to its element, transform included, and its outset
   * gives each side its own margin. The image itself comes from boxModelImage,
   * set inline by setHover. */
  [${HOVER}] {
    border-image: var(--cbt-box, none) 0 fill / 0 / var(--cbt-outset, 0px) stretch !important;
    /* The depth contour moves to an inset shadow, so it stays inside the box
       model rather than over its margin band. */
    outline: none !important;
    box-shadow: inset 0 0 0 3px var(--cbt-color) !important;
  }
}`;
}

/**
 * The box model of one element, as an image to stretch over its margin box.
 *
 * The four boxes are nested rectangles, each inset from the edge of the image by
 * the sum of the bands outside it. The insets are pixels and the sizes are
 * percentages, so the image needs neither the size of the element nor a
 * viewBox: it is drawn at whatever size the border-image area ends up.
 *
 * @param {number[][]} bands margin, border and padding, each as
 *   `[top, right, bottom, left]` in pixels
 * @returns {string} a CSS `url()`
 */
export function boxModelImage(bands) {
  const inset = [0, 0, 0, 0];
  const rects = BOX_COLORS.map((color, index) => {
    if (0 < index) {
      bands[index - 1].forEach((width, side) => {
        inset[side] += width;
      });
    }
    const [top, right, bottom, left] = inset;
    return `<rect style="x:${left}px;y:${top}px;width:calc(100% - ${left + right}px);height:calc(100% - ${top + bottom}px)" fill="${color}"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><g opacity="${BOX_OPACITY}">${rects}</g></svg>`;

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
