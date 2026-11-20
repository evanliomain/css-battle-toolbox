/**
 * Lays out a border-image the way Chromium paints it, for the border-image
 * tool to draw its nine pieces: where each is cut in the image, where it lands
 * around the element, and how its tiles go.
 *
 * Follows `nine_piece_image_grid.cc` and `nine_piece_image_painter.cc`:
 * - a gradient has no size of its own, it takes that of the border image
 *   area, the border box grown by the outsets;
 * - a slice is clamped to the image, and the slices may overlap: the corners
 *   still paint, the edges and the middle between them do not;
 * - the widths shrink by the same factor when two opposite ones overlap, then
 *   fall to the whole pixel, but where they meet;
 * - `auto` takes the slice's size, where the spec says the border width.
 *
 * Every length is in pixels of the render, the element's zoom included.
 */

/**
 * @typedef {{ value: number, unit: string, auto?: boolean }} Side a computed
 *   value: `unit` is `""` for a number, `%` or `px`
 */

/**
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect
 */

/**
 * @typedef {object} Piece one of the nine, row by row from the top left
 * @property {number} zone 0 to 8, 4 for the middle
 * @property {"corner" | "edge" | "middle"} kind
 * @property {Rect} source where it is cut in the image
 * @property {Rect} target where it lands, from the border box's top left
 * @property {boolean} drawn whether Chromium paints it
 * @property {"x" | "y" | null} axis along which an edge's tiles go
 * @property {{ start: number, size: number }[] | null} tiles from the start of
 *   the target along the axis, `null` when too many to draw
 */

/** Past this many tiles on an edge, their bounds are left out. */
export const MAX_TILES = 200;

const ZERO = { value: 0, unit: "" };

/**
 * Reads a computed border-image-slice, -width or -outset.
 *
 * @param {string} text like `10 20% fill`, `auto 8.5px` or `1`
 * @returns {{ sides: Side[], fill: boolean }} its 4 sides, top right bottom
 *   left, and whether it has `fill`
 */
export function parseSides(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const values = words
    .filter((word) => "fill" !== word)
    .map((word) => {
      if ("auto" === word) {
        return { value: 0, unit: "auto", auto: true };
      }
      const match = /^([+-]?[\d.]+(?:e[+-]?\d+)?)(px|%)?$/i.exec(word);
      return match
        ? { value: parseFloat(match[1]), unit: (match[2] ?? "").toLowerCase() }
        : ZERO;
    });
  const [top = ZERO, right = top, bottom = top, left = right] = values;
  return { sides: [top, right, bottom, left], fill: words.includes("fill") };
}

/**
 * @param {object} input
 * @param {{ width: number, height: number }} input.box the border box
 * @param {number[]} input.borders the border widths, top right bottom left
 * @param {number} [input.zoom] the element's own zoom, by which its pixels
 *   and the numbers of its slices grow
 * @param {Side[]} input.slice
 * @param {boolean} input.fill
 * @param {Side[]} input.width
 * @param {Side[]} input.outset
 * @param {string[]} input.repeat along x, then along y
 */
export function layoutBorderImage({
  box,
  borders,
  zoom = 1,
  slice,
  fill,
  width,
  outset,
  repeat,
}) {
  // An outset in numbers is in border widths, as a width.
  const outsets = outset.map((side, i) =>
    Math.max(0, side.value * ("" === side.unit ? borders[i] : zoom)),
  );
  const area = {
    // `0 -` rather than `-`, for no -0.
    x: 0 - outsets[3],
    y: 0 - outsets[0],
    width: box.width + outsets[1] + outsets[3],
    height: box.height + outsets[0] + outsets[2],
  };
  // A gradient is as large as the area.
  const image = { width: area.width, height: area.height };
  // The top and bottom sides along the height, the others along the width.
  const across = (rect, i) => (i % 2 ? rect.width : rect.height);

  const slices = slice.map((side, i) => {
    const extent = across(image, i);
    const px =
      "%" === side.unit ? (side.value / 100) * extent : side.value * zoom;
    return Math.round(Math.max(0, Math.min(px, extent)) * 64) / 64;
  });

  const raw = width.map((side, i) => {
    if (side.auto) {
      return slices[i];
    }
    if ("%" === side.unit) {
      return (side.value / 100) * across(area, i);
    }
    return Math.max(0, side.value * ("" === side.unit ? borders[i] : zoom));
  });
  const factor = Math.min(
    1,
    fit(area.width, raw[1] + raw[3]),
    fit(area.height, raw[0] + raw[2]),
  );
  const scaled = raw.map((px) => px * factor);
  const [top, bottom] = snapPair(scaled[0], scaled[2], area.height);
  const [left, right] = snapPair(scaled[3], scaled[1], area.width);
  const widths = [top, right, bottom, left];

  const sx = [0, slices[3], image.width - slices[1], image.width];
  const sy = [0, slices[0], image.height - slices[2], image.height];
  const dx = [0, left, area.width - right, area.width].map((x) => x + area.x);
  const dy = [0, top, area.height - bottom, area.height].map((y) => y + area.y);
  const drawable = (side) => slices[side] > 0 && widths[side] > 0;

  /** @type {Piece[]} */
  const pieces = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const source = rect(sx, sy, col, row);
      const target = rect(dx, dy, col, row);
      const zone = row * 3 + col;
      const piece = { zone, source, target, axis: null, tiles: null };
      if (4 === zone) {
        const filled = [
          source.width,
          source.height,
          target.width,
          target.height,
        ].every((extent) => extent > 0);
        pieces.push({ ...piece, kind: "middle", drawn: fill && filled });
      } else if (1 === row || 1 === col) {
        pieces.push(edge(piece, slices, widths, repeat, drawable));
      } else {
        // Its two sides: the top or bottom, the left or right.
        const sides = [0 === row ? 0 : 2, 0 === col ? 3 : 1];
        pieces.push({
          ...piece,
          kind: "corner",
          drawn: sides.every(drawable),
        });
      }
    }
  }

  return {
    area,
    image,
    outsets,
    slices,
    widths,
    factor,
    pieces,
    warnings: {
      shrunk: factor < 1,
      floored: scaled.some((px, i) => px - widths[i] > 1 / 64),
      overlap: {
        x: slices[1] + slices[3] >= image.width,
        y: slices[0] + slices[2] >= image.height,
      },
      // Numbers of border widths, without a border.
      unbordered: width.some(
        (side, i) => "" === side.unit && side.value > 0 && 0 === borders[i],
      ),
      noTile: pieces.some(
        ({ drawn, tiles }) => drawn && null !== tiles && 0 === tiles.length,
      ),
    },
  };
}

/** How much a pair of widths shrinks to fit in `extent`. */
function fit(extent, sum) {
  return sum > 0 ? extent / sum : Infinity;
}

/**
 * Two opposite widths on whole pixels: down, but where they meet, so as not
 * to leave a gap between them.
 */
function snapPair(start, end, extent) {
  if (extent - (start + end) <= 1 / 64) {
    const first = Math.round(start);
    return [first, Math.max(0, extent - first)];
  }
  return [Math.floor(start), Math.floor(end)];
}

function rect(xs, ys, col, row) {
  return {
    x: xs[col],
    y: ys[row],
    width: xs[col + 1] - xs[col],
    height: ys[row + 1] - ys[row],
  };
}

/**
 * An edge, scaled to its width across, then stretched, repeated, rounded or
 * spaced along.
 */
function edge(piece, slices, widths, repeat, drawable) {
  const { zone, source, target } = piece;
  // 1 top, 3 left, 5 right, 7 bottom.
  const side = { 1: 0, 3: 3, 5: 1, 7: 2 }[zone];
  const axis = 0 === side % 2 ? "x" : "y";
  const along = (r) => ("x" === axis ? r.width : r.height);
  const drawn = drawable(side) && along(source) > 0 && along(target) > 0;
  const scale = widths[side] / slices[side];
  const tiles = drawn
    ? tile(repeat["x" === axis ? 0 : 1], along(target), along(source) * scale)
    : [];
  return { ...piece, kind: "edge", drawn, axis, tiles };
}

/**
 * The tiles along an edge `length` long, each `size` long once scaled.
 *
 * @returns {{ start: number, size: number }[] | null}
 */
export function tile(mode, length, size) {
  if ("stretch" === mode || !(size > 0)) {
    return [{ start: 0, size: length }];
  }
  let starts;
  if ("round" === mode) {
    const count = Math.max(1, Math.round(length / size));
    if (count > MAX_TILES) {
      return null;
    }
    size = length / count;
    starts = Array.from({ length: count }, (_, i) => i * size);
  } else if ("space" === mode) {
    const count = Math.floor(length / size);
    if (count > MAX_TILES) {
      return null;
    }
    const gap = (length - count * size) / (count + 1);
    starts = Array.from({ length: count }, (_, i) => gap + i * (size + gap));
  } else {
    // repeat: centered, cut at both ends.
    if (length / size > MAX_TILES) {
      return null;
    }
    const phase = (length - size) / 2;
    starts = [];
    for (
      let at = phase - Math.ceil(phase / size) * size;
      at < length;
      at += size
    ) {
      starts.push(at);
    }
  }
  return starts.map((start) => ({ start, size }));
}
