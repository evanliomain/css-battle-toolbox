/**
 * What the grammars of css-property-values.js share: how to write a list of
 * values, and what stands for a number.
 */

/** @param {string} text words separated by any whitespace */
export const words = (text) => text.trim().split(/\s+/);

/**
 * @typedef {object} Value
 * @property {string} label a keyword, or a function as `name()`
 * @property {"keyword" | "function" | "constant"} type
 * @property {string} [detail]
 * @property {number} [boost]
 */

/**
 * The functions that stand for a number, behind the keywords. var() and attr()
 * stand for any value.
 */
const NUMBER_FUNCTIONS = words("var() attr() calc() min() max() clamp()");

/** Where a length, a number or a percentage goes. */
export const NUMBER = NUMBER_FUNCTIONS.map((label) => ({
  label,
  type: "function",
  boost: -10,
}));

/** Where some other value goes, a color most of the time. */
export const VAR = NUMBER.slice(0, 1);

/** The usual angles, each in whole degrees. */
const ANGLES = [
  ["0deg", "0"],
  ["30deg", "π/6"],
  ["45deg", "π/4"],
  ["60deg", "π/3"],
  ["90deg", "π/2"],
  ["120deg", "2π/3"],
  ["135deg", "3π/4"],
  ["150deg", "5π/6"],
  ["180deg", "π"],
  ["-30deg", "−π/6"],
  ["-45deg", "−π/4"],
  ["-60deg", "−π/3"],
  ["-90deg", "−π/2"],
  ["-120deg", "−2π/3"],
  ["-135deg", "−3π/4"],
  ["-150deg", "−5π/6"],
].map(([label, detail], index) => ({
  label,
  type: "constant",
  detail,
  // In this order, between the keywords and the math functions.
  boost: -1 - index / 2,
}));

/** Where an angle goes. */
export const ANGLE = [...ANGLES, ...NUMBER];

/** The functions that compute a number, whatever the property. */
export const MATH = new Set(["calc", "min", "max", "clamp"]);

/** @param {string} token */
export function isFunction(token) {
  return token.endsWith("()");
}

/**
 * A number, a length, a percentage or an angle, or a function standing for
 * one.
 *
 * @param {string} token
 */
export function isNumber(token) {
  return /^[+-]?\.?\d/.test(token) || NUMBER_FUNCTIONS.includes(token);
}

/** @param {string} token */
export function isAngle(token) {
  return /^[+-]?(\d+\.?\d*|\.\d+)(deg|grad|rad|turn)$/.test(token);
}

/**
 * @param {string[]} tokens
 * @param {number} max how many values the property takes
 * @param {(string | Value)[]} values
 */
export function upTo(tokens, max, values) {
  return tokens.length < max ? values : [];
}
