/**
 * The lines the border-image tool drags: the slices across the image, the
 * widths and the outsets around the element. Tells which line the pointer
 * takes, and writes the value it moves to in the unit already written.
 */

import { format, unitFactor } from "./clip-path-geometry";

/**
 * @typedef {object} Line a side of a slice, width or outset
 * @property {string} id like `width-0`
 * @property {"slice" | "width" | "outset"} group
 * @property {number} side 0 to 3, top right bottom left
 * @property {"x" | "y"} axis along which it moves: `y` for the top and bottom
 * @property {number} origin where it stands for 0
 * @property {1 | -1} grow the way it goes as its value grows
 * @property {number} at where it stands, `origin + grow × value`
 * @property {[number, number]} span from where to where it is drawn, along
 *   the other axis
 */

/** Whether each side's lines go along `y`, and the way they grow outwards. */
const SIDES = [
  { axis: "y", out: -1 },
  { axis: "x", out: 1 },
  { axis: "y", out: 1 },
  { axis: "x", out: -1 },
];

function line(group, side, origin, grow, value, span) {
  const { axis } = SIDES[side];
  return {
    id: `${group}-${side}`,
    group,
    side,
    axis,
    origin,
    grow,
    at: origin + grow * value,
    span,
  };
}

/** The 4 edges of a rect, top right bottom left. */
function edges({ x, y, width, height }) {
  return [y, x + width, y + height, x];
}

/**
 * The widths and the outsets, in pixels of the border box: the outsets on the
 * border image area, the widths within it.
 *
 * @param {object} layout see `layoutBorderImage`
 * @returns {Line[]} the outsets first: the widths go over them
 */
export function outputLines({ area, outsets, widths }) {
  const box = {
    x: 0,
    y: 0,
    width: area.width - outsets[1] - outsets[3],
    height: area.height - outsets[0] - outsets[2],
  };
  const spans = {
    x: [area.y, area.y + area.height],
    y: [area.x, area.x + area.width],
  };
  const boxEdges = edges(box);
  const areaEdges = edges(area);
  return [
    ...SIDES.map(({ axis, out }, side) =>
      line("outset", side, boxEdges[side], out, outsets[side], spans[axis]),
    ),
    ...SIDES.map(({ axis, out }, side) =>
      line("width", side, areaEdges[side], -out, widths[side], spans[axis]),
    ),
  ];
}

/**
 * The slices, in pixels of the image.
 *
 * @param {object} layout see `layoutBorderImage`
 * @returns {Line[]}
 */
export function sourceLines({ image, slices }) {
  const all = { x: 0, y: 0, ...image };
  const spans = { x: [0, image.height], y: [0, image.width] };
  return SIDES.map(({ axis, out }, side) =>
    line("slice", side, edges(all)[side], -out, slices[side], spans[axis]),
  );
}

/**
 * The lines within `tolerance` of a point, the nearest first.
 *
 * @param {Line[]} lines
 * @param {{ x: number, y: number }} point
 * @param {number} tolerance
 */
export function linesAt(lines, point, tolerance) {
  const other = { x: "y", y: "x" };
  return lines
    .map((l) => ({ line: l, distance: Math.abs(point[l.axis] - l.at) }))
    .filter(({ line: l, distance }) => {
      const along = point[other[l.axis]];
      return (
        distance <= tolerance &&
        along >= l.span[0] - tolerance &&
        along <= l.span[1] + tolerance
      );
    })
    .sort((a, b) => a.distance - b.distance)
    .map(({ line: l }) => l);
}

/**
 * Of lines under the pointer, the one a move takes: along the axis it goes
 * the most, the one it makes grow, so that a width lying on an outset goes
 * in, and the outset out.
 *
 * @param {Line[]} lines at least one
 * @param {{ x: number, y: number }} move
 * @returns {Line}
 */
export function chooseLine(lines, move) {
  const axis = Math.abs(move.x) >= Math.abs(move.y) ? "x" : "y";
  const along = lines.filter((l) => l.axis === axis);
  const pool = along.length > 0 ? along : lines;
  return pool.reduce((best, l) =>
    l.grow * move[l.axis] > best.grow * move[best.axis] ? l : best,
  );
}

/** The value a line stands for, the pointer on it, never below 0. */
export function valueAt(l, point) {
  return Math.max(0, l.grow * (point[l.axis] - l.origin));
}

/**
 * @typedef {object} Context what the values resolve against
 * @property {number} zoom the element's own
 * @property {number[]} borders the border widths, in pixels of the render
 * @property {{ width: number, height: number }} image
 * @property {{ width: number, height: number }} area
 * @property {object} box the border box, and what its units resolve against,
 *   as `unitFactor` takes it
 */

/**
 * The text of a value moved to `px`, in the unit of the value it replaces. A
 * value left out, or `auto`, becomes a number for a slice, pixels otherwise;
 * a number of border widths without a border becomes pixels.
 *
 * @param {"slice" | "width" | "outset"} group
 * @param {number} side
 * @param {object | null} node the value written, see `parseBorderImage`
 * @param {number} px in pixels of the render
 * @param {Context} ctx
 * @param {{ precision?: number }} [options] 1 for a decimal more
 * @returns {string | null} `null` for a value the tool cannot write: a
 *   `calc()`, an unknown unit
 */
export function valueText(group, side, node, px, ctx, { precision = 0 } = {}) {
  if (null !== node && !editable(group, node, ctx)) {
    return null;
  }
  px = Math.max(0, px);
  const basis = side % 2 ? "x" : "y";
  // A percentage of the image or of the area.
  const of = ({ width, height }) => ({ ...ctx.box, width, height });
  const unit = "number" === node?.type ? node.unit : null;
  if ("slice" === group) {
    if ("%" === unit) {
      return format(px, "%", basis, of(ctx.image), precision);
    }
    // Chromium rounds them anyway.
    return String(Math.round(px / ctx.zoom));
  }
  if ("" === unit && ctx.borders[side] > 0) {
    const times = px / ctx.borders[side];
    return String(Number(times.toFixed(1 + precision)) + 0);
  }
  if ("%" === unit) {
    return format(px, "%", basis, of(ctx.area), precision);
  }
  // A length is in CSS pixels, before the zoom.
  const length = unit || "px";
  return format(px / ctx.zoom, length, basis, ctx.box, precision);
}

/**
 * Whether the tool can rewrite a value: a number in a unit it converts, or
 * `auto`.
 *
 * @param {"slice" | "width" | "outset"} group
 * @param {object | null} node
 * @param {Context} ctx
 */
export function editable(group, node, ctx) {
  if (null === node) {
    return true;
  }
  if ("ident" === node.type) {
    return "width" === group && "auto" === node.name;
  }
  if ("number" !== node.type) {
    return false;
  }
  if ("" === node.unit) {
    return true;
  }
  if ("%" === node.unit) {
    return "outset" !== group;
  }
  return "slice" !== group && null !== unitFactor(node.unit, "x", ctx.box);
}
