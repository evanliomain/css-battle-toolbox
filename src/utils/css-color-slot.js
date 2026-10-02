/**
 * Tells whether CSS accepts a color at the end of some cssbattle code, so the
 * snippet tool only offers the target colors where they would be valid.
 *
 * Works on the raw text rather than on CodeMirror's syntax tree: the tree lives
 * in the page's bundle, and plain text keeps this a pure function.
 */

import { declarationAt } from "./css-declaration";

/** @param {string} text words separated by any whitespace */
const words = (text) => new Set(text.trim().split(/\s+/));

/** CSS Color 4 named colors, plus the keywords that also are a color. */
const NAMED_COLORS = words(`
  aliceblue antiquewhite aqua aquamarine azure beige bisque black
  blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate
  coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod
  darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange
  darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray
  darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey
  dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold
  goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory
  khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral
  lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink
  lightsalmon lightseagreen lightskyblue lightslategray lightslategrey
  lightsteelblue lightyellow lime limegreen linen magenta maroon
  mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen
  mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue
  mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange
  orangered orchid palegoldenrod palegreen paleturquoise palevioletred
  papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red
  rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna
  silver skyblue slateblue slategray slategrey snow springgreen steelblue tan
  teal thistle tomato turquoise violet wheat white whitesmoke yellow
  yellowgreen
  transparent currentcolor
  accentcolor accentcolortext activetext buttonborder buttonface buttontext
  canvas canvastext field fieldtext graytext highlight highlighttext linktext
  mark marktext selecteditem selecteditemtext visitedtext
`);

/** Functions whose result is a color, as closed function tokens. */
const COLOR_FUNCTIONS = words(`
  rgb() rgba() hsl() hsla() hwb() lab() lch() oklab() oklch() color()
  color-mix() light-dark() device-cmyk() contrast-color()
`);

/** How many colors each property takes, per comma separated item. */
const COLOR_PROPERTIES = new Map([
  ...[
    ...words(`
      color background background-color accent-color caret caret-color
      border border-top border-right border-bottom border-left
      border-top-color border-right-color border-bottom-color border-left-color
      border-block border-block-start border-block-end
      border-block-start-color border-block-end-color
      border-inline border-inline-start border-inline-end
      border-inline-start-color border-inline-end-color
      outline outline-color
      column-rule column-rule-color row-rule row-rule-color rule rule-color
      text-decoration text-decoration-color text-emphasis text-emphasis-color
      box-shadow text-shadow
      fill stroke stop-color flood-color lighting-color
      -webkit-text-fill-color -webkit-text-stroke -webkit-text-stroke-color
      -webkit-tap-highlight-color
    `),
  ].map((property) => [property, 1]),
  ["border-color", 4],
  ["border-block-color", 2],
  ["border-inline-color", 2],
  ["scrollbar-color", 2],
]);

/** Properties taking an <image>, so a gradient, which holds colors. */
const IMAGE_PROPERTIES = words(`
  background background-image mask mask-image -webkit-mask -webkit-mask-image
  mask-border mask-border-source -webkit-mask-box-image
  border-image border-image-source list-style list-style-image
  content cursor shape-outside -webkit-box-reflect
`);

/** Properties taking a filter list, so drop-shadow(), which holds a color. */
const FILTER_PROPERTIES = words(`
  filter backdrop-filter -webkit-filter -webkit-backdrop-filter
`);

/** The only properties where a comma starts a new item, not an error. */
const LIST_PROPERTIES = words(`
  background background-image box-shadow text-shadow mask mask-image
  -webkit-mask -webkit-mask-image cursor
`);

const NONE = { color: false, image: false, filter: false };

/**
 * What each function takes as arguments, at the point reached in `frame`, and
 * what its parent must accept for the function itself to be valid there.
 */
const FUNCTIONS = [
  {
    names: words(`
      linear-gradient radial-gradient conic-gradient
      repeating-linear-gradient repeating-radial-gradient
      repeating-conic-gradient
      -webkit-linear-gradient -webkit-radial-gradient
      -webkit-repeating-linear-gradient -webkit-repeating-radial-gradient
    `),
    needs: "image",
    // A color starts each color stop. Leaves out the first argument when it
    // is a direction: `to right`, `45deg`, `circle at`, `in oklch`.
    args: (frame) => ({ ...NONE, color: isEmpty(frame) }),
  },
  {
    names: words("image"),
    needs: "image",
    args: (frame) => ({ ...NONE, color: isEmpty(frame) }),
  },
  {
    names: words("cross-fade -webkit-cross-fade"),
    needs: "image",
    args: (frame) => {
      const free = frame.tokens.every((t) => !isColor(t) && !isFunction(t));
      return { ...NONE, color: free, image: free };
    },
  },
  {
    names: words("image-set -webkit-image-set"),
    needs: "image",
    args: (frame) => ({ ...NONE, image: isEmpty(frame) }),
  },
  {
    names: words("drop-shadow"),
    needs: "filter",
    args: (frame) => ({ ...NONE, color: !hasColor(frame) }),
  },
  {
    names: words("color-mix"),
    needs: "color",
    // The first argument is the interpolation method: `in srgb`.
    args: (frame) => ({ ...NONE, color: frame.index > 0 && !hasColor(frame) }),
  },
  {
    names: words("light-dark"),
    needs: "color",
    args: (frame) => ({ ...NONE, color: isEmpty(frame) }),
  },
  {
    names: words("rgb rgba hsl hsla hwb lab lch oklab oklch color"),
    needs: "color",
    // Relative color syntax: `rgb(from red r g b / 50%)`.
    args: (frame) => ({
      ...NONE,
      color: 1 === frame.tokens.length && "from" === frame.tokens[0],
    }),
  },
];

/**
 * @param {string} code everything before the word being typed
 * @returns {boolean} whether a color is valid there
 */
export function colorSlotAt(code) {
  const declaration = declarationAt(code);
  if (null === declaration) {
    return false;
  }
  const { property, stack } = declaration;
  return (
    // What follows a slash is a size or an alpha, never a color.
    "/" !== stack.at(-1).tokens.at(-1) &&
    accepts(stack, stack.length - 1, property).color
  );
}

/** What the innermost item accepts: a color, an image, a filter function. */
function accepts(stack, level, property) {
  const current = stack[level];
  if (0 === level) {
    return rootAccepts(current, property);
  }
  const parent = accepts(stack, level - 1, property);
  if ("var" === current.name) {
    // Only the fallback, which stands for the value itself.
    return current.index > 0 && !hasColor(current) ? parent : NONE;
  }
  const fn = FUNCTIONS.find(({ names }) => names.has(current.name));
  return fn && parent[fn.needs] ? fn.args(current) : NONE;
}

function rootAccepts(root, property) {
  if (/^--[\w-]+$/.test(property)) {
    // A custom property takes anything.
    return { color: true, image: true, filter: true };
  }
  if (root.index > 0 && !LIST_PROPERTIES.has(property)) {
    return NONE;
  }
  const max = COLOR_PROPERTIES.get(property) ?? 0;
  return {
    color: root.tokens.filter(isColor).length < max,
    image: IMAGE_PROPERTIES.has(property),
    filter: FILTER_PROPERTIES.has(property),
  };
}

function isEmpty(frame) {
  return 0 === frame.tokens.length;
}

function hasColor(frame) {
  return frame.tokens.some(isColor);
}

function isColor(token) {
  return (
    token.startsWith("#") ||
    NAMED_COLORS.has(token) ||
    COLOR_FUNCTIONS.has(token)
  );
}

function isFunction(token) {
  return token.endsWith("()");
}
