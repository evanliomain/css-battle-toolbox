/**
 * The markup of the border-image tool, shared by the overlay of the output
 * and the panel.
 *
 * A piece is never redrawn by hand: a copy of the element, with the same
 * border-image, is clipped to it, so the render's own painter draws it, a
 * slice a fraction of a pixel thin included.
 */

import { outputLines, sourceLines } from "./border-image-handles";
import { POINT_COLORS } from "./point-colors";

/** A color per group of values, on the handles as in the code. */
export const COLORS = {
  slice: POINT_COLORS[0],
  width: POINT_COLORS[1],
  outset: POINT_COLORS[2],
};

const SIDE_NAMES = ["top", "right", "bottom", "left"];

/** Below this size, in pixels of the page, a piece shows no number. */
export const NUMBERED = 14;

/** How long each piece takes to its place, in milliseconds. */
export const PIECE_DURATION = 900;

/** The order the pieces go to their place: the corners, the edges, the middle. */
export const PLAY_ORDER = [0, 2, 6, 8, 1, 7, 3, 5, 4];

const n = (value) => Number(value.toFixed(3)) + 0;

/** Escapes some text written in an attribute between double quotes. */
export function escape(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

/** The class of a piece: drawn or not, hovered, alone. */
export function pieceClass(
  { zone, drawn, kind },
  { hovered = -1, isolated = -1 } = {},
  block = "cbt-border-image__piece",
) {
  return [
    block,
    `${block}--${kind}`,
    drawn ? "" : `${block}--empty`,
    zone === hovered ? `${block}--hovered` : "",
    zone === isolated ? `${block}--isolated` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function rectSvg({ x, y, width, height }, attributes) {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(0, width))}" height="${n(Math.max(0, height))}" ${attributes}/>`;
}

/**
 * The number of a piece, in its middle, where it has room for it.
 *
 * @param {number} [unit] the size of a pixel of the page
 */
export function numberSvg({ zone, drawn }, { x, y, width, height }, unit = 1) {
  if (width < NUMBERED * unit || height < NUMBERED * unit) {
    return "";
  }
  const empty = drawn ? "" : " cbt-border-image__number--empty";
  return `<text class="cbt-border-image__number${empty}" x="${n(x + width / 2)}" y="${n(y + height / 2)}" font-size="${n(11 * unit)}">${zone + 1}</text>`;
}

/**
 * A line that drags: drawn on hover or while dragged, wide and unseen to take
 * the pointer, with a handle: a dot for a slice or a width, a diamond for an
 * outset.
 *
 * @param {object} l see `outputLines` and `sourceLines`
 * @param {object} options
 * @param {boolean} options.locked
 * @param {boolean} options.active dragged
 * @param {(point: object) => object} options.handleAt where a point of the
 *   line lands where the handles are drawn
 * @param {number} [options.unit] the size of a pixel of the page there
 * @returns {{ line: string, handle: string }}
 */
export function edgeSvg(l, { locked, active, handleAt, unit = 1 }) {
  const [from, to] = l.span;
  const ends =
    "y" === l.axis
      ? `x1="${n(from)}" y1="${n(l.at)}" x2="${n(to)}" y2="${n(l.at)}"`
      : `x1="${n(l.at)}" y1="${n(from)}" x2="${n(l.at)}" y2="${n(to)}"`;
  const classes = [
    "cbt-border-image__edge",
    `cbt-border-image__edge--${l.group}`,
    locked ? "cbt-border-image__edge--locked" : "",
    active ? "cbt-border-image__edge--active" : "",
    `cbt-border-image__edge--${"y" === l.axis ? "ns" : "ew"}`,
  ]
    .filter(Boolean)
    .join(" ");
  // The slices' on the edge of the image, as marks on a ruler; the outsets'
  // aside the widths', which they may lie on.
  const along =
    from + (to - from) * { slice: 0, width: 0.5, outset: 0.25 }[l.group];
  const at = handleAt(
    "y" === l.axis ? { x: along, y: l.at } : { x: l.at, y: along },
  );
  const handle =
    "outset" === l.group
      ? `<rect class="cbt-border-image__handle" data-line="${l.id}" x="${n(at.x - 3.5 * unit)}" y="${n(at.y - 3.5 * unit)}" width="${n(7 * unit)}" height="${n(7 * unit)}" transform="rotate(45 ${n(at.x)} ${n(at.y)})"/>`
      : `<circle class="cbt-border-image__handle" data-line="${l.id}" cx="${n(at.x)}" cy="${n(at.y)}" r="${n(4 * unit)}"/>`;
  const title = `<title>${l.group} ${SIDE_NAMES[l.side]}</title>`;
  const style = `style="--cbt-line: ${COLORS[l.group]}"`;
  return {
    line: `<g class="${classes}" data-edge="${l.id}" ${style}><line class="cbt-border-image__line" ${ends}/><line class="cbt-border-image__hit" data-line="${l.id}" ${ends}>${title}</line></g>`,
    handle: `<g class="${classes}" ${style}>${handle}</g>`,
  };
}

/** Pixels of the page per pixel of the render, to fit a box. */
export function fit({ width, height }, box) {
  // A piece of no size takes the largest scale.
  return Math.min(box.width / width, box.height / height, box.scale);
}

/**
 * The image, painted as large as the render paints it, then scaled: a
 * transform, not a zoom, which would paint it again at the smaller size.
 *
 * @param {object} model what the page script sends, see `model`
 * @param {number} scale
 * @param {string} [extra] more CSS
 */
export function imageHtml({ layout, zoom, look }, scale, extra = "") {
  const { width, height } = layout.image;
  const style = `width:${n(width / zoom)}px;height:${n(height / zoom)}px;zoom:${n(zoom)};transform:scale(${n(scale)});${look}`;
  return `<div class="cbt-border-image__image" style="${escape(style)}${extra}"></div>`;
}

/**
 * A part of the copy of the element, as the render paints it, clipped.
 *
 * @param {object} model
 * @param {object} shown the rect shown, from the border box's top left
 * @param {object} clip the rect left of the copy
 * @param {number} scale
 */
export function cloneHtml({ clone, zoom, layout }, shown, clip, scale) {
  const { area, outsets } = layout;
  const box = {
    width: area.width - outsets[1] - outsets[3],
    height: area.height - outsets[0] - outsets[2],
  };
  const inset = [
    clip.y,
    box.width - clip.x - clip.width,
    box.height - clip.y - clip.height,
    clip.x,
  ]
    .map((px) => `${n(px / zoom)}px`)
    .join(" ");
  // As large as the element: smaller, the render would cut and tile the
  // image anew, rounding its pixels otherwise.
  const copy = `${clone};zoom:${n(zoom)};transform:scale(${n(scale)});clip-path:inset(${inset})`;
  return `<div class="cbt-border-image__frame" style="width:${n(shown.width * scale)}px;height:${n(shown.height * scale)}px"><div class="cbt-border-image__at" style="left:${n(-shown.x * scale)}px;top:${n(-shown.y * scale)}px"><div class="cbt-border-image__clone" style="${escape(copy)}"></div></div></div>`;
}

// ——— Playing the pieces to their place ———

/** The pieces the render draws, in the order they go to their place. */
export function playOrder({ layout }) {
  return PLAY_ORDER.filter((zone) => layout.pieces[zone].drawn);
}

/** How long all the pieces take to their place, in milliseconds. */
export function duration(model) {
  return Math.max(1, playOrder(model).length) * PIECE_DURATION;
}

/**
 * The piece on its way at a time of the animation.
 *
 * @param {object} model
 * @param {number} t 0 to 1
 * @returns {{ rank: number, count: number, zone: number }} its rank in the
 *   order, the count of pieces, and the piece, -1 for none
 */
export function stepAt(model, t) {
  const order = playOrder(model);
  const rank = Math.max(
    0,
    Math.min(order.length - 1, Math.floor(t * order.length)),
  );
  return { rank, count: order.length, zone: order[rank] ?? -1 };
}

/** How far a piece went, from 0 before its turn to 1 once in its place. */
function progress(model, zone, t) {
  const order = playOrder(model);
  const rank = order.indexOf(zone);
  return -1 === rank ? 1 : Math.min(1, Math.max(0, t * order.length - rank));
}

/** Past this many tiles, an edge fades into the element rather than show them coming. */
export const MAX_COPIES = 40;

/**
 * Where the tiles of an edge land, from the border box's top left, `null`
 * for a piece not tiled.
 */
function tileRects({ target, axis, tiles }) {
  if (null === axis || null === tiles) {
    return null;
  }
  return tiles.map(({ start, size }) =>
    "x" === axis
      ? { ...target, x: target.x + start, width: size }
      : { ...target, y: target.y + start, height: size },
  );
}

/**
 * Where a piece first lands: its place, or a whole tile of it for an edge
 * repeated, rounded or spaced, the middle one for `repeat`.
 *
 * @param {object} piece see `layoutBorderImage`
 * @returns {{ rect: object, index: number, rects: object[] }} the rect, the
 *   rank of its tile among those of the edge, -1 for none
 */
export function landing(piece) {
  const rects = tileRects(piece) ?? [];
  if (0 === rects.length) {
    return { rect: piece.target, index: -1, rects };
  }
  const x = "x" === piece.axis;
  const end = x ? "width" : "height";
  const from = x ? "x" : "y";
  const length = piece.target[end];
  const whole = rects
    .map((rect, index) => ({ rect, index }))
    .filter(
      ({ rect }) =>
        rect[from] >= piece.target[from] &&
        rect[from] + rect[end] <= piece.target[from] + length + 1e-6,
    );
  const pool =
    whole.length > 0 ? whole : rects.map((rect, index) => ({ rect, index }));
  const { rect, index } = pool[Math.floor(pool.length / 2)];
  return { rect, index, rects };
}

/** A share of the way between two values, or two rects. */
function lerp(a, b, share) {
  if ("number" === typeof a) {
    return a + (b - a) * share;
  }
  return {
    x: lerp(a.x, b.x, share),
    y: lerp(a.y, b.y, share),
    width: lerp(a.width, b.width, share),
    height: lerp(a.height, b.height, share),
  };
}

/** A value from 0 to 1, eased in and out. */
function ease(value) {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * A piece cut in the image, its source rect drawn at `at`, in pixels of the
 * render from `origin`.
 */
function cutHtml(model, source, at, scale, opacity, origin = { x: 0, y: 0 }) {
  const { image } = model.layout;
  const sx = at.width / source.width;
  const sy = at.height / source.height;
  const inset = [
    source.y,
    image.width - source.x - source.width,
    image.height - source.y - source.height,
    source.x,
  ]
    .map((px) => `${n(px / model.zoom)}px`)
    .join(" ");
  const x = (at.x - origin.x - source.x * sx) * scale;
  const y = (at.y - origin.y - source.y * sy) * scale;
  return `<div class="cbt-border-image__mover" style="transform:translate(${n(x)}px,${n(y)}px) scale(${n(sx)},${n(sy)});opacity:${n(opacity)}">${imageHtml(model, scale, `;clip-path:inset(${inset})`)}</div>`;
}

/**
 * The image around a rect of it, scaled up as much as it takes: a slice a
 * fraction of a pixel thin shows what it holds.
 *
 * @param {object} model
 * @param {object} rect in the image
 * @param {number} scale
 */
export function cropHtml(model, rect, scale) {
  return `<div class="cbt-border-image__frame" style="width:${n(rect.width * scale)}px;height:${n(rect.height * scale)}px"><div class="cbt-border-image__at" style="left:${n(-rect.x * scale)}px;top:${n(-rect.y * scale)}px">${imageHtml(model, scale)}</div></div>`;
}

/**
 * The pieces on their way, from the image to their place around the element,
 * one after the other: the corners first, then the edges, then the middle.
 *
 * Each piece is cut in the image, which darkens there, then moves to where it
 * lands. A tiled edge lands as a single tile, then copies of it slide to the
 * other tiles, one after the other, from the nearest. Then each fades into the
 * element as the render paints it.
 *
 * @param {object} model
 * @param {number} t 0 to 1
 * @param {number} scale
 * @param {number} left where the area stands, right of the image, in pixels
 *   of the render
 */
export function playHtml(model, t, scale, left) {
  const { pieces, area } = model.layout;
  const shift = (rect) => ({
    ...rect,
    x: left + rect.x - area.x,
    y: rect.y - area.y,
  });
  return playOrder(model)
    .map((zone) => {
      const local = progress(model, zone, t);
      if (0 === local) {
        return "";
      }
      const piece = pieces[zone];
      const { source, target } = piece;
      const taken = `<div class="cbt-border-image__taken" style="left:${n(source.x * scale)}px;top:${n(source.y * scale)}px;width:${n(source.width * scale)}px;height:${n(source.height * scale)}px"></div>`;
      const { rect: land, index, rects } = landing(piece);
      const tiled =
        index > -1 && rects.length > 1 && rects.length <= MAX_COPIES;
      // The way to move, then for the copies to slide, then to fade.
      const [moveEnd, fadeStart] = tiled ? [0.45, 0.9] : [0.75, 0.75];
      const moved = ease(local / moveEnd);
      const faded = ease((local - fadeStart) / (1 - fadeStart));
      const cut =
        faded < 1
          ? cutHtml(
              model,
              source,
              lerp(source, shift(land), moved),
              scale,
              1 - faded,
            )
          : "";
      const to = shift(target);
      let copies = "";
      if (tiled && local > moveEnd && faded < 1) {
        const others = rects
          .map((rect, k) => ({ rect, order: Math.abs(k - index) }))
          .filter(({ order }) => order > 0)
          .sort((a, b) => a.order - b.order);
        const step = (fadeStart - moveEnd) / others.length;
        const slid = others
          .map(({ rect }, j) => {
            const share = ease((local - moveEnd - j * step) / step);
            return share > 0
              ? cutHtml(
                  model,
                  source,
                  lerp(shift(land), shift(rect), share),
                  scale,
                  1 - faded,
                  to,
                )
              : "";
          })
          .join("");
        // Cut at the ends of the edge, as the render cuts the tiles there.
        copies = `<div class="cbt-border-image__clip" style="left:${n(to.x * scale)}px;top:${n(to.y * scale)}px;width:${n(to.width * scale)}px;height:${n(to.height * scale)}px">${slid}</div>`;
      }
      const painted =
        faded > 0
          ? `<div class="cbt-border-image__mover" style="left:${n(to.x * scale)}px;top:${n(to.y * scale)}px;opacity:${n(faded)}">${cloneHtml(model, target, target, scale)}</div>`
          : "";
      return taken + cut + copies + painted;
    })
    .join("");
}

// ——— The figures: the image cut, then the element ———

/** The room around a figure, left and above, for the values of its lines. */
export const MARGIN = 40;
/** The room right of a figure, for its height. */
const DIM = 16;
/** The room between the figures, for the arrow. */
const ARROW = 44;
/** How tall the figures grow at most, unless the panel says how much room. */
export const FIGURE_HEIGHT = 200;
/** The room a value takes along a line, not to cover the next one. */
const CHIP = { x: 44, y: 28 };

/**
 * Pixels of the panel per pixel of the render, for both figures: as large as
 * the width lets them, as long as they stay as tall as the room.
 */
export function figureScale({ layout }, width, height = FIGURE_HEIGHT) {
  const { area } = layout;
  const room = (width - ARROW - 2 * (MARGIN + DIM)) / 2;
  return Math.min(room / area.width, height / area.height, 4);
}

/** A length of the render in CSS pixels, written. */
function cssPx(px, zoom) {
  return `${n(px / zoom, 2)}px`;
}

/**
 * The values of the lines of a figure, by their lines: along the top for the
 * lines across, along the left for the others. A value that would cover the
 * one before slides further along, past it.
 *
 * @param {object[]} lines with their `axis`, `at` and `side`
 * @param {(l: object) => { text: string, px: string }} label
 * @param {{ scale: number, origin: object }} frame where the figure's pixel 0
 *   stands, in pixels of the panel and of the render
 */
function chipsHtml(lines, label, { scale, origin }) {
  const last = { x: -Infinity, y: -Infinity };
  return lines
    .map((l) => ({ l, at: (l.at - origin.render[l.axis]) * scale }))
    .sort((a, b) => a.at - b.at)
    .map(({ l, at: wanted }) => {
      const at = Math.max(wanted, last[l.axis] + CHIP[l.axis]);
      last[l.axis] = at;
      const { text, px } = label(l);
      const second = px === text ? "" : `<small>${escape(px)}</small>`;
      const position =
        "x" === l.axis
          ? `left:${n(origin.x + at)}px;top:0`
          : `right:calc(100% - ${n(origin.x - 4)}px);top:${n(origin.y + at)}px`;
      return `<span class="cbt-border-image__chip cbt-border-image__chip--${l.group} cbt-border-image__chip--${l.axis}" style="${position}"><b>${escape(text)}</b>${second}</span>`;
    })
    .join("");
}

/**
 * The two figures, side by side: the image cut by its slices, then the
 * element, the border it lands in drawn by its widths. While the pieces play,
 * they go from the one to the other.
 *
 * @param {object} model
 * @param {number} t 0 to 1: under 1, the pieces play
 * @param {number} width the room
 * @param {number} [height] how tall the figures grow at most
 */
export function figuresHtml(model, t, width, height = FIGURE_HEIGHT) {
  const { layout, locked, hovered, isolated, dragged, zoom, written } = model;
  const { area, image, outsets, pieces } = layout;
  const scale = figureScale(model, width, height);
  const unit = 1 / scale;
  const playing = t < 1;
  const marks = { hovered, isolated };
  const size = { width: area.width * scale, height: area.height * scale };
  const figure = {
    width: MARGIN + size.width + DIM,
    height: MARGIN + size.height + 44,
  };
  // Each figure in the middle of its half, the arrow between, both in the
  // middle of the height.
  const half = (width - ARROW) / 2;
  const at = {
    x: (half - figure.width) / 2,
    y: (height - size.height) / 2,
  };
  const place = (x) =>
    `left:${n(x)}px;top:${n(at.y)}px;width:${n(figure.width)}px;height:${n(figure.height)}px`;
  const view = (x, y) =>
    `viewBox="${n(x - MARGIN * unit)} ${n(y - MARGIN * unit)} ${n(figure.width * unit)} ${n(figure.height * unit)}" width="${n(figure.width)}" height="${n(figure.height)}"`;
  const zones = (rect, extra) =>
    pieces
      .map(
        (piece) =>
          rectSvg(
            rect(piece),
            `class="${pieceClass(piece, marks)}" data-zone="${piece.zone}"${extra}`,
          ) + numberSvg(piece, rect(piece), unit),
      )
      .join("");

  // The image, its slices out of it, a handle at their ends.
  const slices = sourceLines(layout);
  const cuts = slices
    .map((l) => {
      const out = { ...l, span: [-10 * unit, l.span[1]] };
      const { line, handle } = edgeSvg(out, {
        locked: locked.includes(l.id),
        active: dragged === l.id,
        handleAt: (point) =>
          "y" === l.axis
            ? { ...point, x: -8 * unit }
            : { ...point, y: -8 * unit },
        unit: 1.5 * unit,
      });
      return line + handle;
    })
    .join("");
  const sliceChips = chipsHtml(
    slices,
    (l) => ({
      text: written.slice[l.side],
      px: cssPx(layout.slices[l.side], zoom),
    }),
    { scale, origin: { x: MARGIN, y: MARGIN, render: { x: 0, y: 0 } } },
  );
  const dims = `<span class="cbt-border-image__dim-w" style="left:${MARGIN}px;top:${n(MARGIN + size.height + 2)}px;width:${n(size.width)}px">${n(image.width / zoom, 2)}</span><span class="cbt-border-image__dim-h" style="left:${n(MARGIN + size.width + 3)}px;top:${MARGIN}px;height:${n(size.height)}px">${n(image.height / zoom, 2)}</span>`;
  const imageFigure = `<figure class="cbt-border-image__figure" data-image style="${place(at.x)}"><div class="cbt-border-image__at" style="left:${MARGIN}px;top:${MARGIN}px">${imageHtml(model, scale)}</div><svg class="cbt-border-image__slices" ${view(0, 0)}>${zones((piece) => piece.source, "")}${cuts}</svg>${sliceChips}${dims}<figcaption style="left:${MARGIN}px">image</figcaption></figure>`;

  // The element: the area, the border box in it, the widths, the outsets.
  const box = {
    x: 0,
    y: 0,
    width: area.width - outsets[1] - outsets[3],
    height: area.height - outsets[0] - outsets[2],
  };
  const guides = outputLines(layout).filter(
    (l) => "width" === l.group || outsets[l.side] > 0,
  );
  // Out of the area, a handle at their ends, as the slices'.
  const guideSvg = guides
    .map((l) => {
      const out = { ...l, span: [l.span[0] - 10 * unit, l.span[1]] };
      const { line, handle } = edgeSvg(out, {
        locked: locked.includes(l.id),
        active: dragged === l.id,
        handleAt: (point) =>
          "y" === l.axis
            ? { ...point, x: area.x - 8 * unit }
            : { ...point, y: area.y - 8 * unit },
        unit: 1.5 * unit,
      });
      return line + handle;
    })
    .join("");
  const outlined = outsets.some((o) => o > 0)
    ? rectSvg(box, `class="cbt-border-image__box"`)
    : "";
  const guideChips = chipsHtml(
    guides,
    (l) => ({
      text: written[l.group][l.side],
      px: cssPx(("width" === l.group ? layout.widths : outsets)[l.side], zoom),
    }),
    {
      scale,
      origin: { x: MARGIN, y: MARGIN, render: { x: area.x, y: area.y } },
      size,
    },
  );
  // How far the element stands from the image.
  const right = half + ARROW;
  const ghost = playing ? " cbt-border-image__at--ghost" : "";
  const elementFigure = `<figure class="cbt-border-image__figure" style="${place(at.x + right)}"><div class="cbt-border-image__paper" style="left:${MARGIN}px;top:${MARGIN}px;width:${n(size.width)}px;height:${n(size.height)}px"></div><div class="cbt-border-image__at${ghost}" style="left:${MARGIN}px;top:${MARGIN}px">${cloneHtml(model, area, area, scale)}</div><svg class="cbt-border-image__guides" ${view(area.x, area.y)}>${zones((piece) => piece.target, " data-isolate")}${outlined}${guideSvg}</svg>${guideChips}<figcaption style="left:${MARGIN}px">element</figcaption></figure>`;

  const arrow = `<svg class="cbt-border-image__arrow${playing ? " cbt-border-image__arrow--playing" : ""}" style="left:${n(width / 2 - 10)}px;top:${n(at.y + MARGIN + size.height / 2 - 7)}px" width="20" height="14" viewBox="0 0 20 14" aria-hidden="true"><path d="M1 7h17M12 1.5L18 7l-6 5.5"/></svg>`;
  const play = playing
    ? `<div class="cbt-border-image__flight" style="left:${n(at.x + MARGIN)}px;top:${n(at.y + MARGIN)}px">${playHtml(model, t, scale, right * unit)}</div>`
    : "";
  return `<div class="cbt-border-image__stage" style="width:${n(width)}px;height:${n(MARGIN + height + 44)}px">${imageFigure}${arrow}${elementFigure}${play}</div>`;
}

// ——— The nine pieces, one by one ———

/** The room of a thumbnail. */
const THUMB = { width: 56, height: 40 };

const EYE = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.5"/><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/></svg>`;
const TURN = `<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M8.5 4A3.6 3.6 0 102 7.5M8.5 1v3h-3"/></svg>`;
const TO = `<svg class="cbt-border-image__to" width="14" height="10" viewBox="0 0 14 10" aria-hidden="true"><path d="M1 5h11M8.5 1.5L12 5l-3.5 3.5"/></svg>`;
const MISSING = `<span class="cbt-border-image__missing"></span>`;

/** Where the tiles of a piece meet, in its thumbnail. */
function seamsHtml(piece, scale) {
  const rects = tileRects(piece) ?? [];
  if (rects.length < 2 || rects.length > 12) {
    return "";
  }
  const x = "x" === piece.axis;
  return rects
    .slice(1)
    .map((rect) => {
      const at = x ? rect.x - piece.target.x : rect.y - piece.target.y;
      return `<span class="cbt-border-image__seam cbt-border-image__seam--${piece.axis}" style="${x ? "left" : "top"}:${n(at * scale)}px"></span>`;
    })
    .join("");
}

/**
 * Each piece on a row: cut in the image, then as it lands, what happens to it,
 * and what to change.
 *
 * @param {object} model
 * @param {number} t 0 to 1: under 1, the pieces play
 */
export function piecesHtml(model, t) {
  const { layout, stories, opaque, repeat, fill, hovered, isolated } = model;
  const locked = opaque ? " disabled" : "";
  const playing = t < 1;
  return layout.pieces
    .map((piece) => {
      const { zone, source, target, kind, drawn } = piece;
      const story = stories[zone];
      // Both at the same scale, to compare them; a slice too thin, apart.
      const scale = fit(
        {
          width: Math.max(source.width, target.width),
          height: Math.max(source.height, target.height),
        },
        { ...THUMB, scale: 4 },
      );
      const visible = Math.min(source.width, source.height) * scale >= 3;
      const cutScale = visible
        ? scale
        : fit(source, { ...THUMB, scale: Infinity });
      const cut =
        source.width > 0 && source.height > 0
          ? cropHtml(model, source, cutScale)
          : MISSING;
      const landed = drawn
        ? `<span class="cbt-border-image__landed">${cloneHtml(model, target, target, scale)}${seamsHtml(piece, scale)}</span>`
        : MISSING;
      let action = "";
      if ("edge" === kind) {
        const axis = "x" === piece.axis ? 0 : 1;
        const both = 0 === axis ? "top and bottom" : "left and right";
        action = `<button type="button" class="cbt-border-image__repeat" data-repeat="${axis}" title="Next repeat, for both ${both} edges"${locked}>${repeat[axis]}${TURN}</button>`;
      } else if ("middle" === kind) {
        action = `<button type="button" class="cbt-border-image__fill" data-fill aria-pressed="${fill}" title="${fill ? "Take fill off: the middle stays empty" : "Add fill: paint the middle too"}"${locked}>${fill ? "− fill" : "+ fill"}</button>`;
      }
      const done = playing && 1 === progress(model, zone, t);
      const now = playing && drawn && zone === stepAt(model, t).zone;
      const later = playing && !done && !now;
      const classes = [
        "cbt-border-image__row",
        zone === hovered || now ? "cbt-border-image__row--lit" : "",
        later ? "cbt-border-image__row--later" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const badge = done && drawn ? "✓" : String(zone + 1);
      const badgeClass = now
        ? " cbt-border-image__badge--now"
        : done && drawn
          ? " cbt-border-image__badge--done"
          : "";
      const what = story.behavior
        ? `<span class="cbt-border-image__what">${escape(story.behavior)}</span>`
        : "";
      const warning = story.warning
        ? `<span class="cbt-border-image__what cbt-border-image__what--warning">${escape(story.warning)}</span>`
        : "";
      return `<div class="${classes}" data-zone="${zone}"><span class="cbt-border-image__badge${badgeClass}">${badge}</span><span class="cbt-border-image__thumb cbt-border-image__thumb--cut">${cut}</span>${TO}<span class="cbt-border-image__thumb cbt-border-image__thumb--landed">${landed}</span><span class="cbt-border-image__about"><span class="cbt-border-image__name">${escape(story.name)}</span>${what}${warning}<span class="cbt-border-image__sizes">${story.sizes}</span></span>${action}<button type="button" class="cbt-border-image__eye" data-isolate="${zone}" aria-pressed="${zone === isolated}" aria-label="Show piece ${zone + 1} alone on the output" title="Show it alone on the output">${EYE}</button></div>`;
    })
    .join("");
}
