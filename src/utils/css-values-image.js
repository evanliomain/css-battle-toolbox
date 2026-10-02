/**
 * The values of the properties that paint an image: background, mask,
 * border-image and -webkit-box-reflect, and the gradients they take.
 *
 * Never `url()` nor `image-set()`: a cssbattle solution draws the shape in
 * pure HTML and CSS.
 */

import {
  ANGLE,
  NUMBER,
  VAR,
  isFunction,
  isNumber,
  words,
} from "./css-values-grammar";
import { POSITIONS, position } from "./css-values-shape";

/** @typedef {import("./css-declaration").Frame} Frame */

const LINEAR = words("linear-gradient repeating-linear-gradient");
const RADIAL = words("radial-gradient repeating-radial-gradient");
const CONIC = words("conic-gradient repeating-conic-gradient");
export const GRADIENTS = [...LINEAR, ...RADIAL, ...CONIC].map(
  (name) => `${name}()`,
);

const SIDES = words("top right bottom left");
const SHAPES = words("circle ellipse");
const EXTENTS = words(
  "closest-side closest-corner farthest-side farthest-corner",
);
const RECTANGULAR_SPACES = words(`
  srgb srgb-linear display-p3 a98-rgb prophoto-rgb rec2020 lab oklab
  xyz xyz-d50 xyz-d65
`);
const POLAR_SPACES = words("hsl hwb lch oklch");
const HUES = words("shorter longer increasing decreasing");
/** The words a gradient may start with, before its color stops. */
const PRELUDE = [...words("to in at from"), ...SHAPES, ...EXTENTS];

/**
 * The arguments of a gradient: its direction first, then the color stops.
 *
 * @param {Frame} frame
 */
export function gradient({ name, index, tokens }) {
  const conic = CONIC.includes(name);
  if (index > 0 || isStop(tokens)) {
    return stop(tokens, conic);
  }
  const method = interpolation(tokens);
  // After the direction, the method ends the first argument.
  if (method.values || method.last) {
    return method.values ?? [];
  }
  const { rest } = method;
  const prelude = LINEAR.includes(name)
    ? linear(rest)
    : conic
      ? conicStart(rest)
      : radial(rest);
  return [
    ...prelude,
    ...(method.has || words("to at from").includes(rest.at(-1)) ? [] : ["in"]),
    // Or the first color stop, the others offering var() already.
    ...(conic && 0 === tokens.length ? VAR : []),
  ];
}

/** The first argument may be a color stop already: `red 50%`. */
function isStop(tokens) {
  const [first] = tokens;
  return undefined !== first && !isNumber(first) && !PRELUDE.includes(first);
}

/** A color and up to two positions, the colors from the target. */
function stop(tokens, conic) {
  if (0 === tokens.length) {
    return VAR;
  }
  const positions = tokens.slice(1);
  // A number alone is a color hint: `red, 50%, blue`.
  if (
    isNumber(tokens[0]) ||
    positions.length >= 2 ||
    !positions.every(isNumber)
  ) {
    return [];
  }
  return conic ? ANGLE : NUMBER;
}

/**
 * in [ <rectangular-color-space> | <polar-color-space> <hue> hue? ]
 *
 * @returns {{ has?: boolean, last?: boolean, rest?: string[],
 *   values?: string[] }} what the method still takes, or whether it is there,
 *   whether it follows the direction, and the other tokens
 */
function interpolation(tokens) {
  const at = tokens.indexOf("in");
  if (-1 === at) {
    return { has: false, rest: tokens };
  }
  const [space, hue, keyword] = tokens.slice(at + 1);
  const polar = POLAR_SPACES.includes(space);
  let end = at + 2;
  if (polar && HUES.includes(hue)) {
    end = "hue" === keyword ? at + 4 : at + 3;
  }
  if (undefined === space) {
    return { values: [...RECTANGULAR_SPACES, ...POLAR_SPACES] };
  }
  if (polar && undefined === hue) {
    return { values: HUES };
  }
  if (polar && HUES.includes(hue) && undefined === keyword) {
    return { values: ["hue"] };
  }
  return {
    has: true,
    last: at > 0,
    rest: [...tokens.slice(0, at), ...tokens.slice(end)],
  };
}

/** [ <angle> | to <side-or-corner> ] */
function linear(tokens) {
  if (0 === tokens.length) {
    return ["to", ...ANGLE];
  }
  if ("to" !== tokens[0]) {
    return [];
  }
  const sides = tokens.slice(1);
  if (0 === sides.length) {
    return SIDES;
  }
  // A corner: a side of the other axis.
  return 1 === sides.length
    ? words(
        words("top bottom").includes(sides[0]) ? "left right" : "top bottom",
      )
    : [];
}

/** [ <radial-shape> || <radial-size> ]? [ at <position> ]? */
function radial(tokens) {
  const at = tokens.indexOf("at");
  if (-1 !== at) {
    return position(tokens.slice(at + 1));
  }
  const hasShape = tokens.some((token) => SHAPES.includes(token));
  const hasExtent = tokens.some((token) => EXTENTS.includes(token));
  const lengths = tokens.filter(isNumber).length;
  const hasSize = hasExtent || lengths > 0;
  return [
    ...(hasShape ? [] : SHAPES),
    ...(hasSize ? [] : EXTENTS),
    ...(hasExtent || lengths >= 2 || (tokens.includes("circle") && lengths > 0)
      ? []
      : NUMBER),
    "at",
  ];
}

/** [ from <angle> ]? [ at <position> ]? */
function conicStart(tokens) {
  const at = tokens.indexOf("at");
  if (-1 !== at) {
    return position(tokens.slice(at + 1));
  }
  if ("from" === tokens.at(-1)) {
    return ANGLE;
  }
  return [...(tokens.includes("from") ? [] : ["from"]), "at"];
}

// background: <bg-layer>#, <final-bg-layer>
// <bg-layer> = <bg-image> || <bg-position> [ / <bg-size> ]? ||
//   <repeat-style> || <attachment> || <visual-box> || <visual-box>

const REPEATS = words("repeat-x repeat-y repeat space round no-repeat");
const SIZES = words("auto cover contain");

/**
 * @param {object} options the words particular to each property
 * @param {string[][]} options.groups the components of a layer, besides its
 *   image, position, size and repeat, each taken once
 * @param {string[]} options.boxes the boxes, taken twice at most
 */
function layers({ groups, boxes }) {
  return (stack) => {
    const [root, fn] = stack;
    if (stack.length > 1) {
      return GRADIENTS.includes(`${fn.name}()`) ? gradient(fn) : [];
    }
    return layer(root.tokens, groups, boxes);
  };
}

function layer(tokens, groups, boxes) {
  const slash = tokens.indexOf("/");
  const size = tokens.slice(slash + 1);
  if (-1 !== slash && 0 === size.length) {
    return [...SIZES, ...NUMBER];
  }
  const positions = tokens.filter(
    (token) => POSITIONS.includes(token) || isNumber(token),
  ).length;
  return [
    ...(tokens.some(isImage) ? [] : [...GRADIENTS, "none"]),
    ...(-1 === slash && positions < 4 ? [...POSITIONS, ...NUMBER] : []),
    // The height of a size given by its width.
    ...(-1 !== slash &&
    1 === size.length &&
    (isNumber(size[0]) || "auto" === size[0])
      ? ["auto", ...NUMBER]
      : []),
    ...others(tokens, groups, boxes),
  ];
}

/** The repeat, the boxes, and the components each taken once. */
function others(tokens, groups, boxes) {
  const repeats = tokens.filter((token) => REPEATS.includes(token));
  const last = tokens.at(-1);
  return [
    ...(0 === repeats.length
      ? REPEATS
      : // `repeat space`: two of them, one for each axis.
        1 === repeats.length &&
          last === repeats[0] &&
          !words("repeat-x repeat-y").includes(last)
        ? words("repeat space round no-repeat")
        : []),
    ...groups.flatMap((group) =>
      tokens.some((token) => group.includes(token)) ? [] : group,
    ),
    ...(tokens.filter((token) => boxes.includes(token)).length < 2
      ? boxes
      : []),
  ];
}

export const background = layers({
  groups: [words("scroll fixed local")],
  boxes: words("border-box padding-box content-box text"),
});

export const mask = layers({
  groups: [
    words("add subtract intersect exclude"),
    words("alpha luminance match-source"),
  ],
  boxes: words(`
    border-box padding-box content-box fill-box stroke-box view-box no-clip
  `),
});

// border-image: <source> || <slice> [ / <width>? [ / <outset> ]? ]? || <repeat>

const IMAGE_REPEATS = words("stretch repeat round space");

/** @param {Frame[]} stack */
export function borderImage(stack) {
  const [root, fn] = stack;
  if (stack.length > 1) {
    return GRADIENTS.includes(`${fn.name}()`) ? gradient(fn) : [];
  }
  return [
    ...(0 === root.tokens.length ? ["none"] : []),
    ...imageMask(root.tokens),
  ];
}

/**
 * The mask, -webkit-border-image like: an image, a slice and its widths, a
 * repeat.
 */
export function imageMask(tokens) {
  const slashes = tokens.filter((token) => "/" === token).length;
  const last = tokens.at(-1);
  if (slashes > 0) {
    // The widths after the first slash, the outsets after the second.
    const segment = tokens.slice(tokens.lastIndexOf("/") + 1);
    const width = 1 === slashes;
    const open =
      slashes < 3 &&
      segment.length < 4 &&
      segment.every((token) => isNumber(token) || (width && "auto" === token));
    if (0 === segment.length) {
      return open ? [...(width ? ["auto"] : []), ...NUMBER] : [];
    }
    return [
      ...imageAndRepeat(tokens),
      ...(open ? [...(width ? ["auto"] : []), ...NUMBER] : []),
    ];
  }
  const slice = tokens.filter(isNumber).length;
  return [
    ...imageAndRepeat(tokens),
    ...(isNumber(last) && !tokens.includes("fill") ? ["fill"] : []),
    // 4 numbers at most, side by side.
    ...(0 === slice || (isNumber(last) && slice < 4) ? NUMBER : []),
  ];
}

function imageAndRepeat(tokens) {
  const repeats = tokens.filter((token) => IMAGE_REPEATS.includes(token));
  return [
    ...(tokens.some(isImage) ? [] : GRADIENTS),
    ...(0 === repeats.length ||
    (1 === repeats.length && IMAGE_REPEATS.includes(tokens.at(-1)))
      ? IMAGE_REPEATS
      : []),
  ];
}

// -webkit-box-reflect, as Chromium parses it:
// [ above | below | left | right ] [ <length-percentage> <mask>? ]?

const DIRECTIONS = words("above below left right");

/** @param {Frame[]} stack */
export function boxReflect(stack) {
  const [root, fn] = stack;
  if (stack.length > 1) {
    return GRADIENTS.includes(`${fn.name}()`) ? gradient(fn) : [];
  }
  const { tokens } = root;
  if (0 === tokens.length) {
    return DIRECTIONS;
  }
  if (!DIRECTIONS.includes(tokens[0])) {
    return [];
  }
  // The offset, before any mask.
  if (1 === tokens.length) {
    return NUMBER;
  }
  return imageMask(tokens.slice(2));
}

/** An image, or `none`: any function but those standing for a number. */
function isImage(token) {
  return "none" === token || (isFunction(token) && !isNumber(token));
}
