/**
 * Turns the lengths of a clip-path into pixels of its reference box, and back,
 * for the clip-path tool.
 */

/**
 * @typedef {object} Box the reference box and what its units resolve against
 * @property {number} width
 * @property {number} height
 * @property {number} fontSize for `em`
 * @property {number} rootFontSize for `rem`
 * @property {{ width: number, height: number }} viewport for `vw`, `vh`…
 */

/**
 * What a percentage is a percentage of: the width for `x`, the height for `y`,
 * and for `r`, the radius of circle(), the diagonal divided by √2.
 *
 * @typedef {"x" | "y" | "r"} Basis
 */

/** The absolute units, in pixels. */
const ABSOLUTE = {
  px: 1,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
  in: 96,
  pt: 96 / 72,
  pc: 16,
};

/** Where the position keywords stand, as a percentage of the box. */
export const KEYWORDS = {
  left: 0,
  top: 0,
  "x-start": 0,
  "y-start": 0,
  center: 50,
  right: 100,
  bottom: 100,
  "x-end": 100,
  "y-end": 100,
};

/**
 * @param {string} unit lowercase, `%` included
 * @param {Basis} basis
 * @param {Box} box
 * @returns {number | null} how many pixels one unit is, `null` for a unit the
 *   tool cannot convert
 */
export function unitFactor(unit, basis, box) {
  if (Object.hasOwn(ABSOLUTE, unit)) {
    return ABSOLUTE[unit];
  }
  const { width, height } = box.viewport;
  switch (unit) {
    case "%":
      return basisLength(basis, box) / 100;
    case "vw":
      return width / 100;
    case "vh":
      return height / 100;
    case "vmin":
      return Math.min(width, height) / 100;
    case "vmax":
      return Math.max(width, height) / 100;
    case "em":
      return box.fontSize;
    case "rem":
      return box.rootFontSize;
    default:
      return null;
  }
}

/** @param {Basis} basis @param {Box} box */
export function basisLength(basis, { width, height }) {
  if ("x" === basis) {
    return width;
  }
  if ("y" === basis) {
    return height;
  }
  return Math.hypot(width, height) / Math.SQRT2;
}

/**
 * @param {{ type: string, value?: number, unit?: string }} node
 * @param {Basis} basis
 * @param {Box} box
 * @returns {number | null} the length in pixels, `null` when it is not a
 *   number the tool can convert: calc(), an unknown unit, a unitless number
 *   other than 0
 */
export function toPx(node, basis, box) {
  if ("number" !== node.type) {
    return null;
  }
  if ("" === node.unit) {
    return 0 === node.value ? 0 : null;
  }
  const factor = unitFactor(node.unit, basis, box);
  return null === factor ? null : node.value * factor;
}

/**
 * Writes a length given in pixels in the unit asked.
 *
 * Whole numbers by default; a unit worth 8 pixels or more, like `em`, gets a
 * decimal more. A zero loses its unit.
 *
 * @param {number} px
 * @param {string} unit a unit `unitFactor` converts
 * @param {Basis} basis
 * @param {Box} box
 * @param {number} [precision] how many more decimals, 1 to fine tune
 */
export function format(px, unit, basis, box, precision = 0) {
  const factor = unitFactor(unit, basis, box);
  if (!factor) {
    return "0";
  }
  const digits = precision + (factor >= 8 ? 1 : 0);
  // `+ 0` turns -0 into 0.
  const value = Number((px / factor).toFixed(digits)) + 0;
  return 0 === value ? "0" : `${value}${unit}`;
}
