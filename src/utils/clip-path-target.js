/**
 * Finds the element a clip-path applies to in the render, and measures its
 * reference box, so the clip-path tool draws its handles on it.
 */

/**
 * @typedef {{ style: number } | { selector: string }} Target the `style`
 *   attribute, by its rank in the code, or the selector of the rule
 */

const PSEUDO_ELEMENT = /::|:(?:before|after|first-line|first-letter)\b/i;

/**
 * What the declaration at `pos` styles.
 *
 * @param {string} code
 * @param {number} pos in a declaration's value
 * @returns {Target | null}
 */
export function targetAt(code, pos) {
  const before = code.slice(0, pos);
  const tag = /<[a-z][^<>]*$/i.exec(before);
  if (tag && /\sstyle\s*=/i.test(tag[0])) {
    const tags = before
      .slice(0, tag.index)
      .matchAll(/<[a-z][^>]*?\sstyle\s*=/gi);
    return { style: [...tags].length };
  }
  const style = [...before.matchAll(/<style\b[^>]*>/gi)].at(-1);
  if (!style) {
    return null;
  }
  const css = before
    .slice(style.index + style[0].length)
    .replace(/\/\*[\s\S]*?(?:\*\/|$)/g, " ");
  const selector = selectorOf(css);
  return null === selector ? null : { selector };
}

/**
 * The selector of the innermost rule, its nesting resolved: `&` stands for
 * the parent rule, a selector without one is a descendant of it, and `&` at
 * the root is `:root`. At-rules add nothing.
 */
function selectorOf(css) {
  const stack = [];
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if ("{" === char) {
      stack.push(css.slice(start, i).trim());
    } else if ("}" === char) {
      stack.pop();
    }
    if ("{};".includes(char)) {
      start = i + 1;
    }
  }
  const preludes = stack.filter((prelude) => !prelude.startsWith("@"));
  return 0 === preludes.length ? null : preludes.reduce(nest, null);
}

function nest(parent, prelude) {
  const scope = null === parent ? ":root" : `:is(${parent})`;
  return splitList(prelude)
    .map((part) =>
      part.includes("&")
        ? part.replaceAll("&", scope)
        : null === parent
          ? part
          : `${scope} ${part}`,
    )
    .join(",");
}

/** Splits a selector list on its commas, not those within parentheses. */
function splitList(selector) {
  const parts = [""];
  let depth = 0;
  for (const char of selector) {
    depth += "([".includes(char) ? 1 : ")]".includes(char) ? -1 : 0;
    if ("," === char && 0 === depth) {
      parts.push("");
    } else {
      parts[parts.length - 1] += char;
    }
  }
  return parts.map((part) => part.trim());
}

/**
 * @param {Document} doc the render
 * @param {Target} target
 * @returns {{ element: Element | null, reason?: string }} the first element
 *   the target styles that has a box, or why there is none
 */
export function findElement(doc, target) {
  if ("style" in target) {
    const element = doc.querySelectorAll("[style]")[target.style] ?? null;
    return element ? { element } : { element, reason: "element not found" };
  }
  if (PSEUDO_ELEMENT.test(target.selector)) {
    return { element: null, reason: "pseudo-element" };
  }
  let elements;
  try {
    elements = [...doc.querySelectorAll(target.selector)];
  } catch {
    return { element: null, reason: "element not found" };
  }
  // `* {…}` matches <head> first, which has no box.
  const element = elements.find((el) => el.getClientRects().length > 0);
  return element ? { element } : { element: null, reason: "element not found" };
}

/**
 * @typedef {object} Frame where to draw, in pixels of the render's viewport
 * @property {string} transform an SVG transform from the border box, its top
 *   left at 0 0, to the render: the element's place, its own transforms and
 *   those of its ancestors
 * @property {Matrix} matrix the same, as numbers
 * @property {{ x: number, y: number, width: number, height: number }} box
 *   the reference box, from the border box's top left
 * @property {number} fontSize
 * @property {number} rootFontSize
 */

/**
 * Measures the reference box of an element, and where it lands in the render.
 *
 * Without any transform on the way, its client rect is exact. Otherwise its
 * size comes from its offsets, and its rotations, scales and skews, its own as
 * its ancestors', are applied in turn; its client rect, the bounds of its
 * transformed border box, then tells where it lies, whatever moved it there.
 * 3D transforms are left out.
 *
 * @param {HTMLElement} element
 * @param {string | null} keyword the geometry box written in the value
 * @returns {Frame}
 */
export function measure(element, keyword) {
  const win = element.ownerDocument.defaultView;
  const style = win.getComputedStyle(element);
  const px = (name) => parseFloat(style.getPropertyValue(name)) || 0;
  const rootFontSize = parseFloat(
    win.getComputedStyle(element.ownerDocument.documentElement).fontSize,
  );

  // From the root down: an ancestor's transform applies after the element's.
  const chain = [];
  for (let el = element; el; el = el.parentElement) {
    chain.unshift(el === element ? style : win.getComputedStyle(el));
  }
  const linear = chain
    .map(ownLinear)
    .reduce((m, own) => (null === own ? m : multiply(m, own)), IDENTITY);

  const rect = element.getBoundingClientRect();
  let { width, height } = rect;
  let matrix = translation(rect.x, rect.y);
  if (!isIdentity(linear)) {
    ({ width, height } = sizeOf(element));
    const corners = [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ].map(([x, y]) => apply(linear, { x, y }));
    matrix = {
      ...linear,
      e: rect.x - Math.min(...corners.map(({ x }) => x)),
      f: rect.y - Math.min(...corners.map(({ y }) => y)),
    };
  }

  const sides = (prefix, suffix = "") =>
    ["top", "right", "bottom", "left"].map((side) =>
      px(`${prefix}-${side}${suffix}`),
    );
  const border = sides("border", "-width");
  const padding = sides("padding");
  // How far the reference box lies within the border box, on each side.
  const [top, right, bottom, left] = {
    "margin-box": sides("margin").map((margin) => -margin),
    "padding-box": border,
    "content-box": border.map((width, i) => width + padding[i]),
  }[keyword] ?? [0, 0, 0, 0];

  return {
    transform: svgMatrix(matrix),
    matrix,
    box: {
      x: left,
      y: top,
      width: width - left - right,
      height: height - top - bottom,
    },
    fontSize: parseFloat(style.fontSize),
    rootFontSize,
  };
}

/** The whole render, for a target the tool cannot find. */
export function viewportFrame(width, height) {
  return {
    transform: "translate(0 0)",
    matrix: IDENTITY,
    box: { x: 0, y: 0, width, height },
    fontSize: 16,
    rootFontSize: 16,
  };
}

/**
 * Where a point of the reference box lands in the render.
 *
 * @param {Frame} frame
 * @param {{ x: number, y: number }} point
 */
export function toRender({ matrix, box }, { x, y }) {
  return apply(matrix, { x: x + box.x, y: y + box.y });
}

/**
 * Units that resolve against a container, which a probe at the root of the
 * render would not find.
 */
const CONTAINER_UNIT = /^cq/;

/** The last units measured, kept while nothing they depend on changes. */
let measured = { element: null, key: "", sizes: {} };

/**
 * How many pixels one of each unit is, on the element: `lh`, `ch`, `ex`,
 * `cap`, `vi`… resolved by the render itself, on a probe with the element's
 * font, added and removed at once.
 *
 * Measured again only when the element, its font or the render's size
 * changes: the DOM tool rebuilds its outlines on any change of the render.
 *
 * @param {Element} element
 * @param {string[]} units lowercase
 * @returns {Record<string, number>} the units the render knows
 */
export function unitSizes(element, units) {
  const wanted = [...new Set(units)].filter(
    (unit) => !CONTAINER_UNIT.test(unit),
  );
  if (0 === wanted.length) {
    return {};
  }
  const doc = element.ownerDocument;
  const win = doc.defaultView;
  const style = win.getComputedStyle(element);
  const font = FONT.map((name) => style.getPropertyValue(name));
  const key = [...font, win.innerWidth, win.innerHeight, ...wanted].join("|");
  if (measured.element === element && measured.key === key) {
    return measured.sizes;
  }

  const probe = doc.createElement("cbt-probe");
  probe.style.cssText = "position:absolute;visibility:hidden;display:block";
  FONT.forEach((name, i) => probe.style.setProperty(name, font[i]));
  doc.documentElement.append(probe);
  const sizes = {};
  try {
    const computed = win.getComputedStyle(probe);
    for (const unit of wanted) {
      probe.style.marginLeft = "";
      // Large, to keep the decimals the render rounds off.
      probe.style.marginLeft = `100${unit}`;
      const size = parseFloat(computed.marginLeft) / 100;
      // A unit the render does not know leaves the margin unset.
      if ("" !== probe.style.marginLeft && Number.isFinite(size)) {
        sizes[unit] = size;
      }
    }
  } finally {
    probe.remove();
  }
  measured = { element, key, sizes };
  return sizes;
}

/** What the font-relative units of an element depend on. */
const FONT = [
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "font-stretch",
  "font-variant",
  "font-size-adjust",
  "line-height",
  "writing-mode",
  "text-orientation",
];

// ——— Transforms ———

/**
 * A 2D affine transform, as SVG and CSS write it: x' = a x + c y + e, and
 * y' = b x + d y + f.
 *
 * @typedef {{ a: number, b: number, c: number, d: number, e: number, f: number }} Matrix
 */

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** @returns {Matrix} */
function translation(x, y) {
  return { ...IDENTITY, e: x, f: y };
}

/** `m` applied after `n`. @returns {Matrix} */
function multiply(m, n) {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

function apply(m, { x, y }) {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

/** The size of the border box, before any transform. */
function sizeOf(el) {
  if (undefined !== el.offsetWidth) {
    return { width: el.offsetWidth, height: el.offsetHeight };
  }
  // An SVG element.
  const { width, height } = el.getBoundingClientRect();
  return { width, height };
}

/** @param {Matrix} m */
function svgMatrix(m) {
  const n = (value) => Number(value.toFixed(4)) + 0;
  const { a, b, c, d, e, f } = m;
  return isIdentity(m)
    ? `translate(${n(e)} ${n(f)})`
    : `matrix(${[a, b, c, d, e, f].map(n).join(" ")})`;
}

const ANGLES = { deg: 1, rad: 180 / Math.PI, grad: 0.9, turn: 360 };

/**
 * The rotations, scales and skews of an element's own transforms, in the
 * order CSS applies them. What moves it, its translations and its transform
 * origin, is left to its client rect, and 3D transforms are left out.
 *
 * @returns {Matrix | null} `null` when it has none
 */
function ownLinear(style) {
  const value = (name) => style.getPropertyValue(name).trim();
  // Transforms do not apply to inline boxes.
  if (["inline", "contents"].includes(value("display"))) {
    return null;
  }
  const parts = [];
  const rotate = value("rotate");
  // `45deg`, `z 45deg` or `0 0 1 45deg`: around z only.
  const angle =
    /^(?:z\s+|0\s+0\s+1\s+)?(-?[\d.]+(?:e-?\d+)?)(deg|rad|grad|turn)$/.exec(
      rotate,
    );
  if (angle) {
    const rad = (parseFloat(angle[1]) * ANGLES[angle[2]] * Math.PI) / 180;
    const [cos, sin] = [Math.cos(rad), Math.sin(rad)];
    parts.push({ a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 });
  }
  const scale = value("scale");
  if (isSet(scale)) {
    const [sx, sy = sx] = scale.split(/\s+/).map(parseFloat);
    parts.push({ ...IDENTITY, a: sx, d: sy });
  }
  const matrix = /^matrix\(([^)]*)\)$/.exec(value("transform"));
  if (matrix) {
    const [a, b, c, d] = matrix[1].split(",").map(parseFloat);
    parts.push({ a, b, c, d, e: 0, f: 0 });
  }
  return 0 === parts.length
    ? null
    : parts.reduce((m, part) => multiply(m, part), IDENTITY);
}

function isIdentity({ a, b, c, d }) {
  return 1 === a && 0 === b && 0 === c && 1 === d;
}

function isSet(value) {
  return "" !== value && "none" !== value;
}
