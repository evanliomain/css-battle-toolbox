/**
 * The values the snippet tool suggests for the properties of cssbattle
 * solutions, whose generic CSS completion makes no sense: only what Chromium
 * parses there, where it fits.
 *
 * Never `url()` nor any other external resource: a cssbattle solution draws the
 * shape in pure HTML and CSS.
 */

import { declarationAt } from "./css-declaration";
import {
  SIDES,
  border,
  borderStyle,
  borderWidth,
  outline,
  outlineStyle,
  textStroke,
} from "./css-values-border";
import { font } from "./css-values-font";
import {
  ANGLE,
  MATH,
  NUMBER,
  VAR,
  isAngle,
  isNumber,
  upTo,
  words,
} from "./css-values-grammar";
import { background, borderImage, boxReflect, mask } from "./css-values-image";
import { clipPath, offset } from "./css-values-shape";

/** @typedef {import("./css-declaration").Frame} Frame */
/** @typedef {import("./css-values-grammar").Value} Value */

/** Puts the functions particular to a property ahead of its keywords. */
const FUNCTION_BOOST = 50;

/**
 * @param {string} code everything before the word being typed
 * @returns {Value[] | null} the values valid there; `null` when the property
 *   is not one of those, so the site's own completion stays
 */
export function propertyValuesAt(code) {
  const declaration = declarationAt(code);
  if (null === declaration) {
    return null;
  }
  const { property, stack } = declaration;
  const values = PROPERTIES.has(property) ? valuesIn(property, stack) : null;
  return values ? values.map(toValue) : null;
}

/**
 * @param {string} property
 * @param {Frame[]} stack
 */
function valuesIn(property, stack) {
  const variable = stack.findIndex(({ name }) => "var" === name);
  if (-1 !== variable) {
    const { index, tokens } = stack[variable];
    if (0 === index) {
      // The site lists the variables of the code.
      return stack.length - 1 === variable ? null : [];
    }
    // The fallback stands for the value: `border: 2px var(--b, solid`.
    const parent = stack[variable - 1];
    const value = {
      ...parent,
      index: parent.index + index - 1,
      tokens: 1 === index ? [...parent.tokens, ...tokens] : tokens,
    };
    return valuesIn(property, [
      ...stack.slice(0, variable - 1),
      value,
      ...stack.slice(variable + 1),
    ]);
  }
  if (stack.some(({ name }) => MATH.has(name))) {
    return NUMBER;
  }
  if ((stack[0].index > 0 && !LISTS.has(property)) || stack.length > 2) {
    return [];
  }
  return PROPERTIES.get(property)(stack);
}

/** @param {string | Value} value */
function toValue(value) {
  if ("string" !== typeof value) {
    return value;
  }
  return value.endsWith("()")
    ? { label: value, type: "function", boost: FUNCTION_BOOST }
    : { label: value, type: "keyword" };
}

/** The only properties where a comma starts a new item, not an error. */
const LISTS = new Set(words("background mask box-shadow text-shadow font"));

/**
 * A property taking no function of its own: its values, from the words of the
 * value itself.
 *
 * @param {(frame: Frame) => (string | Value)[]} values
 */
const plain = (values) => (stack) =>
  1 === stack.length ? values(stack[0]) : [];

/** @param {(string | Value)[]} values offered while the value is empty */
const first = (values) => plain(({ tokens }) => upTo(tokens, 1, values));

/** @param {number} max how many colors the property takes */
const colors = (max) => plain(({ tokens }) => upTo(tokens, max, VAR));

// margin, padding: <length-percentage>{1,4}, and `auto` for margin.

/** @param {string[]} keywords */
const box = (keywords) => (max) =>
  plain(({ tokens }) => upTo(tokens, max, [...keywords, ...NUMBER]));

// border-radius: <length-percentage>{1,4} [ / <length-percentage>{1,4} ]?

const borderRadius = plain(({ tokens }) => {
  const slashes = tokens.filter((token) => "/" === token).length;
  const half = tokens.slice(tokens.lastIndexOf("/") + 1);
  return slashes < 2 && half.length < 4 ? NUMBER : [];
});

const RADII = words(`
  top-left top-right bottom-right bottom-left
  start-start start-end end-start end-end
`);

// box-shadow: none | [ <color>? && <length>{2,4} && inset? ]#
// text-shadow: none | [ <color>? && <length>{2,3} ]#

/**
 * @param {number} lengths how many lengths a shadow takes
 * @param {string[]} keywords the keywords a shadow takes once
 */
const shadow = (lengths, keywords) =>
  plain(({ index, tokens }) => {
    if (tokens.includes("none")) {
      return [];
    }
    return [
      ...(0 === index && 0 === tokens.length ? ["none"] : []),
      ...keywords.filter((keyword) => !tokens.includes(keyword)),
      // Then the color.
      ...(tokens.filter(isNumber).length < lengths ? NUMBER : VAR),
    ];
  });

// scale: none | [ <number> | <percentage> ]{1,3}
// translate: none | <length-percentage> [ <length-percentage> <length>? ]?

const transform3d = plain(({ tokens }) => {
  if (tokens.includes("none")) {
    return [];
  }
  return [...(0 === tokens.length ? ["none"] : []), ...upTo(tokens, 3, NUMBER)];
});

// rotate: none | <angle> | [ x | y | z | <number>{3} ] && <angle>

const AXES = words("x y z");

const rotate = plain(({ tokens }) => {
  if (0 === tokens.length) {
    return ["none", ...AXES, ...ANGLE];
  }
  const [token] = tokens;
  if (1 === tokens.length && isAngle(token)) {
    return AXES;
  }
  if (1 === tokens.length && AXES.includes(token)) {
    return ANGLE;
  }
  // The vector, then the angle.
  const vector = tokens.filter((t) => isNumber(t) && !isAngle(t)).length;
  if (tokens.length !== vector) {
    return [];
  }
  return vector < 3 ? NUMBER : 3 === vector ? ANGLE : [];
});

// transform: none | <transform-function>+

/** The arguments of each transform function: N a number, A an angle. */
const TRANSFORMS = new Map(
  Object.entries({
    matrix: "NNNNNN",
    matrix3d: "NNNNNNNNNNNNNNNN",
    perspective: "N",
    rotate: "A",
    rotate3d: "NNNA",
    rotateX: "A",
    rotateY: "A",
    rotateZ: "A",
    scale: "NN",
    scale3d: "NNN",
    scaleX: "N",
    scaleY: "N",
    scaleZ: "N",
    skew: "AA",
    skewX: "A",
    skewY: "A",
    translate: "NN",
    translate3d: "NNN",
    translateX: "N",
    translateY: "N",
    translateZ: "N",
  }).map(([name, args]) => [name.toLowerCase(), { name, args }]),
);

/** @param {Frame[]} stack */
function transform(stack) {
  const [root, fn] = stack;
  if (1 === stack.length) {
    return root.tokens.includes("none")
      ? []
      : [
          ...(0 === root.tokens.length ? ["none"] : []),
          ...[...TRANSFORMS.values()].map(({ name }) => `${name}()`),
        ];
  }
  const arg = TRANSFORMS.get(fn.name)?.args[fn.index];
  if (fn.tokens.length > 0 || undefined === arg) {
    return [];
  }
  return "A" === arg ? ANGLE : NUMBER;
}

// corner-shape: <corner-shape-value>{1,4}

const CORNER_SHAPES = words(`
  round scoop bevel notch square squircle superellipse()
`);

/** @param {number} max how many corners the property sets */
function cornerShape(max) {
  return (stack) => {
    const [root, fn] = stack;
    if (1 === stack.length) {
      return upTo(root.tokens, max, CORNER_SHAPES);
    }
    return "superellipse" === fn.name &&
      0 === fn.index &&
      0 === fn.tokens.length
      ? ["infinity", "-infinity", ...NUMBER]
      : [];
  };
}

/** Every corner of corner-shape, by how many values it takes. */
const CORNERS = [
  [4, ["corner-shape"]],
  [
    2,
    words(`
      corner-top-shape corner-right-shape corner-bottom-shape corner-left-shape
      corner-block-start-shape corner-block-end-shape
      corner-inline-start-shape corner-inline-end-shape
    `),
  ],
  [
    1,
    words(`
      corner-top-left-shape corner-top-right-shape
      corner-bottom-right-shape corner-bottom-left-shape
      corner-start-start-shape corner-start-end-shape
      corner-end-start-shape corner-end-end-shape
    `),
  ],
];

/** The properties of each side, from how many values they take. */
const bySide = (prefix, suffix, grammar) =>
  SIDES.flatMap(([max, sides]) =>
    sides.map((side) => [`${prefix}${side}${suffix}`, grammar(max)]),
  );

/** @type {Map<string, (stack: Frame[]) => (string | Value)[] | null>} */
const PROPERTIES = new Map([
  ["clip-path", clipPath],
  ["-webkit-clip-path", clipPath],
  ["offset", offset],
  ["background", background],
  ["mask", mask],
  ["border-image", borderImage],
  ["-webkit-box-reflect", boxReflect],
  ["font", plain(font)],
  ...CORNERS.flatMap(([max, properties]) =>
    properties.map((property) => [property, cornerShape(max)]),
  ),

  ...bySide("border", "", () => plain(border)),
  ...bySide("border", "-width", (max) => plain(borderWidth(max))),
  ...bySide("border", "-style", (max) => plain(borderStyle(max))),
  ...bySide("border", "-color", colors),
  ["outline", plain(outline)],
  ["outline-width", plain(borderWidth(1))],
  ["outline-style", plain(outlineStyle)],
  ["outline-color", colors(1)],
  ["outline-offset", first(NUMBER)],
  ["-webkit-text-stroke", plain(textStroke)],
  ["border-radius", borderRadius],
  ...RADII.map((corner) => [
    `border-${corner}-radius`,
    plain(({ tokens }) => upTo(tokens, 2, NUMBER)),
  ]),

  ...bySide("margin", "", box(["auto"])),
  ...bySide("padding", "", box([])),
  ...words("width height inline-size block-size").map((property) => [
    property,
    first([
      ...words("auto min-content max-content fit-content stretch"),
      ...NUMBER,
    ]),
  ]),

  ["color", colors(1)],
  ["opacity", first(NUMBER)],
  ["box-shadow", shadow(4, ["inset"])],
  ["text-shadow", shadow(3, [])],
  ["scale", transform3d],
  ["translate", transform3d],
  ["rotate", rotate],
  ["transform", transform],
  ["zoom", first(["normal", ...NUMBER])],
  ["letter-spacing", first(["normal", ...NUMBER])],
  ["float", first(words("none left right inline-start inline-end"))],
  [
    "display",
    first(
      words(`
        block inline inline-block flex inline-flex grid inline-grid flow-root
        none contents list-item flow table inline-table table-row-group
        table-header-group table-footer-group table-row table-column-group
        table-column table-cell table-caption ruby ruby-text math
        -webkit-box -webkit-inline-box
      `),
    ),
  ],
]);
