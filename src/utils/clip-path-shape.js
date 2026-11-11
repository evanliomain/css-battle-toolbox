/**
 * Reads the basic shape of a clip-path value, and lays out the handles the
 * clip-path tool draws on the render: where each one stands, in pixels of the
 * reference box, and the text to write when it is dragged.
 *
 * Only the numbers a handle moves are rewritten, so the rest of the code keeps
 * its spacing, golfed or not.
 */

import { format, KEYWORDS, toPx } from "./clip-path-geometry";

/** @typedef {import("./clip-path-geometry").Box} Box */
/** @typedef {import("./clip-path-geometry").Basis} Basis */

/**
 * @typedef {object} Node
 * @property {"number" | "ident" | "function" | "comma" | "slash" | "other"} type
 * @property {number} from
 * @property {number} to
 * @property {number} [value] a number's value
 * @property {string} [unit] a number's unit, lowercase, `%` included
 * @property {string} [name] an identifier, or a function's name, lowercase
 * @property {number} [open] where a function's arguments start
 * @property {number} [close] where they end, its `)` or the end of the text
 * @property {Node[][]} [groups] a function's comma separated arguments
 */

/**
 * @typedef {object} Change a change of the value's text
 * @property {number} from
 * @property {number} [to]
 * @property {string} insert
 */

/**
 * @typedef {object} Handle
 * @property {string} id the same from one edit to the next
 * @property {"vertex" | "mid" | "center" | "radius" | "edge" | "control"} kind
 * @property {number} x
 * @property {number} y
 * @property {{ x: boolean, y: boolean }} free which axes it can move along
 * @property {{ x: string, y: string }} units what it writes
 * @property {(point: Point, options?: WriteOptions) => Change[]} write
 */

/**
 * @typedef {object} WriteOptions
 * @property {number} [precision] decimals added, 1 to fine tune
 * @property {Partial<{ x: string, y: string }>} [units] the units to write,
 *   those of the drag's start, so a value going through 0 keeps its unit
 */

/** @typedef {{ x: number, y: number }} Point */

/**
 * @typedef {object} Layout
 * @property {string | null} path the outline of the shape, as SVG path data
 * @property {Handle[]} handles
 * @property {[Point, Point][]} lines from each control point to its anchor
 */

export const SHAPE_NAMES = [
  "polygon",
  "circle",
  "ellipse",
  "inset",
  "rect",
  "xywh",
  "shape",
];

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(%|[a-z]+)?/i;
const IDENT = /^-?[a-z_][\w-]*/i;
const PUNCTUATION = { "(": "open", ")": "close", ",": "comma", "/": "slash" };

/**
 * @param {string} text a clip-path value
 * @returns {{ text: string, nodes: Node[], shape: Node | null }}
 */
export function parseClipPath(text) {
  const nodes = parseNodes(text);
  const shape =
    nodes.find(
      (node) => "function" === node.type && SHAPE_NAMES.includes(node.name),
    ) ?? null;
  return { text, nodes, shape };
}

function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const skip = /^(?:\s+|\/\*[\s\S]*?(?:\*\/|$))/.exec(rest);
    if (skip) {
      i += skip[0].length;
      continue;
    }
    const number = NUMBER.exec(rest);
    const ident = IDENT.exec(rest);
    let token;
    if (number) {
      token = {
        type: "number",
        value: parseFloat(number[0]),
        unit: (number[1] ?? "").toLowerCase(),
        to: i + number[0].length,
      };
    } else if (ident && "(" === text[i + ident[0].length]) {
      token = {
        type: "open",
        name: ident[0].toLowerCase(),
        to: i + ident[0].length + 1,
      };
    } else if (ident) {
      token = {
        type: "ident",
        name: ident[0].toLowerCase(),
        to: i + ident[0].length,
      };
    } else {
      token = { type: PUNCTUATION[text[i]] ?? "other", name: "", to: i + 1 };
    }
    tokens.push({ ...token, from: i });
    i = token.to;
  }
  return tokens;
}

/** The value as a tree: functions hold their comma separated arguments. */
function parseNodes(text) {
  const root = { groups: [[]] };
  const stack = [root];
  for (const token of tokenize(text)) {
    const top = stack.at(-1);
    const group = top.groups.at(-1);
    if ("open" === token.type) {
      const fn = {
        type: "function",
        name: token.name,
        from: token.from,
        open: token.to,
        close: text.length,
        to: text.length,
        groups: [[]],
      };
      group.push(fn);
      stack.push(fn);
    } else if ("close" === token.type && stack.length > 1) {
      const fn = stack.pop();
      fn.close = token.from;
      fn.to = token.to;
    } else if ("comma" === token.type && stack.length > 1) {
      top.groups.push([]);
    } else {
      group.push({
        ...token,
        type: "close" === token.type ? "other" : token.type,
      });
    }
  }
  return root.groups[0];
}

/**
 * The commands a shape() can get a new point with, in the order of the bar:
 * `cubic` stands for a curve with 2 control points.
 */
export const ADDED_COMMANDS = [
  { name: "line", label: "line", title: "A straight line" },
  { name: "hline", label: "hline", title: "A horizontal line" },
  { name: "vline", label: "vline", title: "A vertical line" },
  { name: "curve", label: "curve", title: "A curve with 1 control point" },
  { name: "cubic", label: "curve ×2", title: "A curve with 2 control points" },
  {
    name: "smooth",
    label: "smooth",
    title: "A curve going on from the one before",
  },
  { name: "arc", label: "arc", title: "An arc of an ellipse" },
];

/**
 * Where to draw the handles of the shape, and what each writes.
 *
 * @param {{ text: string, shape: Node | null }} parsed
 * @param {Box} box
 * @param {{ add?: string }} [options] the command a new point of a shape()
 *   comes with, one of `ADDED_COMMANDS`, `line` by default
 * @returns {Layout}
 */
export function layoutShape(parsed, box, { add = "line" } = {}) {
  const { shape } = parsed;
  const layout = { path: null, handles: [], lines: [] };
  if (null === shape) {
    return layout;
  }
  const ctx = {
    text: parsed.text,
    box,
    unit: defaultUnit(shape),
    layout,
    add,
  };
  LAYOUTS[shape.name](shape, ctx);
  return layout;
}

/**
 * The unit a value takes where none is written: the one the shape uses most,
 * percentages if it has none.
 */
function defaultUnit(shape) {
  const counts = new Map();
  (function walk(nodes) {
    for (const node of nodes) {
      if ("function" === node.type) {
        node.groups.forEach(walk);
      } else if ("number" === node.type && "" !== node.unit) {
        counts.set(node.unit, (counts.get(node.unit) ?? 0) + 1);
      }
    }
  })([shape]);
  let unit = "%";
  let max = 0;
  for (const [candidate, count] of counts) {
    if (count > max) {
      unit = candidate;
      max = count;
    }
  }
  return unit;
}

const LAYOUTS = {
  polygon,
  circle: (fn, ctx) => radial(fn, ctx, 1),
  ellipse: (fn, ctx) => radial(fn, ctx, 2),
  inset,
  rect,
  xywh,
  shape,
};

// ——— Scalars: one length of the shape, and how to rewrite it ———

/**
 * @typedef {object} Scalar
 * @property {Node | null} node the length, `null` when it is left out
 * @property {Basis} basis
 * @property {number} px where it stands, `NaN` when unknown
 * @property {boolean} free whether the tool can rewrite it
 * @property {string} unit what it writes
 */

/**
 * @param {Node | null} node
 * @param {Basis} basis
 * @param {object} ctx
 * @param {number} [fallback] in pixels, for a keyword or a left out value
 * @returns {Scalar}
 */
function scalar(node, basis, ctx, fallback = NaN) {
  const px = null === node ? null : toPx(node, basis, ctx.box);
  const known = null !== px;
  return {
    node,
    basis,
    px: known ? px : fallback,
    // A keyword or a left out value becomes a number once dragged.
    free: known || null === node || "ident" === node.type,
    unit: known && "" !== node.unit ? node.unit : ctx.unit,
  };
}

/** The text of a scalar moved to `px`. */
function write(s, px, ctx, options = {}) {
  // A written unit stays; a 0, a keyword or nothing takes the drag's.
  const fixed = "number" === s.node?.type && "" !== s.node.unit;
  const unit = fixed
    ? s.unit
    : (options.units?.["y" === s.basis ? "y" : "x"] ?? s.unit);
  return format(px, unit, s.basis, ctx.box, options.precision);
}

/**
 * Replaces some text, with a space where it would stick to its neighbors:
 * `10px` glued to a number before it, or `50%0` once `50%` became `5px`.
 *
 * @returns {Change}
 */
function replace(ctx, from, to, insert) {
  const before = ctx.text.charAt(from - 1);
  const after = ctx.text.charAt(to);
  if (/[\w.]/.test(before) && /^[^\s,]/.test(insert)) {
    insert = ` ${insert}`;
  }
  if (/[^\s%,]$/.test(insert) && /[\w.%+-]/.test(after)) {
    insert = `${insert} `;
  }
  return { from, to, insert };
}

/**
 * Rewrites a scalar, with nothing to do along a fixed axis. Every caller
 * adds a left out scalar its own way.
 */
function writeScalar(s, px, ctx, options) {
  if (!s.free) {
    return [];
  }
  return [replace(ctx, s.node.from, s.node.to, write(s, px, ctx, options))];
}

/** @param {Node[]} nodes */
function span(nodes) {
  return { from: nodes[0].from, to: nodes.at(-1).to };
}

function isIdent(node, ...names) {
  return (
    "ident" === node?.type && (0 === names.length || names.includes(node.name))
  );
}

function handle(ctx, id, kind, x, y, free, units, writer, extra = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }
  ctx.layout.handles.push({
    id,
    kind,
    x,
    y,
    free,
    units,
    write: writer,
    ...extra,
  });
}

function units(sx, sy) {
  return { x: sx.unit, y: sy.unit };
}

/** SVG path data, `null` if a point is unknown. */
function pathData(commands) {
  const data = commands
    .map(([command, ...values]) =>
      [command, ...values.map((value) => Number(value.toFixed(2)))].join(" "),
    )
    .join(" ");
  return /NaN|Infinity/.test(data) ? null : data;
}

// ——— Positions: `at`, `from` and `to` take 1 or 2 values ———

/**
 * @typedef {object} Position
 * @property {Node[]} nodes all of it, to rewrite it at once
 * @property {Scalar} x
 * @property {Scalar} y
 * @property {boolean} free
 */

/** @returns {Position} */
function position(nodes, ctx, optional = false) {
  const { width, height } = ctx.box;
  const keyword = (node, size) =>
    isIdent(node) && Object.hasOwn(KEYWORDS, node.name)
      ? (KEYWORDS[node.name] * size) / 100
      : NaN;
  let [a = null, b = null] = nodes;
  // `top left` and `top` alone name the vertical side first, or only.
  if (isIdent(a, "top", "bottom") || isIdent(b, "left", "right")) {
    [a, b] = [b, a];
  }
  const x = scalar(a, "x", ctx, null === a ? width / 2 : keyword(a, width));
  const y = scalar(b, "y", ctx, null === b ? height / 2 : keyword(b, height));
  // 3 or 4 values, `right 10px top 5px`: drawn nowhere, rewritten never.
  // Left out, it can only be added where the shape says so.
  const free =
    nodes.length <= 2 && (optional || nodes.length > 0) && x.free && y.free;
  return { nodes, x, y, free };
}

/** Rewrites a whole position as `x y`, or adds it with `prefix`. */
function writePosition(pos, point, ctx, options, insertAt, prefix) {
  if (!pos.free) {
    return [];
  }
  const text = `${write(pos.x, point.x, ctx, options)} ${write(pos.y, point.y, ctx, options)}`;
  if (0 === pos.nodes.length) {
    return [replace(ctx, insertAt, insertAt, `${prefix}${text}`)];
  }
  const { from, to } = span(pos.nodes);
  return [replace(ctx, from, to, text)];
}

// ——— polygon( <fill-rule>? [round <length>]?, [<x> <y>]# ) ———

function polygon(fn, ctx) {
  const groups = fn.groups.filter(
    (group) => group.length >= 2 && !isIdent(group[0]),
  );
  const points = groups.map((group) => ({
    group,
    x: scalar(group[0], "x", ctx),
    y: scalar(group[1], "y", ctx),
  }));
  ctx.layout.path = pathData([
    ...points.map(({ x, y }, i) => [0 === i ? "M" : "L", x.px, y.px]),
    ...(points.length > 0 ? [["Z"]] : []),
  ]);
  const separator = /,\s/.test(ctx.text.slice(fn.open, fn.close)) ? ", " : ",";

  points.forEach(({ x, y }, i) => {
    const writer = (point, options) => [
      ...writeScalar(x, point.x, ctx, options),
      ...writeScalar(y, point.y, ctx, options),
    ];
    // Removing a point asks for a triangle at least to remain.
    const remove = points.length > 3 ? () => [removePoint(groups, i)] : null;
    handle(
      ctx,
      `v${i}`,
      "vertex",
      x.px,
      y.px,
      { x: x.free, y: y.free },
      units(x, y),
      writer,
      { remove },
    );
  });

  // A new point in the middle of each side. Two points make a single side.
  const sides = points.length > 2 ? points.length : points.length - 1;
  for (let i = 0; i < sides; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const writer = (point, options) => [
      {
        from: a.group.at(-1).to,
        insert: `${separator}${write(a.x, point.x, ctx, options)} ${write(a.y, point.y, ctx, options)}`,
      },
    ];
    handle(
      ctx,
      `m${i}`,
      "mid",
      (a.x.px + b.x.px) / 2,
      (a.y.px + b.y.px) / 2,
      { x: true, y: true },
      units(a.x, a.y),
      writer,
      // Once added, the drag goes on with the new point.
      { next: `v${i + 1}` },
    );
  }
}

/** Removes a point with the comma that goes with it. */
function removePoint(groups, i) {
  if (0 === i) {
    return { from: groups[0][0].from, to: groups[1][0].from, insert: "" };
  }
  return {
    from: groups[i - 1].at(-1).to,
    to: groups[i].at(-1).to,
    insert: "",
  };
}

// ——— circle( <radius>? [at <position>]? ), ellipse( [<rx> <ry>]? … ) ———

function radial(fn, ctx, count) {
  const { width, height } = ctx.box;
  const args = fn.groups[0];
  const at = args.findIndex((node) => isIdent(node, "at"));
  const radii = -1 === at ? args : args.slice(0, at);
  const center = position(-1 === at ? [] : args.slice(at + 1), ctx, -1 === at);
  const cx = center.x.px;
  const cy = center.y.px;

  /** closest-side, the default, and farthest-side. */
  const side = (node, ...distances) =>
    isIdent(node, "farthest-side")
      ? Math.max(...distances)
      : Math.min(...distances);
  const dx = [cx, width - cx];
  const dy = [cy, height - cy];
  const nodes = radii.length === count ? radii : [];
  const r =
    1 === count
      ? [scalar(nodes[0] ?? null, "r", ctx, side(nodes[0], ...dx, ...dy))]
      : [
          scalar(nodes[0] ?? null, "x", ctx, side(nodes[0], ...dx)),
          scalar(nodes[1] ?? null, "y", ctx, side(nodes[1], ...dy)),
        ];
  const rx = r[0].px;
  const ry = (r[1] ?? r[0]).px;

  ctx.layout.path = pathData([
    ["M", cx - rx, cy],
    ["A", rx, ry, 0, 1, 0, cx + rx, cy],
    ["A", rx, ry, 0, 1, 0, cx - rx, cy],
    ["Z"],
  ]);

  const centerWriter = (point, options) =>
    writePosition(
      center,
      point,
      ctx,
      options,
      fn.close,
      0 === args.length ? "at " : " at ",
    );
  handle(
    ctx,
    "c",
    "center",
    cx,
    cy,
    { x: center.free, y: center.free },
    units(center.x, center.y),
    centerWriter,
  );

  /** Writes the radii, all of them when they were left out. */
  const radiusWriter = (index, distance) => (point, options) => {
    const values = r.map((s, i) => (i === index ? distance(point) : s.px));
    if (0 === nodes.length) {
      const text = values
        .map((px, i) => write(r[i], px, ctx, options))
        .join(" ");
      const space = args.length > 0 ? " " : "";
      // A radius stray from an unfinished ellipse goes with the new ones.
      const to = radii.length > 0 ? span(radii).to : fn.open;
      return [
        replace(ctx, fn.open, to, `${text}${radii.length > 0 ? "" : space}`),
      ];
    }
    return writeScalar(r[index], values[index], ctx, options);
  };
  if (1 === count) {
    handle(
      ctx,
      "r",
      "radius",
      cx + rx,
      cy,
      { x: r[0].free, y: r[0].free },
      units(r[0], r[0]),
      radiusWriter(0, (point) => Math.hypot(point.x - cx, point.y - cy)),
    );
    return;
  }
  handle(
    ctx,
    "rx",
    "radius",
    cx + rx,
    cy,
    { x: r[0].free, y: false },
    units(r[0], r[1]),
    radiusWriter(0, (point) => Math.abs(point.x - cx)),
  );
  handle(
    ctx,
    "ry",
    "radius",
    cx,
    cy + ry,
    { x: false, y: r[1].free },
    units(r[0], r[1]),
    radiusWriter(1, (point) => Math.abs(point.y - cy)),
  );
}

// ——— inset(), rect(), xywh(): 4 sides, then `round` and radii ———

/** The lengths before `round`. */
function sides(fn) {
  const args = fn.groups[0];
  const round = args.findIndex((node) => isIdent(node, "round"));
  return -1 === round ? args : args.slice(0, round);
}

/** The rectangle as a path, and a handle in the middle of each side. */
function edges(ctx, { top, right, bottom, left }, writers) {
  ctx.layout.path = pathData([
    ["M", left, top],
    ["L", right, top],
    ["L", right, bottom],
    ["L", left, bottom],
    ["Z"],
  ]);
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;
  const [t, r, b, l] = writers;
  handle(
    ctx,
    "t",
    "edge",
    midX,
    top,
    { x: false, y: t.free },
    t.units,
    t.write,
  );
  handle(
    ctx,
    "r",
    "edge",
    right,
    midY,
    { x: r.free, y: false },
    r.units,
    r.write,
  );
  handle(
    ctx,
    "b",
    "edge",
    midX,
    bottom,
    { x: false, y: b.free },
    b.units,
    b.write,
  );
  handle(
    ctx,
    "l",
    "edge",
    left,
    midY,
    { x: l.free, y: false },
    l.units,
    l.write,
  );
}

/** inset( <top> <right>? <bottom>? <left>? ), the sides as for margin. */
function inset(fn, ctx) {
  const { width, height } = ctx.box;
  const values = sides(fn);
  const [t = null, r = t, b = t, l = r] = values;
  const s = [
    scalar(t, "y", ctx, 0),
    scalar(r, "x", ctx, 0),
    scalar(b, "y", ctx, 0),
    scalar(l, "x", ctx, 0),
  ];
  // Where each side is drawn, and the inset it stands for.
  const at = [(px) => px, (px) => width - px, (px) => height - px, (px) => px];
  const writers = s.map((side, index) => {
    const free = side.free && values.length <= 4;
    return { free, units: { x: side.unit, y: side.unit }, write: writeSide };

    function writeSide(point, options) {
      if (!free) {
        return [];
      }
      const px = at[index]("y" === side.basis ? point.y : point.x);
      if (4 === values.length) {
        return writeScalar(side, px, ctx, options);
      }
      // Fewer than 4 values: each side is written, then shortened back.
      const texts = s.map((other, i) =>
        i === index
          ? write(side, px, ctx, options)
          : ((other.node && ctx.text.slice(other.node.from, other.node.to)) ??
            "0"),
      );
      const text = shortSides(texts);
      if (0 === values.length) {
        const space = fn.groups[0].length > 0 ? " " : "";
        return [replace(ctx, fn.open, fn.open, `${text}${space}`)];
      }
      const { from, to } = span(values);
      return [replace(ctx, from, to, text)];
    }
  });
  edges(
    ctx,
    {
      top: s[0].px,
      right: width - s[1].px,
      bottom: height - s[2].px,
      left: s[3].px,
    },
    writers,
  );
}

/** The shortest way to write 4 sides: `1 2 1 2` is `1 2`. */
export function shortSides([top, right, bottom, left]) {
  const sides = [top, right, bottom, left];
  if (left === right) {
    sides.pop();
    if (bottom === top) {
      sides.pop();
      if (right === top) {
        sides.pop();
      }
    }
  }
  return sides.join(" ");
}

/**
 * Rewrites some of 4 lengths, given as `index → px`. When fewer than 4 are
 * written yet, all 4 are: those left out take their default.
 *
 * @param {object} ctx
 * @param {Node} fn the function
 * @param {Node[]} values the lengths written
 * @param {Scalar[]} s the 4 lengths
 * @param {string[]} defaults the text of each left out length
 */
function fourWriter(ctx, fn, values, s, defaults) {
  return (moved, options) => {
    if (4 === values.length) {
      return [...moved].flatMap(([i, px]) =>
        writeScalar(s[i], px, ctx, options),
      );
    }
    const text = s
      .map((side, i) => {
        if (moved.has(i) && side.free) {
          return write(side, moved.get(i), ctx, options);
        }
        return side.node
          ? ctx.text.slice(side.node.from, side.node.to)
          : defaults[i];
      })
      .join(" ");
    if (0 === values.length) {
      const space = fn.groups[0].length > 0 ? " " : "";
      return [replace(ctx, fn.open, fn.open, `${text}${space}`)];
    }
    const { from, to } = span(values);
    return [replace(ctx, from, to, text)];
  };
}

/**
 * rect( <top> <right> <bottom> <left> ), each from the top or left edge. The
 * lengths not written yet stand on the edges of the box.
 */
function rect(fn, ctx) {
  const { width, height } = ctx.box;
  const values = sides(fn);
  if (values.length > 4) {
    return;
  }
  const autos = [0, width, height, 0];
  const s = [0, 1, 2, 3].map((i) => {
    const node = values[i] ?? null;
    const auto = null === node || isIdent(node, "auto");
    return scalar(node, i % 2 ? "x" : "y", ctx, auto ? autos[i] : NaN);
  });
  const writeAll = fourWriter(ctx, fn, values, s, ["0", "100%", "100%", "0"]);
  const writers = s.map((side, i) => ({
    free: side.free,
    units: { x: side.unit, y: side.unit },
    write: (point, options) =>
      writeAll(new Map([[i, "y" === side.basis ? point.y : point.x]]), options),
  }));
  edges(
    ctx,
    { top: s[0].px, right: s[1].px, bottom: s[2].px, left: s[3].px },
    writers,
  );
}

/**
 * xywh( <x> <y> <width> <height> ): a corner, and the opposite one. The
 * lengths not written yet cover the whole box.
 */
function xywh(fn, ctx) {
  const { width, height } = ctx.box;
  const values = sides(fn);
  if (values.length > 4) {
    return;
  }
  const [x, y, w, h] = [0, 0, width, height].map((fallback, i) =>
    scalar(values[i] ?? null, i % 2 ? "y" : "x", ctx, fallback),
  );
  const writeAll = fourWriter(
    ctx,
    fn,
    values,
    [x, y, w, h],
    ["0", "0", "100%", "100%"],
  );
  const right = x.px + w.px;
  const bottom = y.px + h.px;
  ctx.layout.path = pathData([
    ["M", x.px, y.px],
    ["L", right, y.px],
    ["L", right, bottom],
    ["L", x.px, bottom],
    ["Z"],
  ]);
  // The top left corner moves alone: the size follows, when it can.
  handle(
    ctx,
    "tl",
    "vertex",
    x.px,
    y.px,
    { x: x.free, y: y.free },
    units(x, y),
    (point, options) =>
      writeAll(
        new Map([
          [0, point.x],
          [1, point.y],
          [2, Math.max(0, right - point.x)],
          [3, Math.max(0, bottom - point.y)],
        ]),
        options,
      ),
  );
  handle(
    ctx,
    "br",
    "vertex",
    right,
    bottom,
    { x: w.free, y: h.free },
    units(w, h),
    (point, options) =>
      writeAll(
        new Map([
          [2, Math.max(0, point.x - x.px)],
          [3, Math.max(0, point.y - y.px)],
        ]),
        options,
      ),
  );
}

// ——— shape( <fill-rule>? from <position>, <command># ) ———

const ARC_WORDS = ["of", "cw", "ccw", "large", "small", "rotate"];
const ANGLES = { deg: 1, rad: 180 / Math.PI, grad: 0.9, turn: 360, "": 1 };

function shape(fn, ctx) {
  const [head, ...commands] = fn.groups;
  const from = head.findIndex((node) => isIdent(node, "from"));
  if (-1 === from) {
    return;
  }
  const start = position(head.slice(from + 1), ctx);
  const path = [["M", start.x.px, start.y.px]];
  /** Per command, the changes that keep it in place from another start. */
  const keeps = [];
  const keep = (k) => (at, options) => keeps[k]?.(at, options) ?? [];
  const separator = /,\s/.test(ctx.text.slice(fn.open, fn.close)) ? ", " : ",";
  const vertices = commands.filter(
    ([command, end]) =>
      isIdent(
        command,
        "move",
        "line",
        "hline",
        "vline",
        "curve",
        "smooth",
        "arc",
      ) && isIdent(end, "to", "by"),
  ).length;
  const shared = { ctx, fn, keep, separator, removable: vertices > 2 };
  handle(
    ctx,
    "from",
    "vertex",
    start.x.px,
    start.y.px,
    { x: start.free, y: start.free },
    units(start.x, start.y),
    (target, options) => [
      ...writePosition(start, target, ctx, options),
      ...keep(0)(movedPosition(start, target, ctx, options), options),
    ],
  );

  let current = { x: start.x.px, y: start.y.px };
  let subpath = current;
  commands.forEach((group, k) => {
    const [command, end, ...rest] = group;
    if (isIdent(command, "close")) {
      path.push(["Z"]);
      closeMid(shared, k, current, subpath);
      current = subpath;
      return;
    }
    if (!isIdent(command) || !isIdent(end, "to", "by")) {
      current = { x: NaN, y: NaN };
      return;
    }
    const step = { ...shared, k, from: current, absolute: "to" === end.name };
    let next;
    switch (command.name) {
      case "move":
        next = endPoint(step, rest);
        keeps[k] = next.rebase;
        subpath = next;
        path.push(["M", next.x, next.y]);
        break;
      case "line":
        next = endPoint(step, rest);
        keeps[k] = next.rebase;
        segmentMid(step, next, "line");
        path.push(["L", next.x, next.y]);
        break;
      case "hline":
      case "vline": {
        const axis = "hline" === command.name ? "x" : "y";
        next = axisLine(step, rest[0], axis);
        keeps[k] = next.rebase;
        segmentMid(step, next, command.name);
        path.push(["L", next.x, next.y]);
        break;
      }
      case "curve":
      case "smooth":
        next = curve(step, rest, path, "smooth" === command.name);
        keeps[k] = next.rebase;
        break;
      case "arc":
        next = arc(step, rest, path);
        keeps[k] = next.rebase;
        break;
      default:
        next = { x: NaN, y: NaN };
    }
    current = { x: next.x, y: next.y };
  });
  ctx.layout.path = pathData(path);
}

/**
 * What a free length reads once written: the tool rounds it, and what follows
 * is kept in place from there.
 */
function written(s, px, ctx, options) {
  const [, value, unit] = /^(-?[\d.]+)(.*)$/.exec(write(s, px, ctx, options));
  return toPx({ type: "number", value: Number(value), unit }, s.basis, ctx.box);
}

/** Where a position stands once moved to `target`. */
function movedPosition(pos, target, ctx, options) {
  if (!pos.free) {
    return { x: pos.x.px, y: pos.y.px };
  }
  return {
    x: written(pos.x, target.x, ctx, options),
    y: written(pos.y, target.y, ctx, options),
  };
}

/**
 * A point of a command, the end or a control point: a position if absolute,
 * else a pair of lengths from `anchor`.
 *
 * @returns {Point & { free: boolean, units: object, write: Function,
 *   moved: Function, rebase: Function }} `moved` tells where `write` puts
 *   it, `rebase` rewrites it to stay where it is from another anchor
 */
function point(ctx, nodes, absolute, anchor) {
  if (absolute) {
    const pos = position(nodes, ctx);
    return {
      x: pos.x.px,
      y: pos.y.px,
      free: pos.free,
      units: units(pos.x, pos.y),
      write: (target, options) => writePosition(pos, target, ctx, options),
      moved: (target, options) => movedPosition(pos, target, ctx, options),
      rebase: () => [],
    };
  }
  const [dx = null, dy = null] = nodes;
  const x = scalar(dx, "x", ctx);
  const y = scalar(dy, "y", ctx);
  const free = 2 === nodes.length && x.free && y.free;
  const at = { x: anchor.x + x.px, y: anchor.y + y.px };
  const writeFrom = (base, target, options) =>
    free
      ? [
          ...writeScalar(x, target.x - base.x, ctx, options),
          ...writeScalar(y, target.y - base.y, ctx, options),
        ]
      : [];
  return {
    ...at,
    free,
    units: units(x, y),
    write: (target, options) => writeFrom(anchor, target, options),
    moved: (target, options) =>
      free
        ? {
            x: anchor.x + written(x, target.x - anchor.x, ctx, options),
            y: anchor.y + written(y, target.y - anchor.y, ctx, options),
          }
        : at,
    rebase: (base, options) => writeFrom(base, at, options),
  };
}

function addPoint(ctx, id, kind, p) {
  handle(ctx, id, kind, p.x, p.y, { x: p.free, y: p.free }, p.units, p.write);
}

/**
 * The handle of a command's end: moving it keeps the next command in place,
 * and pressing it twice removes the command, the next one kept in place too.
 */
function vertex(step, end, free) {
  const { ctx, fn, k, keep, from, removable } = step;
  const remove = removable
    ? () => [
        {
          from: fn.groups[k].at(-1).to,
          to: fn.groups[k + 1].at(-1).to,
          insert: "",
        },
        ...keep(k + 1)(from, {}),
      ]
    : null;
  handle(
    ctx,
    `p${k}`,
    "vertex",
    end.x,
    end.y,
    free,
    end.units,
    (target, options) => [
      ...end.write(target, options),
      ...keep(k + 1)(end.moved(target, options), options),
    ],
    { remove },
  );
}

/** move and line: `to <position>` or `by <x> <y>`. */
function endPoint(step, nodes) {
  const end = point(step.ctx, nodes, step.absolute, step.from);
  vertex(step, end, { x: end.free, y: end.free });
  return end;
}

/** hline and vline: a single length, or a keyword when absolute. */
function axisLine(step, node = null, axis) {
  const { ctx, from, absolute } = step;
  const size = "x" === axis ? ctx.box.width : ctx.box.height;
  const keyword =
    absolute && isIdent(node) && Object.hasOwn(KEYWORDS, node.name)
      ? (KEYWORDS[node.name] * size) / 100
      : NaN;
  const s = scalar(node, axis, ctx, keyword);
  const origin = (base) => (absolute ? 0 : base[axis]);
  const end = { ...from, [axis]: origin(from) + s.px };
  // Drawn only once known: a length, or a keyword where absolute.
  vertex(
    step,
    {
      ...end,
      units: units(s, s),
      write: (target, options) =>
        writeScalar(s, target[axis] - origin(from), ctx, options),
      moved: (target, options) => ({
        ...end,
        [axis]:
          origin(from) + written(s, target[axis] - origin(from), ctx, options),
      }),
    },
    { x: "x" === axis, y: "y" === axis },
  );
  return {
    ...end,
    axis,
    rebase: (base, options) =>
      absolute ? [] : writeScalar(s, end[axis] - base[axis], ctx, options),
  };
}

// ——— New points of shape(), with the command picked in the bar ———

const middle = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const along = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/**
 * A new pair `x y`, from the origin of the box when absolute, else from
 * `from`, in the unit of the shape.
 */
function newPair(ctx, at, from, absolute, options) {
  const x = scalar(null, "x", ctx);
  const y = scalar(null, "y", ctx);
  const base = absolute ? { x: 0, y: 0 } : from;
  return {
    text: `${write(x, at.x - base.x, ctx, options)} ${write(y, at.y - base.y, ctx, options)}`,
    at: {
      x: base.x + written(x, at.x - base.x, ctx, options),
      y: base.y + written(y, at.y - base.y, ctx, options),
    },
  };
}

/** A new point `line to x y`, or `line by x y` from `from`. */
function newLine(ctx, at, from, absolute, options) {
  const end = newPair(ctx, at, from, absolute, options);
  return { text: `line ${absolute ? "to" : "by"} ${end.text}`, at: end.at };
}

/**
 * A new curve from `from` to `at`, its control points drawn from its start
 * when relative.
 */
function newCurve(ctx, from, at, controls, absolute, options) {
  const end = newPair(ctx, at, from, absolute, options);
  const pulls = controls
    .map((control) => newPair(ctx, control, from, absolute, options).text)
    .join(" / ");
  return {
    text: `curve ${absolute ? "to" : "by"} ${end.text} with ${pulls}`,
    at: end.at,
  };
}

/**
 * A new command of the kind picked, from `from` to `at`. Its control points
 * stand on the way there: they pull once the point moves on.
 *
 * @returns {{ text: string, at: Point }} its text, and where it ends
 */
function newCommand(ctx, kind, from, at, absolute, options) {
  const by = absolute ? "to" : "by";
  switch (kind) {
    case "hline":
    case "vline": {
      const axis = "hline" === kind ? "x" : "y";
      const s = scalar(null, axis, ctx);
      const base = absolute ? 0 : from[axis];
      const length = at[axis] - base;
      return {
        text: `${kind} ${by} ${write(s, length, ctx, options)}`,
        at: { ...from, [axis]: base + written(s, length, ctx, options) },
      };
    }
    case "curve":
      return newCurve(ctx, from, at, [middle(from, at)], absolute, options);
    case "cubic":
      return newCurve(
        ctx,
        from,
        at,
        [along(from, at, 1 / 3), along(from, at, 2 / 3)],
        absolute,
        options,
      );
    case "smooth": {
      const end = newPair(ctx, at, from, absolute, options);
      return { text: `smooth ${by} ${end.text}`, at: end.at };
    }
    case "arc": {
      // Too small, the radius grows to reach the end: a half ellipse.
      const end = newPair(ctx, at, from, absolute, options);
      const r = scalar(null, "x", ctx);
      const radius = Math.hypot(at.x - from.x, at.y - from.y) / 2;
      return {
        text: `arc ${by} ${end.text} of ${write(r, radius, ctx, options)}`,
        at: end.at,
      };
    }
    default:
      return newLine(ctx, at, from, absolute, options);
  }
}

/** A handle on a segment: dragged, it adds a point there. */
function mid(ctx, k, a, b, writer, at = middle(a, b)) {
  if (Math.hypot(b.x - a.x, b.y - a.y) < 1) {
    return;
  }
  handle(
    ctx,
    `m${k}`,
    "mid",
    at.x,
    at.y,
    { x: true, y: true },
    { x: ctx.unit, y: ctx.unit },
    writer,
    // Once added, the drag goes on with the new point.
    { next: `p${k}` },
  );
}

/**
 * The new command goes before command `k`, which then goes on from its end,
 * where it was. Off their axis, hline and vline could not reach their end any
 * more: they become a line.
 */
function insertWriter(step, end, command) {
  const { ctx, fn, k, from, absolute, keep, separator } = step;
  const group = fn.groups[k + 1];
  return (target, options) => {
    const added = newCommand(ctx, ctx.add, from, target, absolute, options);
    if (["hline", "vline"].includes(command) && command !== ctx.add) {
      const rest = newLine(ctx, end, added.at, absolute, options);
      return [
        { ...span(group), insert: `${added.text}${separator}${rest.text}` },
      ];
    }
    return [
      { from: group[0].from, insert: `${added.text}${separator}` },
      ...keep(k)(added.at, options),
    ];
  };
}

/** A new point in the middle of a segment, drawn as its chord. */
function segmentMid(step, end, command) {
  mid(step.ctx, step.k, step.from, end, insertWriter(step, end, command));
}

/** close: the new point goes before it, back to the start of the path. */
function closeMid({ ctx, fn, separator }, k, from, to) {
  mid(ctx, k, from, to, (target, options) => [
    {
      from: fn.groups[k + 1][0].from,
      insert: `${newCommand(ctx, ctx.add, from, target, true, options).text}${separator}`,
    },
  ]);
}

/**
 * A curve, with a handle in its middle. Cut there by a curve, it gives 2 that
 * draw the same, each pulled by its share of the control points.
 */
function curveMid(step, end, controls) {
  const { ctx, fn, k, from, absolute, separator } = step;
  let halves;
  if (1 === controls.length) {
    const [c] = controls;
    const a = middle(from, c);
    const b = middle(c, end);
    halves = { at: middle(a, b), first: [a], second: [b] };
  } else {
    const [c1, c2] = controls;
    const a = middle(from, c1);
    const b = middle(c1, c2);
    const c = middle(c2, end);
    const ab = middle(a, b);
    const bc = middle(b, c);
    halves = { at: middle(ab, bc), first: [a, ab], second: [bc, c] };
  }
  const split = (target, options) => {
    const first = newCurve(ctx, from, target, halves.first, absolute, options);
    const second = newCurve(
      ctx,
      first.at,
      end,
      halves.second,
      absolute,
      options,
    );
    return [
      {
        ...span(fn.groups[k + 1]),
        insert: `${first.text}${separator}${second.text}`,
      },
    ];
  };
  const writer = ["curve", "cubic"].includes(ctx.add)
    ? split
    : insertWriter(step, end, "curve");
  mid(ctx, k, from, end, writer, halves.at);
}

/**
 * curve: the end point, then `with` and 1 or 2 control points; smooth: the
 * end point, and 1 control point or none.
 */
function curve(step, nodes, path, smooth) {
  const { ctx, k, from, absolute } = step;
  const at = nodes.findIndex((node) => isIdent(node, "with"));
  const end = endPoint(step, -1 === at ? nodes : nodes.slice(0, at));
  const controls = [];
  if (-1 !== at) {
    const args = nodes.slice(at + 1);
    const slash = args.findIndex((node) => "slash" === node.type);
    const parts =
      -1 === slash ? [args] : [args.slice(0, slash), args.slice(slash + 1)];
    parts.forEach((part, i) => {
      const control = controlPoint(ctx, part, absolute, { start: from, end });
      addPoint(ctx, `c${k}.${i}`, "control", control);
      controls.push(control);
    });
  }
  if (!smooth && controls.length > 0) {
    curveMid(step, end, controls);
  } else {
    segmentMid(step, end, smooth ? "smooth" : "curve");
  }
  const [c1, c2] = controls;
  if (smooth) {
    path.push(c1 ? ["S", c1.x, c1.y, end.x, end.y] : ["T", end.x, end.y]);
  } else if (c2) {
    path.push(["C", c1.x, c1.y, c2.x, c2.y, end.x, end.y]);
  } else {
    path.push(c1 ? ["Q", c1.x, c1.y, end.x, end.y] : ["L", end.x, end.y]);
  }
  // Each control point is tied to the ends it pulls on.
  const tie = (control, anchor) =>
    ctx.layout.lines.push([
      { x: control.x, y: control.y },
      { x: anchor.x, y: anchor.y },
    ]);
  if (smooth && c1) {
    tie(c1, end);
  } else if (c2) {
    tie(c1, from);
    tie(c2, end);
  } else if (c1) {
    tie(c1, from);
    tie(c1, end);
  }
  // From another start, the end and the control points drawn from the start
  // stay where they are.
  const fromStart = controls.filter((control) => control.fromStart);
  return {
    x: end.x,
    y: end.y,
    rebase: (base, options) => [
      ...end.rebase(base, options),
      ...fromStart.flatMap((control) => control.rebase(base, options)),
    ],
  };
}

/**
 * `<position>` from the box's origin when absolute, else a pair from the
 * start; `<x> <y> from start|end|origin` from what it names.
 */
function controlPoint(ctx, nodes, absolute, anchors) {
  const at = nodes.findIndex((node) => isIdent(node, "from"));
  if (-1 === at) {
    return {
      ...point(ctx, nodes, absolute, anchors.start),
      fromStart: !absolute,
    };
  }
  const name = nodes[at + 1]?.name;
  const anchor =
    "end" === name
      ? anchors.end
      : "origin" === name
        ? { x: 0, y: 0 }
        : anchors.start;
  return {
    ...point(ctx, nodes.slice(0, at), false, anchor),
    fromStart: anchor === anchors.start,
  };
}

/** arc: the end point, then `of` its radii, the sweep, the size, `rotate`. */
function arc(step, nodes, path) {
  const { ctx } = step;
  const words = nodes.findIndex((node) => isIdent(node, ...ARC_WORDS));
  const end = endPoint(step, -1 === words ? nodes : nodes.slice(0, words));
  const has = (name) => nodes.some((node) => isIdent(node, name));
  const after = (name) =>
    nodes.slice(nodes.findIndex((node) => isIdent(node, name)) + 1);
  const radii = has("of")
    ? after("of").filter((node) => "number" === node.type)
    : [];
  const rx = scalar(radii[0] ?? null, "x", ctx, 0).px;
  const ry = radii[1] ? scalar(radii[1], "y", ctx).px : rx;
  const angle = has("rotate") ? after("rotate")[0] : null;
  const rotate =
    "number" === angle?.type ? angle.value * (ANGLES[angle.unit] ?? NaN) : 0;
  path.push([
    "A",
    rx,
    ry,
    rotate,
    has("large") ? 1 : 0,
    has("cw") ? 1 : 0,
    end.x,
    end.y,
  ]);
  segmentMid(step, end, "arc");
  return end;
}
