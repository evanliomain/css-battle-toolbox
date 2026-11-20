/**
 * Tells what happens to each of the nine pieces of a border-image, in words
 * and in tiles, for the border-image tool to explain them: how it is scaled,
 * stretched or tiled, and why it is missing.
 */

/** Below this size, the tiles of an edge are too thin to tell apart. */
export const MIN_TILE = 4;

const SIDE_NAMES = ["top", "right", "bottom", "left"];

/** The sides of each piece, row by row: those whose slice and width it uses. */
const PIECE_SIDES = [[0, 3], [0], [0, 1], [3], [], [1], [2, 3], [2], [2, 1]];

const n = (value, digits = 2) => Number(value.toFixed(digits)) + 0;

/** A size, like `120×93`, 0 where slices overlap. */
export function size({ width, height }) {
  return `${n(Math.max(0, width), 1)}×${n(Math.max(0, height), 1)}`;
}

/** The name of each piece, row by row. */
const PIECE_NAMES = [
  "Top-left corner",
  "Top edge",
  "Top-right corner",
  "Left edge",
  "Middle",
  "Right edge",
  "Bottom-left corner",
  "Bottom edge",
  "Bottom-right corner",
];

/** A share as a percentage, like `75%`. */
const percent = (share) => `${n(share * 100, 0)}%`;

/**
 * @typedef {object} Story what happens to a piece
 * @property {number} zone 0 to 8
 * @property {string} name what it is, like `Top-left corner`
 * @property {string} behavior how it is laid out, or `""` when not drawn
 * @property {string} sizes from its size in the image to its size around the
 *   element
 * @property {string} warning why it is missing, or what to beware of
 * @property {number} count its tiles, 1 for a corner or a stretched edge
 */

/**
 * @param {object} piece see `layoutBorderImage`
 * @param {object} layout see `layoutBorderImage`
 * @param {string[]} repeat along x, then y
 * @param {boolean} fill
 * @returns {Story}
 */
export function describePiece(piece, layout, repeat, fill) {
  const { zone, kind, source, target, drawn, tiles } = piece;
  const story = {
    zone,
    name: PIECE_NAMES[zone],
    behavior: "",
    sizes: `${size(source)} → ${size(target)}`,
    warning: "",
    count: drawn ? 1 : 0,
  };
  if (!drawn) {
    return { ...story, warning: missing(piece, layout, fill) };
  }
  if ("corner" === kind) {
    return { ...story, behavior: resized(source, target) };
  }
  if ("middle" === kind) {
    return { ...story, behavior: "Filled: stretched to the room left" };
  }
  const mode = repeat["x" === piece.axis ? 0 : 1];
  const along = (r) => ("x" === piece.axis ? r.width : r.height);
  const across = (r) => ("x" === piece.axis ? r.height : r.width);
  if ("stretch" === mode) {
    return { ...story, behavior: stretched(along(target) / along(source)) };
  }
  if (null === tiles) {
    return { ...story, warning: "Not shown: too many tiles to draw", count: 0 };
  }
  const count = tiles.length;
  const tile = tiles[0]?.size ?? 0;
  if (0 === count) {
    return { ...story, warning: "Not shown: no room for a single tile", count };
  }
  // A tile as long as the image gives it, once as thick as the border.
  const natural = (along(source) * across(target)) / across(source);
  const tiled = `${count} tile${1 === count ? "" : "s"}`;
  const behavior = {
    repeat: `${n(along(target) / tile, 1)} tiles, cut at both ends`,
    round: `${tiled}, ${tile < natural ? "squeezed" : tile > natural ? "stretched" : "kept"} along`,
    space: `${tiled}, spaced out`,
  }[mode];
  return {
    ...story,
    behavior,
    count,
    warning: tile < MIN_TILE ? `Tiles only ${n(tile)}px long` : "",
  };
}

/** How a corner is resized. */
function resized(source, target) {
  const x = n(target.width / source.width);
  const y = n(target.height / source.height);
  if (1 === x && 1 === y) {
    return "Kept as is";
  }
  const verb =
    x <= 1 && y <= 1 ? "Shrunk" : x >= 1 && y >= 1 ? "Grown" : "Resized";
  return x === y
    ? `${verb} to ${percent(x)}`
    : `${verb}: ${percent(x)} wide, ${percent(y)} tall`;
}

/** How an edge is stretched along its side. */
function stretched(share) {
  const ratio = n(share);
  if (1 === ratio) {
    return "Kept as is";
  }
  return `${ratio < 1 ? "Squeezed" : "Stretched"} along, to ${percent(ratio)}`;
}

/** Why a piece is not drawn. */
function missing({ zone, kind, source }, { slices, widths }, fill) {
  if ("middle" === kind && !fill) {
    return "Hidden: needs fill";
  }
  const sides = PIECE_SIDES[zone];
  const noSlice = sides.find((side) => !(slices[side] > 0));
  if (undefined !== noSlice) {
    return `Not shown: the ${SIDE_NAMES[noSlice]} slice is 0`;
  }
  const noWidth = sides.find((side) => !(widths[side] > 0));
  if (undefined !== noWidth) {
    return `Not shown: the ${SIDE_NAMES[noWidth]} width is 0`;
  }
  if (!(source.width > 0 && source.height > 0)) {
    return "Not shown: the slices overlap, nothing is left";
  }
  return "Not shown: no room left on the element";
}

/**
 * @typedef {object} Notice something that changes the result
 * @property {string} title
 * @property {string} text why
 */

/**
 * The global things to beware of, read in the layout.
 *
 * @param {object} layout see `layoutBorderImage`
 * @param {{ opaque: boolean }} parsed
 * @returns {Notice[]}
 */
export function notices({ warnings, factor }, { opaque }) {
  return [
    warnings.unbordered && {
      title: "No border to count",
      text: "A width without unit is a multiple of border-width, which is 0 here.",
    },
    warnings.shrunk && {
      title: "Widths shrunk to fit the element",
      text: `Opposite widths are larger than the element together: each one is scaled by ${n(factor)}.`,
    },
    warnings.floored && {
      title: "Widths rounded down to the pixel",
      text: "Chrome draws the border on whole pixels.",
    },
    opaque && {
      title: "Read only: var() in the value",
      text: "The panel cannot rewrite a value it cannot read.",
    },
  ].filter(Boolean);
}
