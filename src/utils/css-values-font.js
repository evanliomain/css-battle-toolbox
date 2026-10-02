/**
 * The values of font:
 * [ <font-style> || <font-variant-css2> || <font-weight> ||
 *   <font-width-css3> ]? <font-size> [ / <line-height> ]? <font-family>#
 * or a system font.
 */

import { NUMBER, isNumber, words } from "./css-values-grammar";

/** @typedef {import("./css-declaration").Frame} Frame */

const SYSTEM_FONTS = words(`
  caption icon menu message-box small-caption status-bar
`);
const WEIGHTS = words("bold bolder lighter");
/** What may come before the size, each once; `normal` stands for any. */
const BEFORE_SIZE = [
  words("italic oblique"),
  words("small-caps"),
  WEIGHTS,
  words(`
    ultra-condensed extra-condensed condensed semi-condensed
    semi-expanded expanded extra-expanded ultra-expanded
  `),
];
const SIZES = words(`
  xx-small x-small small medium large x-large xx-large xxx-large
  larger smaller
`);
/** The generic families Chromium knows. */
const FAMILIES = words(`
  serif sans-serif monospace cursive fantasy system-ui math
`);

/** @param {Frame} root */
export function font({ index, tokens }) {
  if (index > 0) {
    // Another family.
    return 0 === tokens.length ? FAMILIES : [];
  }
  if (tokens.some((token) => SYSTEM_FONTS.includes(token))) {
    return [];
  }
  const size = tokens.findIndex(isSize);
  if (-1 === size) {
    const before = BEFORE_SIZE.flatMap((group) =>
      tokens.some(
        (token) =>
          group.includes(token) || (WEIGHTS === group && isNumber(token)),
      )
        ? []
        : group,
    );
    return [
      ...(0 === tokens.length ? SYSTEM_FONTS : []),
      ...(tokens.length < 4 ? ["normal", ...before] : []),
      ...SIZES,
      ...NUMBER,
    ];
  }
  const after = tokens.slice(size + 1);
  if ("/" === after[0]) {
    return 1 === after.length
      ? ["normal", ...NUMBER]
      : after.length === 2
        ? FAMILIES
        : [];
  }
  return 0 === after.length ? FAMILIES : [];
}

/**
 * A size keyword, or a length or a percentage. A number with no unit but 0 is
 * a weight.
 */
function isSize(token) {
  if (SIZES.includes(token)) {
    return true;
  }
  // Number() reads no unit.
  return (
    isNumber(token) && (Number.isNaN(Number(token)) || 0 === Number(token))
  );
}
