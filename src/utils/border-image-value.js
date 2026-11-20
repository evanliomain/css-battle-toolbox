/**
 * Reads a border-image value as golfers write it, glued and in any order, to
 * know where its slices, widths, outsets, `fill` and repeat stand in the code,
 * and rewrites them for the border-image tool.
 *
 * What they draw is left to the render, read on the element: this only tells
 * the text apart.
 */

import { parseClipPath, shortSides } from "./clip-path-shape";
import { valueAt } from "./clip-path-value";

export const PROPERTIES = ["border-image"];

/** The groups of 1 to 4 values, in the order the shorthand writes them. */
export const GROUPS = ["slice", "width", "outset"];

export const REPEATS = ["stretch", "repeat", "round", "space"];

/** The functions standing for a number, which the tool reads but never drags. */
const MATH = ["calc", "min", "max", "clamp"];

/** What a left out value of each group stands for. */
export const DEFAULTS = { slice: "100%", width: "1", outset: "0" };

/** Which of 1 to 4 values each side takes, top right bottom left. */
const SIDE_INDEX = [
  null,
  [0, 0, 0, 0],
  [0, 1, 0, 1],
  [0, 1, 2, 1],
  [0, 1, 2, 3],
];

/**
 * @param {string} code the whole code of the editor
 * @param {number} pos the caret
 */
export function borderImageValueAt(code, pos) {
  return valueAt(code, pos, PROPERTIES);
}

/**
 * @typedef {object} Node a token of the value, see `parseClipPath`
 * @property {string} type `number`, `ident`, `function`, `slash`…
 * @property {number} from
 * @property {number} to
 */

/**
 * @typedef {object} Group the values of a slice, width or outset
 * @property {Node[]} values 0 to 4, numbers, math functions or `auto`
 * @property {Node | null} slash the slash before it, none for the slice
 * @property {number} end where the group ends, to add values at
 */

/**
 * @typedef {object} Parsed
 * @property {string} text
 * @property {Node | null} source
 * @property {Group | null} slice
 * @property {Node | null} fill
 * @property {Group | null} width
 * @property {Group | null} outset
 * @property {Node[]} repeat
 * @property {boolean} opaque a `var()` stands for part of it: which part is
 *   unknown, so nothing is rewritten
 */

/**
 * @param {string} text the value
 * @returns {Parsed}
 */
export function parseBorderImage(text) {
  const { nodes } = parseClipPath(text);
  /** @type {Parsed} */
  const parsed = {
    text,
    source: null,
    slice: null,
    fill: null,
    width: null,
    outset: null,
    repeat: [],
    opaque: false,
  };
  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i];
    if (isFunction(node, "var")) {
      parsed.opaque = true;
      i++;
    } else if (null === parsed.slice && (isAmount(node) || isFill(node))) {
      i = sliceGroup(nodes, i, parsed);
    } else if (isIdent(node) && REPEATS.includes(node.name)) {
      parsed.repeat.push(node);
      i++;
    } else {
      if (
        null === parsed.source &&
        (isIdent(node, "none") || ("function" === node.type && !isMath(node)))
      ) {
        parsed.source = node;
      }
      i++;
    }
  }
  return parsed;
}

/**
 * Reads `fill? <slice>{1,4} fill? [ / <width>{0,4} [ / <outset>{1,4} ]? ]?`
 * from `i`, and tells where it ends.
 */
function sliceGroup(nodes, i, parsed) {
  const values = [];
  while (i < nodes.length && (isAmount(nodes[i]) || isFill(nodes[i]))) {
    if (isFill(nodes[i])) {
      parsed.fill ??= nodes[i];
    } else {
      values.push(nodes[i]);
    }
    i++;
  }
  parsed.slice = group(values, null, nodes[i - 1].to);
  if ("slash" !== nodes[i]?.type) {
    return i;
  }
  [parsed.width, i] = afterSlash(nodes, i, true);
  if ("slash" !== nodes[i]?.type) {
    return i;
  }
  [parsed.outset, i] = afterSlash(nodes, i, false);
  return i;
}

/** The values after the slash at `i`, `auto` among the widths. */
function afterSlash(nodes, i, widths) {
  const slash = nodes[i];
  const values = [];
  i++;
  while (
    i < nodes.length &&
    values.length < 4 &&
    (isAmount(nodes[i]) || (widths && isIdent(nodes[i], "auto")))
  ) {
    values.push(nodes[i]);
    i++;
  }
  return [group(values, slash, (values.at(-1) ?? slash).to), i];
}

function group(values, slash, end) {
  return { values, slash, end };
}

function isAmount(node) {
  return "number" === node.type || isMath(node);
}

function isMath(node) {
  return "function" === node.type && MATH.includes(node.name);
}

function isFill(node) {
  return isIdent(node, "fill");
}

function isIdent(node, name) {
  return "ident" === node.type && (undefined === name || node.name === name);
}

function isFunction(node, name) {
  return "function" === node.type && node.name === name;
}

/**
 * The value written for a side of a group, `null` when it is left out.
 *
 * @param {Group | null} group
 * @param {number} side 0 to 3, top right bottom left
 * @returns {Node | null}
 */
export function sideNode(group, side) {
  const count = group?.values.length ?? 0;
  return 0 === count ? null : group.values[SIDE_INDEX[count][side]];
}

/**
 * @typedef {{ from: number, to: number, insert: string }} Change in the value
 */

/**
 * Rewrites a side of a group, adding the group when it is left out.
 *
 * The value the side reads is rewritten, along with the sides that share it:
 * `split`, every side is written apart, and shortened back.
 *
 * @param {Parsed} parsed
 * @param {"slice" | "width" | "outset"} name
 * @param {number} side 0 to 3, top right bottom left
 * @param {string} insert the side's new value
 * @param {{ split?: boolean }} [options]
 * @returns {Change[]}
 */
export function writeSide(parsed, name, side, insert, { split = false } = {}) {
  const { text } = parsed;
  const current = parsed[name];
  const count = current?.values.length ?? 0;
  if (count > 0 && !split) {
    const node = sideNode(current, side);
    return [splice(text, node.from, node.to, insert)];
  }
  const sides = [0, 1, 2, 3].map((i) => {
    if (i === side) {
      return insert;
    }
    const node = sideNode(current, i);
    return node ? text.slice(node.from, node.to) : DEFAULTS[name];
  });
  const values = split ? shortSides(sides) : insert;
  if (count > 0) {
    const { values: nodes } = current;
    return [splice(text, nodes[0].from, nodes.at(-1).to, values)];
  }
  return addGroup(parsed, name, values);
}

/** Writes the values of a group left out, with the groups before it. */
function addGroup(parsed, name, values) {
  const { text, slice, width } = parsed;
  if ("slice" === name) {
    return [append(text, values)];
  }
  if (null === slice) {
    const groups = "width" === name ? `/${values}` : `//${values}`;
    return [append(text, `${DEFAULTS.slice}${groups}`)];
  }
  if ("width" === name) {
    if (width) {
      // `1//2px`: the slash is there, its values are not.
      return [splice(text, width.end, width.end, values)];
    }
    return [splice(text, slice.end, slice.end, `/${values}`)];
  }
  if (parsed.outset) {
    // `1//`: the slash is there, its values are not.
    return [splice(text, parsed.outset.end, parsed.outset.end, values)];
  }
  const end = Math.max(slice.end, parsed.fill?.to ?? 0, width?.end ?? 0);
  return [splice(text, end, end, `${width ? "" : "/"}/${values}`)];
}

/**
 * Adds `fill`, or takes it off.
 *
 * @param {Parsed} parsed
 * @returns {Change[]}
 */
export function toggleFill(parsed) {
  const { text, fill, slice } = parsed;
  if (fill) {
    return [remove(text, fill.from, fill.to)];
  }
  if (null === slice) {
    return [append(text, `${DEFAULTS.slice}fill`)];
  }
  return [splice(text, slice.end, slice.end, "fill")];
}

/**
 * Sets the repeat along an axis, written the shortest way: none for
 * `stretch`, a single keyword for both axes.
 *
 * @param {Parsed} parsed
 * @param {0 | 1} axis 0 for the top and bottom edges, 1 for the sides
 * @param {string} keyword
 * @returns {Change[]}
 */
export function writeRepeat(parsed, axis, keyword) {
  const { text, repeat } = parsed;
  const pair = repeatOf(parsed);
  pair[axis] = keyword;
  const [x, y] = pair;
  const insert = x === y ? ("stretch" === x ? "" : x) : `${x} ${y}`;
  if (0 === repeat.length) {
    return "" === insert ? [] : [append(text, insert)];
  }
  const from = repeat[0].from;
  const to = repeat.at(-1).to;
  return [
    "" === insert ? remove(text, from, to) : splice(text, from, to, insert),
  ];
}

/**
 * The repeat of each axis, as written.
 *
 * @param {Parsed} parsed
 * @returns {[string, string]}
 */
export function repeatOf({ repeat }) {
  const [x = "stretch", y = x] = repeat.map(({ name }) => name);
  return [x, y];
}

/** Adds some text at the end of the value, before its trailing spaces. */
function append(text, insert) {
  const end = text.trimEnd().length;
  return splice(text, end, end, insert);
}

/**
 * Replaces some text, with a space where it would stick to its neighbors:
 * `10px` glued to a number before it, or `fill` after `1`.
 *
 * @returns {Change}
 */
export function splice(text, from, to, insert) {
  const before = text.charAt(from - 1);
  const after = text.charAt(to);
  if (/[\w.]/.test(before) && /^[\w.+-]/.test(insert)) {
    insert = ` ${insert}`;
  }
  if (/[\w.]$/.test(insert) && /[\w.+-]/.test(after)) {
    insert = `${insert} `;
  }
  return { from, to, insert };
}

/**
 * Takes some text out, with a space next to it, and leaves one where its
 * neighbors would stick together.
 *
 * @returns {Change}
 */
function remove(text, from, to) {
  if (/\s/.test(text.charAt(from - 1))) {
    from = text.slice(0, from).trimEnd().length;
  } else {
    const rest = text.slice(to);
    to += rest.length - rest.trimStart().length;
  }
  const glued =
    /[\w.]/.test(text.charAt(from - 1)) && /[\w.+-]/.test(text.charAt(to));
  return { from, to, insert: glued ? " " : "" };
}
