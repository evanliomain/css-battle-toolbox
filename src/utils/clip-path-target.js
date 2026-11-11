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
 * @property {number} x the border box's left
 * @property {number} y its top
 * @property {string} transform the element's own transform, as an SVG one,
 *   around its border box's top left
 * @property {{ x: number, y: number, width: number, height: number }} box
 *   the reference box, from the border box's top left
 * @property {number} fontSize
 * @property {number} rootFontSize
 */

/**
 * Measures the reference box of an element.
 *
 * Without any transform on the way, its client rect is exact. Otherwise its
 * layout box comes from the offsets, and its own transform is applied on top;
 * the transforms of its ancestors are left out.
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

  let x;
  let y;
  let width;
  let height;
  if (transformed(element, win) && undefined !== element.offsetParent) {
    ({ x, y } = offsets(element));
    width = element.offsetWidth;
    height = element.offsetHeight;
  } else {
    ({ x, y, width, height } = element.getBoundingClientRect());
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
    x,
    y,
    transform: svgTransform(style),
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
    x: 0,
    y: 0,
    transform: "",
    box: { x: 0, y: 0, width, height },
    fontSize: 16,
    rootFontSize: 16,
  };
}

const TRANSFORMS = ["transform", "translate", "rotate", "scale"];

/** Whether the element or one of its ancestors is transformed. */
function transformed(element, win) {
  for (let el = element; el; el = el.parentElement) {
    const style = win.getComputedStyle(el);
    if (TRANSFORMS.some((name) => isSet(style.getPropertyValue(name)))) {
      return true;
    }
  }
  return false;
}

function isSet(value) {
  return "" !== value && "none" !== value;
}

/** The border box's top left, from its offsets, borders included. */
function offsets(element) {
  let x = element.offsetLeft;
  let y = element.offsetTop;
  for (let el = element.offsetParent; el; el = el.offsetParent) {
    x += el.offsetLeft + el.clientLeft;
    y += el.offsetTop + el.clientTop;
  }
  return { x, y };
}

/**
 * The element's own transforms, in the order CSS applies them, around its
 * transform origin. 3D ones are left out.
 */
function svgTransform(style) {
  const value = (name) => style.getPropertyValue(name).trim();
  const parts = [];
  const translate = value("translate");
  if (isSet(translate)) {
    const [tx, ty = "0"] = translate.split(/\s+/);
    parts.push(`translate(${parseFloat(tx)} ${parseFloat(ty)})`);
  }
  const rotate = value("rotate");
  if (isSet(rotate) && /^-?[\d.]+deg$/.test(rotate)) {
    parts.push(`rotate(${parseFloat(rotate)})`);
  }
  const scale = value("scale");
  if (isSet(scale)) {
    const [sx, sy = sx] = scale.split(/\s+/);
    parts.push(`scale(${parseFloat(sx)} ${parseFloat(sy)})`);
  }
  const matrix = /^matrix\(([^)]*)\)$/.exec(value("transform"));
  if (matrix) {
    parts.push(`matrix(${matrix[1].split(",").map(parseFloat).join(" ")})`);
  }
  if (0 === parts.length) {
    return "";
  }
  const [ox, oy] = value("transform-origin").split(/\s+/).map(parseFloat);
  return `translate(${ox} ${oy}) ${parts.join(" ")} translate(${-ox} ${-oy})`;
}
