/**
 * The values of clip-path and offset: the basic shapes, and the paths an
 * element moves along.
 */

import {
  ANGLE,
  NUMBER,
  isFunction,
  isNumber,
  words,
} from "./css-values-grammar";

/** @typedef {import("./css-declaration").Frame} Frame */
/** @typedef {import("./css-values-grammar").Value} Value */

export const SHAPES = words(`
  circle() ellipse() inset() path() polygon() rect() shape() xywh()
`);
const GEOMETRY_BOXES = words(`
  border-box padding-box content-box margin-box fill-box stroke-box view-box
`);
/** The boxes of offset-path: those of clip-path, but margin-box. */
const COORD_BOXES = words(`
  border-box padding-box content-box fill-box stroke-box view-box
`);
const FILL_RULES = words("nonzero evenodd");
export const POSITIONS = words("center top right bottom left");
/** `closest-corner` and `farthest-corner` are not shipped by Chromium yet. */
const EXTENTS = words("closest-side farthest-side");
const COMMANDS = words("move line hline vline curve smooth arc close");
const END_POINT = words("to by");
const ANCHORS = words("start end origin");

// clip-path: none | [ <basic-shape> || <geometry-box> ]

/** @param {Frame[]} stack */
export function clipPath(stack) {
  const [root, shape] = stack;
  if (1 === stack.length) {
    return clipPathRoot(root);
  }
  return BASIC_SHAPES[shape.name]?.(shape) ?? [];
}

function clipPathRoot({ tokens }) {
  const hasShape = tokens.some((token) => SHAPES.includes(token));
  const hasBox = tokens.some((token) => GEOMETRY_BOXES.includes(token));
  // A comma, `none`, or anything else typed there leaves nothing to add.
  if (
    tokens.some(
      (token) => !SHAPES.includes(token) && !GEOMETRY_BOXES.includes(token),
    )
  ) {
    return [];
  }
  return [
    ...(hasShape ? [] : SHAPES),
    ...(0 === tokens.length ? ["none"] : []),
    ...(hasBox ? [] : GEOMETRY_BOXES),
  ];
}

/** What each basic shape takes, at the point reached in its arguments. */
export const BASIC_SHAPES = {
  inset: rectangle({ min: 1, auto: false }),
  xywh: rectangle({ min: 4, auto: false }),
  rect: rectangle({ min: 4, auto: true }),
  circle: radial(1),
  ellipse: radial(2),
  polygon({ index, tokens }) {
    if (index > 0) {
      return tokens.length < 2 ? NUMBER : [];
    }
    if (0 === tokens.length) {
      return [...FILL_RULES, "round", ...NUMBER];
    }
    if ("round" === tokens.at(-1)) {
      return NUMBER;
    }
    if (1 === tokens.length && FILL_RULES.includes(tokens[0])) {
      return ["round"];
    }
    // The first vertex.
    return tokens.length < 2 && isNumber(tokens[0]) ? NUMBER : [];
  },
  path({ index, tokens }) {
    return 0 === index && 0 === tokens.length ? FILL_RULES : [];
  },
  shape({ index, tokens }) {
    return 0 === index ? shapeStart(tokens) : shapeCommand(tokens);
  },
};

/**
 * inset(), xywh() and rect(): up to 4 lengths, then `round` and up to 4 radii,
 * a slash, and 4 more.
 *
 * @param {{ min: number, auto: boolean }} options how many lengths `round`
 *   needs before it, and whether `auto` is a length
 */
function rectangle({ min, auto }) {
  return ({ index, tokens }) => {
    if (index > 0) {
      return [];
    }
    const round = tokens.indexOf("round");
    if (-1 !== round) {
      const radii = tokens.slice(round + 1);
      const slashes = radii.filter((token) => "/" === token).length;
      const half = radii.slice(radii.lastIndexOf("/") + 1);
      return slashes < 2 && half.length < 4 ? NUMBER : [];
    }
    return [
      ...(auto && tokens.length < 4 ? ["auto"] : []),
      ...(tokens.length >= min && tokens.length <= 4 ? ["round"] : []),
      ...(tokens.length < 4 ? NUMBER : []),
    ];
  };
}

/**
 * circle() and ellipse(): a radius for circle(), none or two for ellipse(),
 * then `at` and a position.
 *
 * @param {number} radii
 */
function radial(radii) {
  return ({ index, tokens }) => {
    if (index > 0) {
      return [];
    }
    const at = tokens.indexOf("at");
    if (-1 !== at) {
      return position(tokens.slice(at + 1));
    }
    return [
      ...(tokens.length < radii ? [...EXTENTS, ...NUMBER] : []),
      ...(0 === tokens.length || radii === tokens.length ? ["at"] : []),
    ];
  };
}

/** A <position>: up to 4 keywords and lengths. */
export function position(tokens) {
  return tokens.length < 4 ? [...POSITIONS, ...NUMBER] : [];
}

/** shape( <fill-rule>? from <position>, … ) */
function shapeStart(tokens) {
  const from = tokens.indexOf("from");
  if (-1 !== from) {
    return position(tokens.slice(from + 1));
  }
  if (0 === tokens.length) {
    return [...FILL_RULES, "from"];
  }
  return 1 === tokens.length && FILL_RULES.includes(tokens[0]) ? ["from"] : [];
}

/** One of the comma separated commands of shape(). */
function shapeCommand(tokens) {
  if (0 === tokens.length) {
    return COMMANDS;
  }
  const [command, ...rest] = tokens;
  if ("close" === command || !COMMANDS.includes(command)) {
    return [];
  }
  if (0 === rest.length) {
    return END_POINT;
  }
  const [end, ...values] = rest;
  if (!END_POINT.includes(end)) {
    return [];
  }
  switch (command) {
    case "hline":
      return line(end, values, "left center right x-start x-end");
    case "vline":
      return line(end, values, "top center bottom y-start y-end");
    case "curve":
    case "smooth":
      return curve(end, values);
    case "arc":
      return arc(end, values);
    default:
      return endPoint(end, values);
  }
}

/** hline and vline: a keyword or a length, absolute, or a length. */
function line(end, values, keywords) {
  if (values.length > 0) {
    return [];
  }
  return "to" === end ? [...words(keywords), ...NUMBER] : NUMBER;
}

/** The end point of move, line, curve, smooth and arc: a position, or x y. */
function endPoint(end, values) {
  if ("to" === end) {
    return position(values);
  }
  return values.length < 2 ? NUMBER : [];
}

/** Whether the end point has its values: one at least, or the x and y. */
function hasEndPoint(end, values) {
  return values.length >= ("to" === end ? 1 : 2);
}

/** curve and smooth: the end point, then `with` and the control points. */
function curve(end, values) {
  const at = values.indexOf("with");
  if (-1 === at) {
    return [
      ...endPoint(end, values),
      ...(hasEndPoint(end, values) ? ["with"] : []),
    ];
  }
  // The control point being typed: the second one follows a slash.
  const point = values.slice(Math.max(at, values.lastIndexOf("/")) + 1);
  if ("from" === point.at(-1)) {
    return ANCHORS;
  }
  if (point.includes("from")) {
    return [];
  }
  return [
    // A control point is a position only for an absolute end point.
    ...("to" === end ? position(point) : point.length < 2 ? NUMBER : []),
    ...(2 === point.length ? ["from"] : []),
  ];
}

/** arc: the end point, then `of`, the sweep, the size and `rotate`. */
function arc(end, values) {
  const options = values.filter((value) =>
    words("of cw ccw large small rotate").includes(value),
  );
  const last = values.at(-1);
  if ("of" === last) {
    return NUMBER;
  }
  if ("rotate" === last) {
    return ANGLE;
  }
  if (!hasEndPoint(end, values)) {
    return endPoint(end, values);
  }
  const has = (...keywords) => keywords.some((k) => options.includes(k));
  // One radius after `of`, a second one may follow.
  const radii = values.slice(values.lastIndexOf("of") + 1);
  const radius =
    has("of") && 1 === radii.length && isNumber(last) ? NUMBER : [];
  return [
    // Still in the end point, until the first of the arc's keywords.
    ...(0 === options.length ? endPoint(end, values) : []),
    ...radius,
    ...(has("of") ? [] : ["of"]),
    ...(has("cw", "ccw") ? [] : ["cw", "ccw"]),
    ...(has("large", "small") ? [] : ["large", "small"]),
    ...(has("rotate") ? [] : ["rotate"]),
  ];
}

// offset: [ <offset-position>? [ <offset-path> [ <offset-distance> ||
//   <offset-rotate> ]? ]? ] [ / <offset-anchor> ]?
// <offset-path> = none | [ ray() | <basic-shape> | path() ] || <coord-box>

const PATHS = ["ray()", ...SHAPES];

/** @param {Frame[]} stack */
export function offset(stack) {
  const [root, fn] = stack;
  if (1 === stack.length) {
    return offsetRoot(root.tokens);
  }
  if ("ray" === fn.name) {
    return ray(fn);
  }
  // path() takes no fill rule there, only its string.
  const args = "path" === fn.name ? null : BASIC_SHAPES[fn.name];
  return args ? args(fn) : [];
}

function offsetRoot(tokens) {
  const slash = tokens.indexOf("/");
  if (-1 !== slash) {
    const anchor = tokens.slice(slash + 1);
    return "auto" === anchor[0]
      ? []
      : [...(0 === anchor.length ? ["auto"] : []), ...position(anchor)];
  }
  const path = tokens.findIndex(
    (token) => "none" === token || (isFunction(token) && !isNumber(token)),
  );
  const hasBox = tokens.some((token) => COORD_BOXES.includes(token));
  if (-1 === path) {
    // A box goes with the path, after the position.
    return [
      ...PATHS,
      ...(0 === tokens.length ? ["none", "auto", "normal"] : []),
      ...(hasBox || words("auto normal").includes(tokens[0])
        ? []
        : position(tokens)),
      ...(hasBox ? [] : COORD_BOXES),
    ];
  }
  const after = tokens.slice(path + 1);
  const rotate = after.some((token) => words("auto reverse").includes(token));
  const lengths = after.filter(isNumber).length;
  return [
    ...(hasBox || "none" === tokens[path] ? [] : COORD_BOXES),
    ...(rotate ? [] : ["auto", "reverse"]),
    ...(lengths < 2 ? ANGLE : []),
  ];
}

/** ray( <angle> && <ray-size>? && contain? && [ at <position> ]? ) */
function ray({ index, tokens }) {
  if (index > 0) {
    return [];
  }
  const at = tokens.indexOf("at");
  if (-1 !== at) {
    return position(tokens.slice(at + 1));
  }
  const sizes = words(`
    closest-side closest-corner farthest-side farthest-corner sides
  `);
  return [
    ...(tokens.some((token) => sizes.includes(token)) ? [] : sizes),
    ...(tokens.includes("contain") ? [] : ["contain"]),
    "at",
    ...(tokens.some(isNumber) ? [] : ANGLE),
  ];
}
