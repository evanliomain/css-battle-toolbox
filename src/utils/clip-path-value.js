/**
 * Finds the clip-path or border-shape value the caret stands in, in some
 * cssbattle code, so the clip-path tool knows what to draw and what to
 * rewrite, and splits it in the shapes it draws, each in its reference box.
 */

import { declarationAt } from "./css-declaration";

const PROPERTIES = ["clip-path", "-webkit-clip-path", "border-shape"];

/** The basic shapes, those the tool cannot edit, like path(), included. */
const BASIC_SHAPES = [
  "polygon",
  "circle",
  "ellipse",
  "inset",
  "rect",
  "xywh",
  "shape",
  "path",
];

/** The reference boxes a value can name. */
export const GEOMETRY_BOXES = [
  "border-box",
  "padding-box",
  "content-box",
  "margin-box",
  "half-border-box",
  "fill-box",
  "stroke-box",
  "view-box",
];

/** The word the caret may stand in, glued values like `50%0` included. */
const WORD = /[^\s,()/:;{}"'<>!]*$/;

/**
 * @param {string} code the whole code of the editor
 * @param {number} pos the caret
 * @returns {{ property: string, from: number, to: number, text: string } | null}
 *   the property, and its value from just after its colon to its end, or
 *   `null` when the caret is elsewhere
 */
export function shapeValueAt(code, pos) {
  const before = code.slice(0, pos);
  const declaration = declarationAt(before.replace(WORD, ""));
  if (null === declaration || !PROPERTIES.includes(declaration.property)) {
    return null;
  }
  const from = before.lastIndexOf(":") + 1;
  const to = valueEnd(code, pos);
  return {
    property: declaration.property,
    from,
    to,
    text: code.slice(from, to),
  };
}

/**
 * Where the value ends: its semicolon, the end of its rule or of its `style`
 * attribute, or `!important`. Parentheses are skipped, so an unclosed
 * function stops at the first of those that follows.
 */
function valueEnd(code, pos) {
  let depth = 0;
  for (let i = pos; i < code.length; i++) {
    const char = code[i];
    if ("(" === char) {
      depth++;
    } else if (")" === char && depth > 0) {
      depth--;
    } else if (";}\"'<>".includes(char) || ("!" === char && 0 === depth)) {
      return i;
    }
  }
  return code.length;
}

/**
 * @typedef {object} Part a shape to draw, in its reference box
 * @property {object | null} shape the shape's function node, `null` for a
 *   value without one: the box alone is drawn
 * @property {string | null} box the geometry box, `null` for the border box
 */

/**
 * The shapes of a value, and the reference box of each.
 *
 * A clip-path has one shape, and its box written before or after it. A
 * border-shape has one or two, each followed by its own box: one shape is
 * stroked along its path, on the box halfway through the border by default;
 * two fill the space between them, the outer one on the border box and the
 * inner one on the padding box by default.
 *
 * @param {{ nodes: object[] }} parsed the value's nodes
 * @param {string} property
 * @returns {Part[]} at least one
 */
export function shapeParts({ nodes }, property) {
  const isBox = (node) =>
    "ident" === node.type && GEOMETRY_BOXES.includes(node.name);
  const isShape = (node) =>
    "function" === node.type && BASIC_SHAPES.includes(node.name);

  if ("border-shape" !== property) {
    return [
      {
        shape: nodes.find(isShape) ?? null,
        box: nodes.find(isBox)?.name ?? null,
      },
    ];
  }

  const parts = [];
  for (const node of nodes) {
    if (isShape(node)) {
      parts.push({ shape: node, box: null });
    } else if (isBox(node) && null === parts.at(-1)?.box) {
      parts.at(-1).box = node.name;
    }
  }
  if (0 === parts.length) {
    // The first shape picked will be stroked.
    return [{ shape: null, box: nodes.find(isBox)?.name ?? "half-border-box" }];
  }
  if (1 === parts.length) {
    parts[0].box ??= "half-border-box";
    return parts;
  }
  const [outer, inner] = parts;
  outer.box ??= "border-box";
  inner.box ??= "padding-box";
  return [outer, inner];
}
