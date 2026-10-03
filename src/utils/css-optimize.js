/**
 * Shortens the CSS of some cssbattle code without changing its rendering:
 * folds `calc()` on constants, drops the units quirks mode does not need, the
 * values a property has by default, the quotes an identifier does not need…
 *
 * Runs before the minifier's whitespace pass. A declaration it does not change
 * comes out as it came in. One it changes comes out spaced, the way prettify
 * writes it, for the minifier to compact.
 */

const LENGTH_UNITS = new Set(
  `px em rem ex rex ch rch cap rcap ic ric lh rlh vw vh vi vb vmin vmax
  svw svh svi svb svmin svmax lvw lvh lvi lvb lvmin lvmax
  dvw dvh dvi dvb dvmin dvmax cqw cqh cqi cqb cqmin cqmax
  cm mm q in pt pc`.split(/\s+/),
);

// A unitless 0 is a number in there, not a length: `calc(0 + 1em)` is invalid.
export const MATH = new Set(
  `calc -webkit-calc min max clamp round mod rem abs sign sin cos tan asin acos
  atan atan2 pow sqrt hypot log exp`.split(/\s+/),
);

// The properties quirks mode reads a unitless number as px for.
const QUIRKY = new Set(
  `margin margin-top margin-right margin-bottom margin-left
  padding padding-top padding-right padding-bottom padding-left
  width height min-width min-height max-width max-height
  top right bottom left
  border-width border-top-width border-right-width border-bottom-width
  border-left-width border-spacing font-size letter-spacing word-spacing
  text-indent vertical-align background-position background-position-x
  background-position-y clip`.split(/\s+/),
);

// They take an <integer>, which neither `1e4` nor `1.5` are.
const INTEGER = new Set(
  `z-index order column-count orphans widows -webkit-line-clamp line-clamp
  grid-row grid-row-start grid-row-end grid-column grid-column-start
  grid-column-end grid-area counter-increment counter-reset counter-set`.split(
    /\s+/,
  ),
);

const SIDES = new Set(
  `margin padding inset border-width border-style border-color scroll-margin
  scroll-padding`.split(/\s+/),
);

// The units a number can be written in an other way with: hashless colors like
// 10000a are dimensions too, and 1e4a is no color.
const UNITS = new Set([
  ...LENGTH_UNITS,
  ..."% deg grad rad turn s ms hz khz dpi dpcm dppx x fr".split(" "),
]);

// The properties quirks mode reads a hex color without its # in.
const HASHLESS = new Set(
  `color background-color border-color border-top-color border-right-color
  border-bottom-color border-left-color`.split(/\s+/),
);

const BORDERS = new Set(
  "border border-top border-right border-bottom border-left outline".split(" "),
);

// Turns in one of each unit; rad is left out, no conversion to it is exact.
const ANGLES = { deg: 360, grad: 400, turn: 1 };

// Names a font family can only have quoted.
const RESERVED_FAMILIES = new Set(
  `serif sans-serif monospace cursive fantasy system-ui ui-serif ui-sans-serif
  ui-monospace ui-rounded math emoji fangsong generic inherit initial unset
  revert revert-layer default`.split(/\s+/),
);

const IDENT = /^(?:--|-?[a-zA-Z_\u0080-\uffff])[\w\u0080-\uffff-]*$/;
const FAMILY_WORD = /^-?[a-zA-Z_\u0080-\uffff][\w\u0080-\uffff-]*$/;

/**
 * @param {string} code some cssbattle code
 * @returns {string} the code, its `<style>` blocks and `style` attributes shortened
 */
export function optimizeCss(code) {
  const STYLE = /(<style(?:\s[^>]*)?>)([\s\S]*?)(?=<\/style>|$)/gi;
  let out = "";
  let last = 0;
  for (const match of code.matchAll(STYLE)) {
    out +=
      styleAttributes(code.slice(last, match.index)) +
      match[1] +
      optimizeSheet(match[2]);
    last = match.index + match[0].length;
  }
  return out + styleAttributes(code.slice(last));
}

function styleAttributes(html) {
  return html.replace(
    /(\sstyle\s*=\s*)(["'])([\s\S]*?)\2/gi,
    (_, attribute, quote, css) =>
      attribute + quote + optimizeSheet(css) + quote,
  );
}

function optimizeSheet(css) {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const block = optimizeBlock(css, i);
    out += block.out;
    i = block.i;
    // A `}` closing nothing
    if (block.closed) {
      out += "}";
    }
  }
  return out;
}

/**
 * The rules and declarations from `i` up to the `}` closing them, or the end.
 */
function optimizeBlock(css, i) {
  let out = "";
  while (i < css.length) {
    const { end, term } = readItem(css, i);
    const text = css.slice(i, end);
    if ("{" === term) {
      const inner = optimizeBlock(css, end + 1);
      // An empty rule styles nothing
      if ("" !== inner.out.trim()) {
        out +=
          optimizeSelector(text) + "{" + inner.out + (inner.closed ? "}" : "");
      }
      i = inner.i;
      continue;
    }
    // Empty items are the extra `;` of `;;`
    if ("" !== text.trim()) {
      out += optimizeDeclaration(text) + (";" === term ? ";" : "");
    }
    if ("}" === term) {
      return { out, i: end + 1, closed: true };
    }
    i = end + 1;
  }
  return { out, i, closed: false };
}

/**
 * Where the item starting at `i` ends: at a `;`, `{` or `}` outside strings,
 * comments and brackets, or at the end of the code.
 */
function readItem(css, i) {
  let depth = 0;
  for (; i < css.length; i++) {
    const char = css[i];
    if ('"' === char || "'" === char) {
      i = stringEnd(css, i);
    } else if ("/" === char && "*" === css[i + 1]) {
      const end = css.indexOf("*/", i + 2);
      i = -1 === end ? css.length : end + 1;
    } else if ("(" === char || "[" === char) {
      depth++;
    } else if ((")" === char || "]" === char) && depth > 0) {
      depth--;
    } else if (0 === depth && ("{" === char || "}" === char || ";" === char)) {
      return { end: i, term: char };
    }
  }
  return { end: css.length, term: "" };
}

/** The index of the quote closing the string opened at `i`, or the end. */
function stringEnd(text, i) {
  const quote = text[i];
  for (i++; i < text.length; i++) {
    if ("\\" === text[i]) {
      i++;
    } else if (quote === text[i]) {
      return i;
    }
  }
  return text.length;
}

function optimizeSelector(selector) {
  return selector
    .replace(
      /\[\s*([-\w]+)\s*([~|^$*]?=)\s*(["'])([^"'\\]*)\3\s*\]/g,
      (all, name, operator, _, value) =>
        IDENT.test(value) ? `[${name}${operator}${value}]` : all,
    )
    .replace(
      /(:nth-(?:last-)?(?:child|of-type)\()\s*2n\s*\+\s*1\s*\)/gi,
      (_, nth) => `${nth}odd)`,
    )
    .replace(
      /(:nth-(?:last-)?(?:child|of-type)\()\s*even\s*\)/gi,
      (_, nth) => `${nth}2n)`,
    );
}

function optimizeDeclaration(text) {
  const declaration = /^(\s*)([-\w]+)\s*:([\s\S]*)$/.exec(text);
  // Custom properties have no type to know what is safe to change, and a
  // comment is no token.
  if (
    null === declaration ||
    declaration[2].startsWith("--") ||
    text.includes("/*")
  ) {
    return text;
  }
  const [, lead, property, rest] = declaration;
  const important = /^([\s\S]*?)(\s*!\s*important)\s*$/i.exec(rest);
  const nodes = parseValue(important ? important[1] : rest);
  if (null === nodes) {
    return text;
  }
  const ctx = {
    property: property.toLowerCase(),
    changed: null !== important && "!important" !== important[2],
  };
  const value = optimizeValue(nodes, ctx);
  if (!ctx.changed) {
    return text;
  }
  return `${lead}${property}: ${print(value, false)}${important ? "!important" : ""}`;
}

// ---------------------------------------------------------------- Tokens

/**
 * @typedef {object} Node
 * @property {"num"|"ident"|"hash"|"str"|"op"|"fn"|"paren"} type
 * @property {string} [raw] the text of an ident, hash, string or operator
 * @property {boolean} [neg] a number: its sign
 * @property {string} [digits] a number: its significant digits, `""` for 0
 * @property {number} [exp] a number: the power of ten its digits are times
 * @property {boolean} [sci] a number: written like `1e4`
 * @property {string} [unit] a number: its unit, `%` or `""`
 * @property {string} [name] a function: its name
 * @property {Node[]} [children] a function or a parenthesis: its content
 * @property {boolean} [closed] a function or a parenthesis: closed by `)`
 * @property {boolean} [space] whitespace came before it
 * @property {number} [id] its place among its siblings, only on parsed nodes
 */

const NUMBER = /^[+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?/;
const UNIT = /^(?:%|(?:--|-?[a-zA-Z_\u0080-\uffff])[\w\u0080-\uffff-]*)/;
const WORD = /^(?:--|-?[a-zA-Z_\u0080-\uffff])[\w\u0080-\uffff-]*/;

/**
 * @param {string} value a declaration value
 * @returns {Node[] | null} its nodes, `null` for anything not understood
 */
function parseValue(value) {
  const root = { children: [] };
  const stack = [root];
  let space = false;
  let i = 0;
  const push = (node) => {
    const siblings = stack.at(-1).children;
    siblings.push({ ...node, space, id: siblings.length });
    space = false;
  };
  while (i < value.length) {
    const rest = value.slice(i);
    const char = value[i];
    let match;
    // Not \s: a non breaking space is no CSS whitespace
    if (/[ \t\n\r\f]/.test(char)) {
      space = true;
      i++;
    } else if ('"' === char || "'" === char) {
      const end = stringEnd(value, i);
      push({ type: "str", raw: value.slice(i, end + 1) });
      i = end + 1;
    } else if ((match = NUMBER.exec(rest))) {
      const unit = UNIT.exec(rest.slice(match[0].length))?.[0] ?? "";
      push({
        type: "num",
        ...parseNumber(match[0]),
        sci: /e/i.test(match[0]),
        unit,
        raw: match[0],
      });
      i += match[0].length + unit.length;
    } else if ((match = WORD.exec(rest))) {
      i += match[0].length;
      if ("(" === value[i]) {
        // An unquoted url() is not made of tokens
        if ("url" === match[0].toLowerCase()) {
          return null;
        }
        push({ type: "fn", name: match[0], children: [], closed: false });
        stack.push(stack.at(-1).children.at(-1));
        i++;
      } else {
        push({ type: "ident", raw: match[0] });
      }
    } else if ((match = /^#[\w\u0080-\uffff-]+/.exec(rest))) {
      push({ type: "hash", raw: match[0] });
      i += match[0].length;
    } else if ("(" === char) {
      push({ type: "paren", children: [], closed: false });
      stack.push(stack.at(-1).children.at(-1));
      i++;
    } else if (")" === char && stack.length > 1) {
      stack.pop().closed = true;
      space = false;
      i++;
    } else if (",/*+-".includes(char)) {
      push({ type: "op", raw: char });
      i++;
    } else {
      return null;
    }
  }
  return root.children;
}

/** `"-0.050"` → `{ neg: true, digits: "5", exp: -2 }`, exactly. */
function parseNumber(text) {
  const [, sign, int, frac = "", e = "0"] =
    /^([+-]?)(\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
  let digits = (int + frac).replace(/^0+/, "");
  let exp = Number(e) - frac.length;
  const zeros = /0*$/.exec(digits)[0].length;
  digits = digits.slice(0, digits.length - zeros);
  exp = "" === digits ? 0 : exp + zeros;
  return { neg: "-" === sign && "" !== digits, digits, exp };
}

function plain({ digits, exp }, leadingZero) {
  if ("" === digits) {
    return "0";
  }
  if (exp >= 0) {
    return digits + "0".repeat(exp);
  }
  const point = digits.length + exp;
  if (point > 0) {
    return `${digits.slice(0, point)}.${digits.slice(point)}`;
  }
  return `${leadingZero ? "0" : ""}.${"0".repeat(-point)}${digits}`;
}

const scientific = ({ digits, exp }) => `${digits}e${exp}`;

/** The number as the minifier would write it, `0.5` after a space. */
function formatNumber(node, leadingZero) {
  return (
    (node.neg ? "-" : "") +
    (node.sci ? scientific(node) : plain(node, leadingZero)) +
    node.unit
  );
}

const toFloat = (node) =>
  Number(`${node.neg ? "-" : ""}${node.digits || 0}e${node.exp}`);

/** A computed value as a number node, `null` if it is not a short decimal. */
function fromFloat(value, unit) {
  const rounded = Number(value.toFixed(6));
  if (Math.abs(rounded - value) > 1e-9) {
    return null;
  }
  const number = parseNumber(String(Math.abs(rounded)));
  const neg = rounded < 0 && "" !== number.digits;
  const raw = (neg ? "-" : "") + plain(number, true);
  return { type: "num", ...number, neg, sci: false, unit, raw };
}

// ---------------------------------------------------------------- Printing

/**
 * Prints nodes spaced, but for the ones that came glued and still are next to
 * each other: those were already a valid tokenization.
 */
function print(nodes, inFunction) {
  let out = "";
  let previous = null;
  for (const node of nodes) {
    let separator = "";
    if (null !== previous) {
      if (
        isOp(node, ",") ||
        (inFunction && (isOp(node, "*") || isOp(previous, "*")))
      ) {
        separator = "";
      } else if (isOp(previous, ",") || isOp(node) || isOp(previous)) {
        separator = " ";
      } else {
        const glued =
          undefined !== node.id &&
          undefined !== previous.id &&
          node.id === previous.id + 1 &&
          !node.space;
        separator = glued ? "" : " ";
      }
    }
    out +=
      separator +
      printNode(node, " " === separator || (null === previous && !inFunction));
    previous = node;
  }
  return out;
}

function printNode(node, afterSpace) {
  switch (node.type) {
    case "num":
      // A glued .0 must stay one: .5.0 is not .50
      if ("" === node.digits && !afterSpace && /^[+-]?\./.test(node.raw)) {
        return `.0${node.unit}`;
      }
      // After a space, the minifier turns `0 0.5` into `.0.5`
      return formatNumber(node, afterSpace);
    case "fn":
      return `${node.name}(${print(node.children, true)}${node.closed ? ")" : ""}`;
    case "paren":
      return `(${print(node.children, true)}${node.closed ? ")" : ""}`;
    default:
      return node.raw;
  }
}

/** What tells two values apart. */
function key(node) {
  switch (node.type) {
    case "num":
      return formatNumber({ ...node, unit: node.unit.toLowerCase() }, false);
    case "fn":
    case "paren":
      return `${node.name ?? ""}(${node.children.map(key).join(" ")})`;
    default:
      return node.raw.toLowerCase();
  }
}

const isOp = (node, raw) =>
  "op" === node?.type && (undefined === raw || raw === node.raw);
const isIdent = (node, ...names) =>
  "ident" === node?.type && names.includes(node.raw.toLowerCase());
const isZero = (node) => "num" === node?.type && "" === node.digits;
const zero = () => ({
  type: "num",
  neg: false,
  digits: "",
  exp: 0,
  sci: false,
  unit: "",
  raw: "0",
});

function hasVar(nodes) {
  return nodes.some(
    (node) =>
      ("fn" === node.type && /^(var|env|attr)$/i.test(node.name)) ||
      (node.children && hasVar(node.children)),
  );
}

/** Splits nodes on a top level operator, `,` by default. */
function split(nodes, raw = ",") {
  const groups = [[]];
  for (const node of nodes) {
    if (isOp(node, raw)) {
      groups.push([]);
    } else {
      groups.at(-1).push(node);
    }
  }
  return groups;
}

function join(groups, raw = ",") {
  return groups.flatMap((group, i) =>
    0 === i ? group : [{ type: "op", raw }, ...group],
  );
}

// ---------------------------------------------------------------- Rules

function optimizeValue(nodes, ctx) {
  let value = walk(nodes, ctx, { depth: 0, math: false, rect: false });
  value = byProperty(value, ctx);
  return value;
}

/** The rules every node of the value follows, wherever it is. */
function walk(nodes, ctx, where) {
  return nodes.map((node) => {
    if ("fn" === node.type || "paren" === node.type) {
      const name = node.name?.toLowerCase();
      const children = walk(node.children, ctx, {
        depth: where.depth + 1,
        math: where.math || MATH.has(name),
        rect: "clip" === ctx.property && "rect" === name,
      });
      const result = fn({ ...node, children }, ctx);
      // A folded calc() is a number like the others
      return "num" === result.type ? number(result, ctx, where) : result;
    }
    if ("num" === node.type) {
      return number(node, ctx, where);
    }
    return node;
  });
}

function fn(node, ctx) {
  const name = node.name?.toLowerCase();
  if ("calc" === name || "-webkit-calc" === name) {
    const folded = fold(node, ctx);
    if (null !== folded) {
      return folded;
    }
  }
  // calc(2 * 3px) → calc(2*3px)
  if (
    node.children.some(
      (child, i) =>
        isOp(child, "*") && (child.space || node.children[i + 1]?.space),
    )
  ) {
    ctx.changed = true;
  }
  if (hasVar(node.children)) {
    return node;
  }
  const args = split(node.children);
  // translate(10px, 0) → translate(10px)
  if (
    "translate" === name &&
    2 === args.length &&
    1 === args[1].length &&
    isZero(args[1][0])
  ) {
    ctx.changed = true;
    return { ...node, children: args[0] };
  }
  // scale(2, 2) → scale(2)
  if (
    "scale" === name &&
    2 === args.length &&
    args[0].map(key).join() === args[1].map(key).join()
  ) {
    ctx.changed = true;
    return { ...node, children: args[0] };
  }
  return node;
}

/** calc(100px - 10px) → 90px, when it only holds constants. */
function fold(node, ctx) {
  let result;
  try {
    result = evaluate(node.children);
  } catch {
    return null;
  }
  // A negative result could be out of range: calc() clamps, a number does not.
  if (result.value < 0) {
    return null;
  }
  if (
    INTEGER.has(ctx.property) &&
    "" === result.unit &&
    !Number.isInteger(result.value)
  ) {
    return null;
  }
  const folded = fromFloat(result.value, result.unit);
  if (null === folded) {
    return null;
  }
  ctx.changed = true;
  return folded;
}

/** Evaluates `+ - * /` on numbers, throws on anything else. */
function evaluate(nodes) {
  let i = 0;
  const primary = () => {
    const node = nodes[i++];
    if ("num" === node?.type) {
      return { value: toFloat(node), unit: node.unit };
    }
    if ("paren" === node?.type || /^(-webkit-)?calc$/i.test(node?.name ?? "")) {
      return evaluate(node.children);
    }
    throw new Error("Not a constant");
  };
  const product = () => {
    let left = primary();
    while (isOp(nodes[i], "*") || isOp(nodes[i], "/")) {
      const operator = nodes[i++].raw;
      const right = primary();
      if ("*" === operator && "" === left.unit) {
        left = { value: left.value * right.value, unit: right.unit };
      } else if ("" === right.unit && ("*" === operator || 0 !== right.value)) {
        left = {
          value:
            "*" === operator
              ? left.value * right.value
              : left.value / right.value,
          unit: left.unit,
        };
      } else {
        throw new Error("Not a constant");
      }
    }
    return left;
  };
  let result = product();
  while (isOp(nodes[i], "+") || isOp(nodes[i], "-")) {
    const sign = "+" === nodes[i++].raw ? 1 : -1;
    const right = product();
    if (result.unit.toLowerCase() !== right.unit.toLowerCase()) {
      throw new Error("Not a constant");
    }
    result = { value: result.value + sign * right.value, unit: result.unit };
  }
  if (i !== nodes.length) {
    throw new Error("Not a constant");
  }
  return result;
}

function number(node, ctx, where) {
  const unit = node.unit.toLowerCase();
  // Hashless colors are no numbers: 001122 is not 1122
  if (
    ("" !== unit && !UNITS.has(unit)) ||
    (0 === where.depth && HASHLESS.has(ctx.property))
  ) {
    return node;
  }
  let result = { ...node };
  let quirky = false;
  // 0px → 0, but in flex a unitless 0 is a flex-shrink, not a flex-basis
  if (
    "" === node.digits &&
    LENGTH_UNITS.has(unit) &&
    !where.math &&
    "flex" !== ctx.property
  ) {
    result.unit = "";
  } else if (
    "px" === unit &&
    ((0 === where.depth && QUIRKY.has(ctx.property)) ||
      (1 === where.depth && where.rect))
  ) {
    // Quirks mode reads 10 as 10px
    result.unit = "";
    quirky = true;
  } else if (unit in ANGLES) {
    result = shortestAngle(result, unit);
  }
  // 1e4 is no <integer>, keep the exponent for the values that are no integer
  const allowExp = "" !== result.unit || result.exp < 0 || quirky || node.sci;
  result.sci =
    allowExp && scientific(result).length < plain(result, false).length;
  const changed =
    result.unit !== node.unit ||
    result.digits !== node.digits ||
    result.exp !== node.exp ||
    result.sci !== node.sci ||
    // +5, -0, 01
    /^\+|^-0*\.?0*(?:e|$)|^[+-]?0\d/i.test(node.raw);
  if (!changed) {
    return node;
  }
  ctx.changed = true;
  const { id, ...fresh } = result;
  return fresh;
}

/** 360deg → 1turn, when an other unit says it exactly and shorter. */
function shortestAngle(node, unit) {
  const turns = toFloat(node) / ANGLES[unit];
  let best = node;
  let length = formatNumber(node, false).length;
  for (const [other, perTurn] of Object.entries(ANGLES)) {
    const candidate = fromFloat(turns * perTurn, other);
    if (null !== candidate && formatNumber(candidate, false).length < length) {
      best = candidate;
      length = formatNumber(candidate, false).length;
    }
  }
  return best;
}

/** The rules of a property, on the top level nodes of its value. */
function byProperty(nodes, ctx) {
  const { property } = ctx;
  const change = (value) => {
    ctx.changed = true;
    return value;
  };
  const before = nodes.map(key).join(" ");
  let value = nodes;

  if (SIDES.has(property) && !hasVar(value)) {
    value = sides(value);
  } else if ("border-radius" === property && !hasVar(value)) {
    value = join(split(value, "/").map(sides), "/");
  } else if ("translate" === property && !hasVar(value)) {
    // translate: 10px 0 0 → translate: 10px
    while (value.length > 1 && value.length <= 3 && isZero(value.at(-1))) {
      value = value.slice(0, -1);
    }
  } else if ("scale" === property && !hasVar(value)) {
    if (3 === value.length && "1" === key(value[2])) {
      value = value.slice(0, 2);
    }
    if (2 === value.length && key(value[0]) === key(value[1])) {
      value = value.slice(0, 1);
    }
  } else if ("font-weight" === property) {
    if (1 === value.length && isIdent(value[0], "bold")) {
      value = [{ ...zero(), digits: "7", exp: 2, raw: "700" }];
    } else if (1 === value.length && isIdent(value[0], "normal")) {
      value = [{ ...zero(), digits: "4", exp: 2, raw: "400" }];
    }
  } else if ("font" === property) {
    value = font(value);
  } else if ("font-family" === property) {
    value = join(
      split(value).map((family) =>
        1 === family.length ? (unquote(family[0]) ?? family) : family,
      ),
    );
  } else if ("background" === property) {
    value = join(split(value).map(backgroundLayer));
  } else if ("box-shadow" === property) {
    value = join(split(value).map(withoutCurrentColor));
  }
  // After the sides, border-color has both
  if (HASHLESS.has(property)) {
    value = value.map(hashless);
  }
  if (BORDERS.has(property)) {
    // border: none → border: 0, but outline: 0 would compute an other width
    if (
      "outline" !== property &&
      1 === value.length &&
      isIdent(value[0], "none")
    ) {
      value = [zero()];
    } else {
      value = withoutCurrentColor(value);
    }
  }
  return value.map(key).join(" ") === before && value.length === nodes.length
    ? nodes
    : change(value);
}

/** 1 2 3 2 → 1 2 3, 1 2 1 → 1 2, 1 1 → 1 */
function sides(nodes) {
  if (
    nodes.length < 2 ||
    nodes.length > 4 ||
    nodes.some((node) => isOp(node))
  ) {
    return nodes;
  }
  let value = nodes;
  if (4 === value.length && key(value[3]) === key(value[1])) {
    value = value.slice(0, 3);
  }
  if (3 === value.length && key(value[2]) === key(value[0])) {
    value = value.slice(0, 2);
  }
  if (2 === value.length && key(value[1]) === key(value[0])) {
    value = value.slice(0, 1);
  }
  return value;
}

/**
 * #84271c → 84271c, that quirks mode reads as a color. Not the colors it reads
 * otherwise: 4 or 8 digits, 3 digits starting with a digit, that it pads with
 * zeros as a number (1ea is #0001ea), and exponents (1e0 is the number 1).
 */
function hashless(node) {
  if ("hash" !== node.type) {
    return node;
  }
  const hex = node.raw.slice(1);
  if (!/^(?:[\da-f]{6}|[a-f][\da-f]{2})$/i.test(hex) || /^\d+e\d/i.test(hex)) {
    return node;
  }
  return { type: "ident", raw: hex };
}

/** currentColor is the default color of borders, outlines and shadows. */
function withoutCurrentColor(nodes) {
  const value = nodes.filter((node) => !isIdent(node, "currentcolor"));
  return value.length > 0 ? value : nodes;
}

/** Drops the initial values of a background layer. */
function backgroundLayer(nodes) {
  let value = nodes.filter(
    (node) => !isIdent(node, "none", "repeat", "scroll"),
  );
  const out = [];
  for (let i = 0; i < value.length; i++) {
    const [a, b, next] = [value[i], value[i + 1], value[i + 2]];
    const origin =
      (isZero(a) && isZero(b)) ||
      (isIdent(a, "left") && isIdent(b, "top")) ||
      (isIdent(a, "top") && isIdent(b, "left"));
    // A position followed by a size stays, the size needs it
    if (origin && !isOp(next, "/")) {
      i++;
    } else if (isIdent(a, "padding-box") && isIdent(b, "border-box")) {
      i++;
    } else {
      out.push(a);
    }
  }
  value = out;
  return value.length > 0 ? value : [zero()];
}

function font(nodes) {
  const size = nodes.findIndex((node) => "num" === node.type);
  if (-1 === size) {
    return nodes;
  }
  return nodes.flatMap((node, i) => {
    // Before the size, bold can only be the weight
    if (i < size && isIdent(node, "bold")) {
      return [{ ...zero(), digits: "7", exp: 2, raw: "700" }];
    }
    if (i > size && "str" === node.type) {
      return unquote(node) ?? [node];
    }
    return [node];
  });
}

/** "Times New Roman" → Times New Roman, `null` when the quotes are needed. */
function unquote(node) {
  if ("str" !== node.type || !/^(["'])[^"'\\]*\1$/.test(node.raw)) {
    return null;
  }
  const words = node.raw.slice(1, -1).trim().split(/\s+/);
  if (
    words.some(
      (word) =>
        !FAMILY_WORD.test(word) || RESERVED_FAMILIES.has(word.toLowerCase()),
    )
  ) {
    return null;
  }
  return words.map((raw) => ({ type: "ident", raw }));
}
