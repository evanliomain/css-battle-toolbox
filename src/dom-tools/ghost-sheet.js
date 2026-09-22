import { DOM_COLOR } from "../utils/dom-color";

/** Depth index, `0` on `<html>`. Drives the outline colour. */
export const DEPTH = "data-cbt-depth";
/** Set on the ghost node matching the hovered panel row. */
export const HOVER = "data-cbt-hover";
/** Mirrors of the host classes that toggle the two display modes. */
export const OUTLINE_FLAG = "data-cbt-outline";
export const BACKGROUND_FLAG = "data-cbt-background";

/** Devtools-like box model colours. */
const CONTENT = "rgb(161 197 232 / 0.55)";
const PADDING = "rgb(196 222 184 / 0.55)";
const BORDER = "rgb(251 220 169 / 0.55)";
const MARGIN = "rgb(249 204 158 / 0.45)";

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
     on either and Chrome paints the canvas opaque, hiding the render under it. */
  :root {
    background: transparent !important;
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

  :root:not([${OUTLINE_FLAG}]) [${DEPTH}]:not([${HOVER}]),
  :root:not([${OUTLINE_FLAG}]) *::before,
  :root:not([${OUTLINE_FLAG}]) *::after {
    outline: none !important;
  }

  :root[${BACKGROUND_FLAG}] [${DEPTH}] {
    background-color: color-mix(in srgb, var(--cbt-color) 40%, transparent) !important;
  }

  /* Must stay after the depth rule: same specificity, so source order decides. */
  [${HOVER}] {
    background-image:
      linear-gradient(${CONTENT}, ${CONTENT}),
      linear-gradient(${PADDING}, ${PADDING}),
      linear-gradient(${BORDER}, ${BORDER}) !important;
    background-clip: content-box, padding-box, border-box !important;
    background-origin: border-box !important;
    background-repeat: no-repeat !important;
    /* An element has a single outline slot, so the margin band takes it over and
       the depth contour moves to an inset shadow — which follows the
       border-radius and the transform just the same. */
    outline: var(--cbt-margin, 0px) solid ${MARGIN} !important;
    box-shadow: inset 0 0 0 3px var(--cbt-color) !important;
  }

  /* The label layer is fixed rather than absolute: absolute would join the
     scrollable overflow and could raise a scrollbar the real render has not. */
  cbt-labels {
    position: fixed !important;
    inset: 0 !important;
    display: block !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    pointer-events: none !important;
  }

  cbt-label {
    position: absolute !important;
    left: var(--cbt-x, 0px) !important;
    top: var(--cbt-y, 0px) !important;
    display: block !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    font: 14px sans-serif !important;
    line-height: 1 !important;
    white-space: pre !important;
    color: var(--cbt-color, #fff) !important;
    -webkit-text-fill-color: var(--cbt-color, #fff) !important;
    text-shadow: 1px 1px 1px #000 !important;
  }

  :root:not([${OUTLINE_FLAG}]) cbt-labels {
    display: none !important;
  }
}`;
}
