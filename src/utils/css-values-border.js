/**
 * The values of the borders and the outline: a width, a style and a color,
 * the colors coming from the target.
 */

import { NUMBER, VAR, isNumber, upTo, words } from "./css-values-grammar";

const WIDTHS = words("thin medium thick");
const STYLES = words(`
  none hidden dotted dashed solid double groove ridge inset outset
`);
/** An outline can be `auto`, never `hidden`. */
const OUTLINE_STYLES = ["auto", ...STYLES.filter((s) => "hidden" !== s)];

function isWidth(token) {
  return WIDTHS.includes(token) || isNumber(token);
}

/**
 * <line-width> || <line-style> || <color>
 *
 * @param {string[]} styles
 */
function line(styles) {
  return ({ tokens }) => {
    if (tokens.length >= 3) {
      return [];
    }
    return [
      ...(tokens.some((token) => styles.includes(token)) ? [] : styles),
      ...(tokens.some(isWidth) ? VAR : [...WIDTHS, ...NUMBER]),
    ];
  };
}

export const border = line(STYLES);
export const outline = line(OUTLINE_STYLES);

/** @param {number} max how many sides the property sets */
export const borderWidth =
  (max) =>
  ({ tokens }) =>
    upTo(tokens, max, [...WIDTHS, ...NUMBER]);

/** @param {number} max how many sides the property sets */
export const borderStyle =
  (max) =>
  ({ tokens }) =>
    upTo(tokens, max, STYLES);

export const outlineStyle = ({ tokens }) => upTo(tokens, 1, OUTLINE_STYLES);

/** -webkit-text-stroke: <line-width> || <color> */
export function textStroke({ tokens }) {
  if (tokens.length >= 2) {
    return [];
  }
  return tokens.some(isWidth) ? VAR : [...WIDTHS, ...NUMBER];
}

/** The sides of a border, by how many values the property takes. */
export const SIDES = [
  [4, [""]],
  [2, ["-block", "-inline"]],
  [
    1,
    words(`
      -top -right -bottom -left
      -block-start -block-end -inline-start -inline-end
    `),
  ],
];
