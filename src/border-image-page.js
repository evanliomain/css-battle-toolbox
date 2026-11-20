/**
 * Runs in the page's own JS world, injected by border-image-tools.js:
 * CodeMirror's view hangs off a DOM property, which a content script's
 * isolated world cannot see. No `chrome.*` here.
 *
 * While the caret stands in a border-image value, shows how the render cuts
 * and lays it out:
 * - its nine pieces, numbered, around the element in the output, with a
 *   handle on each width and outset to drag;
 * - the panel, under the output and right of the code, open as soon as the
 *   caret comes in the value, which shows the image cut by its slices, each
 *   piece apart, and the pieces moving to their place: this script tells it
 *   what to draw, and follows its commands. It goes with the caret.
 */
import { findView, keepFacet } from "./utils/cm-view";
import {
  findElement,
  measure,
  targetAt,
  toRender,
  unitSizes,
} from "./utils/clip-path-target";
import { BAR_ANCHOR, RENDER, RENDER_CONTAINER } from "./utils/clip-path-tool";
import { unitFactor } from "./utils/clip-path-geometry";
import { ATTACH_EVENT, DETACH_EVENT } from "./utils/border-image-tool";
import { createSidebar } from "./utils/border-image-sidebar";
import { layoutBorderImage, parseSides } from "./utils/border-image-geometry";
import {
  chooseLine,
  editable,
  linesAt,
  outputLines,
  sourceLines,
  valueAt,
  valueText,
} from "./utils/border-image-handles";
import { describePiece, MIN_TILE, notices } from "./utils/border-image-pieces";
import {
  borderImageValueAt,
  DEFAULTS,
  GROUPS,
  parseBorderImage,
  REPEATS,
  repeatOf,
  sideNode,
  toggleFill,
  writeRepeat,
  writeSide,
} from "./utils/border-image-value";
import {
  COLORS,
  edgeSvg,
  numberSvg,
  pieceClass,
  rectSvg,
} from "./utils/border-image-view";
import { isPlayPage } from "./utils/spa-router";

const OVERLAY_ID = "cbt-border-image";
/** The column of the code: the panel stays right of it. */
const EDITOR_COLUMN = ".container__item--editor";
/** The least height of the panel, when the output is low on the screen. */
const PANEL_MIN_HEIGHT = 240;
/** Tells our edits apart from the user's typing. */
const USER_EVENT = "input.cbt-border-image";
/** The option that hides the tool. */
const HIDDEN = "hideBorderImage";
const HIGHLIGHT = "cbt-border-image-";
const HIGHLIGHT_STYLE_ID = "cbt-border-image-colors";
/** How near a line the pointer takes it, in pixels of the page. */
const TOLERANCE = 6;
const SIDE_NAMES = ["top", "right", "bottom", "left"];
/** The computed values a copy of the element takes, to paint as it does. */
const CLONED = [
  "border-image-slice",
  "border-image-width",
  "border-image-outset",
  "border-image-repeat",
  ...SIDE_NAMES.map((side) => `border-${side}-width`),
];
const FONT = [
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "line-height",
];

let view = null;
let frame = 0;
let overlay = null;
/** The markup last drawn over the output, not to draw it again for nothing. */
let drawn = "";
/** The panel, while open. */
let sidebar = null;
/** Closed with its cross: it stays closed until the caret leaves the value. */
let dismissed = false;
/** The JSON last sent to the panel. */
let sent = "";
/**
 * The line dragged, or the lines under the pointer until it moves one way.
 *
 * @type {{ id?: string, lines?: object[], start?: object, where: string, pointerId: number } | null}
 */
let drag = null;
/** The piece the pointer hovers in the panel, -1 for none. */
let hovered = -1;
/** The piece pressed, shown alone, -1 for none. */
let isolated = -1;
/** Which of the elements the rule styles is shown, for which rule. */
let chosen = { key: "", index: 0 };
let highlighted = { doc: null, key: "", ranges: [] };
/**
 * Whether the pieces are drawn over the output. Turned off, the output shows
 * as it is, the difference with the target too. Kept from a battle to the
 * next.
 */
let editing = true;

document.addEventListener(ATTACH_EVENT, attach);
document.addEventListener(DETACH_EVENT, detach);
// The first event can fire before this module has loaded.
attach();

function attach() {
  const found = findView();
  if (!found) {
    console.debug("[cbt] border-image tool: no CodeMirror view found");
    return;
  }
  view = found;
  keepFacet(view, view.constructor.updateListener, onUpdate);
  schedule();
}

function detach() {
  cancelAnimationFrame(frame);
  frame = 0;
  view = null;
  hide();
}

/** The same listener for every editor, so it is added only once to each. */
function onUpdate(update) {
  if (update.view === view) {
    schedule();
  }
}

function schedule() {
  if (0 === frame) {
    frame = requestAnimationFrame(refresh);
  }
}

/**
 * Draws the tool, then follows the render on every frame while the caret
 * stays in the value: cssbattle rebuilds it after each edit.
 */
function refresh() {
  frame = 0;
  const state = current();
  if (null === state) {
    hide();
    return;
  }
  render(state);
  frame = requestAnimationFrame(refresh);
}

/**
 * The elements a target styles that have a box: all those of a rule, as `*`
 * styles both the `html` and the `body`.
 */
function elementsOf(doc, target) {
  const found = findElement(doc, target);
  if (null === found.element || "style" in target) {
    return {
      elements: found.element ? [found.element] : [],
      reason: found.reason,
    };
  }
  const elements = [...doc.querySelectorAll(target.selector)].filter(
    (element) => element.getClientRects().length > 0,
  );
  return { elements, reason: "" };
}

/** Everything the tool draws, read again from the editor and the render. */
function current() {
  if (null === view) {
    return null;
  }
  const code = view.state.doc.toString();
  const head = view.state.selection.main.head;
  const value = borderImageValueAt(code, head);
  const iframe = document.querySelector(RENDER);
  const container = document.querySelector(RENDER_CONTAINER);
  const renderDoc = iframe?.contentDocument;
  if (
    null === value ||
    document.body.classList.contains(HIDDEN) ||
    !isPlayPage() ||
    !container ||
    !renderDoc
  ) {
    return null;
  }
  const parsed = parseBorderImage(value.text);
  const target = targetAt(code, head);
  const { elements, reason } = target
    ? elementsOf(renderDoc, target)
    : { elements: [], reason: "element not found" };
  const key = JSON.stringify(target);
  if (chosen.key !== key) {
    chosen = { key, index: 0 };
  }
  const index = chosen.index % Math.max(1, elements.length);
  const names = elements.map((element) => element.localName);
  const state = { value, parsed, container, reason, names, index };
  if (0 === elements.length) {
    return { ...state, layout: null };
  }

  const element = elements[index];
  const win = element.ownerDocument.defaultView;
  const style = win.getComputedStyle(element);
  const read = (name, fallback) =>
    style.getPropertyValue(name).trim() || fallback;
  // Chrome 128 and later only.
  const zoom = element.currentCSSZoom ?? 1;
  const place = measure(element, null);
  const borders = SIDE_NAMES.map(
    (side) => (parseFloat(read(`border-${side}-width`, "0")) || 0) * zoom,
  );
  const slice = parseSides(read("border-image-slice", "100%"));
  const [x, y = x] = read("border-image-repeat", "stretch").split(/\s+/);
  const repeat = [x, y];
  const layout = layoutBorderImage({
    box: place.box,
    borders,
    zoom,
    slice: slice.sides,
    fill: slice.fill,
    width: parseSides(read("border-image-width", "1")).sides,
    outset: parseSides(read("border-image-outset", "0")).sides,
    repeat,
  });

  const viewport = { width: iframe.clientWidth, height: iframe.clientHeight };
  // The units only the render knows, like `lh`, measured on the element.
  const unknown = [...value.text.matchAll(/[\d.]([a-z]+)/gi)]
    .map(([, unit]) => unit.toLowerCase())
    .filter(
      (unit) =>
        null ===
        unitFactor(unit, "x", { viewport, fontSize: 0, rootFontSize: 0 }),
    );
  const ctx = {
    zoom,
    borders,
    image: layout.image,
    area: layout.area,
    box: {
      width: place.box.width,
      height: place.box.height,
      fontSize: place.fontSize,
      rootFontSize: place.rootFontSize,
      viewport,
      units: unitSizes(element, unknown),
    },
  };
  const stories = layout.pieces.map((piece) =>
    describePiece(piece, layout, repeat, slice.fill),
  );
  return {
    ...state,
    layout,
    stories,
    repeat,
    fill: slice.fill,
    place,
    ctx,
    viewport,
    read,
    source: read("border-image-source", "none"),
  };
}

function enabledLines(state, lines) {
  return lines.filter((l) => isEditable(state, l));
}

function isEditable(state, { group, side }) {
  const { parsed, ctx } = state;
  return !parsed.opaque && editable(group, sideNode(parsed[group], side), ctx);
}

// ——— Drawing ———

function render(state) {
  const found = null !== state.layout;
  if (null === sidebar && !dismissed) {
    openSidebar();
  }
  if (null !== sidebar) {
    placeSidebar();
    emit(
      found
        ? model(state)
        : { reason: state.reason, names: state.names, onOutput: editing },
    );
  }

  if (!editing || !found) {
    removeOverlay();
    clearHighlights();
    return;
  }
  if (!overlay?.isConnected) {
    overlay?.remove();
    overlay = createOverlay();
    document.body.append(overlay);
    drawn = "";
  }
  const { left, top } = state.container.getBoundingClientRect();
  overlay.style.translate = `${left}px ${top}px`;
  const markup = outputSvg(state);
  if (drawn !== markup) {
    overlay.innerHTML = markup;
    drawn = markup;
  }
  highlightCode(state);
}

const n = (value) => Number(value.toFixed(2)) + 0;

/**
 * The image, its lengths relative to the render's viewport or root turned to
 * pixels: the panel is out of the render. Those relative to the element's
 * font follow the font it is given.
 */
function imageOf({ source, viewport, ctx }) {
  const per = {
    vw: viewport.width / 100,
    vh: viewport.height / 100,
    vmin: Math.min(viewport.width, viewport.height) / 100,
    vmax: Math.max(viewport.width, viewport.height) / 100,
    rem: ctx.box.rootFontSize,
  };
  return source.replace(
    /(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(vw|vh|vmin|vmax|rem)\b/gi,
    (_, number, unit) => `${n(parseFloat(number) * per[unit.toLowerCase()])}px`,
  );
}

/**
 * What the panel draws: the layout, what happens to each piece, and how
 * to paint the image and a copy of the element as the render does.
 */
function model(state) {
  const { layout, ctx, read, place, names, index } = state;
  const image = imageOf(state);
  const font = FONT.map((name) => `${name}:${read(name, "")}`).join(";");
  const clone = [
    "box-sizing:border-box",
    `width:${n(place.box.width / ctx.zoom)}px`,
    `height:${n(place.box.height / ctx.zoom)}px`,
    "border-style:solid",
    `border-image-source:${image}`,
    ...CLONED.map((name) => `${name}:${read(name, "0")}`),
    font,
  ].join(";");
  const locked = [...outputLines(layout), ...sourceLines(layout)]
    .filter((l) => !isEditable(state, l))
    .map(({ id }) => id);
  return {
    names,
    index,
    reason: "",
    onOutput: editing,
    notices: notices(layout, state.parsed),
    written: writtenOf(state.parsed),
    opaque: state.parsed.opaque,
    repeat: state.repeat,
    fill: state.fill,
    layout,
    stories: state.stories,
    locked,
    hovered,
    isolated,
    // Dragged in the panel: its pointer is none of the page's.
    dragged: 0 === drag?.pointerId ? (drag.id ?? "") : "",
    zoom: ctx.zoom,
    look: `--cbt-source:${image};${font}`,
    clone,
  };
}

/** The text of each side of each group, as written, or as left out. */
function writtenOf(parsed) {
  return Object.fromEntries(
    GROUPS.map((group) => [
      group,
      [0, 1, 2, 3].map((side) => {
        const node = sideNode(parsed[group], side);
        return null === node
          ? DEFAULTS[group]
          : parsed.text.slice(node.from, node.to);
      }),
    ]),
  );
}

/** Tells the panel what to draw, unless it already has it. */
function emit(data) {
  const json = JSON.stringify(data);
  if (json !== sent) {
    sent = json;
    sidebar.update(data);
  }
}

/**
 * Under the output, from the code to the right of the screen: the output and
 * the code stay at hand, the figures get the room of two columns.
 */
function placeSidebar() {
  const { style } = sidebar.element;
  const editor = document.querySelector(EDITOR_COLUMN);
  const output = document.querySelector(BAR_ANCHOR);
  if (null === editor || null === output) {
    // cssbattle's own place, on the right.
    style.removeProperty("--cbt-left");
    style.removeProperty("--cbt-top");
    return;
  }
  const top = Math.max(
    0,
    Math.min(
      output.getBoundingClientRect().bottom,
      window.innerHeight - PANEL_MIN_HEIGHT,
    ),
  );
  style.setProperty(
    "--cbt-left",
    `${Math.round(editor.getBoundingClientRect().right)}px`,
  );
  style.setProperty("--cbt-top", `${Math.round(top)}px`);
}

function openSidebar() {
  sidebar = createSidebar({ send: onCommand, close: closeSidebar });
  document.body.append(sidebar.element);
  sent = "";
}

/** Takes the panel down, and what it showed on the output with it. */
function closeSidebar() {
  dismissed = true;
  sidebar.destroy();
  sidebar = null;
  hovered = -1;
  isolated = -1;
  if (0 === drag?.pointerId) {
    drag = null;
  }
  schedule();
}

/** Dims a rect, but a hole in it, given by its corners. */
function dimSvg({ x, y, width, height }, hole) {
  const points = hole.map((p) => `${n(p.x)} ${n(p.y)}`).join("L");
  return `<path class="cbt-border-image__dim" fill-rule="evenodd" d="M${n(x)} ${n(y)}h${n(width)}v${n(height)}h${n(-width)}Z M${points}Z"/>`;
}

/** The 4 corners of a rect, clockwise from its top left. */
function corners({ x, y, width, height }) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

/** Where the tiles of an edge meet, when they are not too thin to tell. */
function tileSvg({ drawn: painted, axis, tiles, target }) {
  if (!painted || null === axis || null === tiles) {
    return "";
  }
  const x = "x" === axis;
  const length = x ? target.width : target.height;
  if (tiles.length < 2 || tiles[0].size < MIN_TILE) {
    return "";
  }
  return tiles
    .flatMap(({ start, size }) => [start, start + size])
    .filter((at) => at > 0.5 && at < length - 0.5)
    .map((at) =>
      x
        ? `<line class="cbt-border-image__tile" x1="${n(target.x + at)}" y1="${n(target.y)}" x2="${n(target.x + at)}" y2="${n(target.y + target.height)}"/>`
        : `<line class="cbt-border-image__tile" x1="${n(target.x)}" y1="${n(target.y + at)}" x2="${n(target.x + target.width)}" y2="${n(target.y + at)}"/>`,
    )
    .join("");
}

/**
 * Around the element: the pieces, numbered, the one alone standing out with
 * its tiles, the border box when outsets grow the area, and the handles.
 */
function outputSvg(state) {
  const { layout, place, viewport } = state;
  const { area, outsets } = layout;
  const marks = { hovered, isolated };
  const pieces = layout.pieces
    .map(
      (piece) =>
        rectSvg(
          piece.target,
          `class="${pieceClass(piece, marks)}" data-zone="${piece.zone}"`,
        ) + numberSvg(piece, piece.target),
    )
    .join("");
  const alone = layout.pieces[isolated];
  // The render dimmed, but the piece, wherever the transforms take it.
  const dim = alone
    ? dimSvg(
        { x: 0, y: 0, ...viewport },
        corners(alone.target).map((point) => toRender(place, point)),
      )
    : "";
  const tiles = alone ? tileSvg(alone) : "";
  const box = outsets.some((outset) => outset > 0)
    ? rectSvg(
        {
          x: 0,
          y: 0,
          width: area.width - outsets[1] - outsets[3],
          height: area.height - outsets[0] - outsets[2],
        },
        `class="cbt-border-image__box"`,
      )
    : "";
  const edges = outputLines(layout).map((l) =>
    edgeSvg(l, {
      locked: !isEditable(state, l),
      active: drag?.id === l.id,
      handleAt: (point) => toRender(place, point),
    }),
  );
  return `<svg width="${viewport.width}" height="${viewport.height}" viewBox="0 0 ${viewport.width} ${viewport.height}">${dim}<g data-part="output" transform="${place.transform}">${tiles}${pieces}${box}${edges.map(({ line }) => line).join("")}</g>${edges.map(({ handle }) => handle).join("")}</svg>`;
}

/**
 * Colors the values of each group in the code as its handles, with the CSS
 * Custom Highlight API: CodeMirror owns its DOM, which a highlight leaves as
 * it is.
 */
function highlightCode(state) {
  const registry = globalThis.CSS?.highlights;
  if (!registry || "function" !== typeof globalThis.Highlight) {
    return;
  }
  const { from: top, to: bottom } = view.viewport;
  const { value, parsed } = state;
  const spans = GROUPS.flatMap((group) => {
    const nodes = [...(parsed[group]?.values ?? [])];
    if ("slice" === group && parsed.fill) {
      nodes.push(parsed.fill);
    }
    return nodes.map(({ from, to }) => ({
      group,
      from: value.from + from,
      to: value.from + to,
      text: value.text.slice(from, to),
    }));
  }).filter(({ from, to }) => from >= top && to <= bottom);
  const doc = view.state.doc;
  const key = JSON.stringify(spans);
  if (
    highlighted.doc === doc &&
    highlighted.key === key &&
    // A line drawn again leaves its ranges collapsed where it was.
    highlighted.ranges.every(({ range, text }) => String(range) === text)
  ) {
    return;
  }
  clearHighlights();
  addHighlightStyle();
  const byGroup = new Map();
  const ranges = [];
  for (const { group, from, to, text } of spans) {
    const range = document.createRange();
    try {
      const start = view.domAtPos(from);
      const end = view.domAtPos(to);
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
    } catch {
      continue;
    }
    ranges.push({ range, text });
    byGroup.set(group, [...(byGroup.get(group) ?? []), range]);
  }
  byGroup.forEach((colored, group) => {
    registry.set(`${HIGHLIGHT}${group}`, new Highlight(...colored));
  });
  highlighted = { doc, key, ranges };
}

function clearHighlights() {
  GROUPS.forEach((group) =>
    globalThis.CSS?.highlights?.delete(`${HIGHLIGHT}${group}`),
  );
  highlighted = { doc: null, key: "", ranges: [] };
}

/** The colors of the highlights, which only a stylesheet can give. */
function addHighlightStyle() {
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = GROUPS.map(
    (group) =>
      `::highlight(${HIGHLIGHT}${group}) { color: ${COLORS[group]}; background-color: color-mix(in srgb, ${COLORS[group]} 22%, transparent); }`,
  ).join("\n");
  document.head.append(style);
}

function hide() {
  removeOverlay();
  clearHighlights();
  sidebar?.destroy();
  sidebar = null;
  dismissed = false;
  hovered = -1;
  isolated = -1;
}

function removeOverlay() {
  overlay?.remove();
  overlay = null;
  drawn = "";
  drag = null;
}

function createOverlay() {
  const element = document.createElement("div");
  element.id = OVERLAY_ID;
  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("pointerup", onPointerUp);
  element.addEventListener("pointercancel", onPointerUp);
  // Keeps the focus, and so the caret, in the editor.
  element.addEventListener("mousedown", (event) => event.preventDefault());
  return element;
}

// ——— Commands of the panel ———

function onCommand(command) {
  const state = current();
  if (null === state) {
    return;
  }
  switch (command.type) {
    case "hover":
      hovered = command.zone;
      break;
    case "draw":
      editing = !editing;
      break;
    case "isolate":
      isolated = command.zone === isolated ? -1 : command.zone;
      break;
    case "element":
      chosen = { ...chosen, index: command.index };
      isolated = -1;
      break;
    case "repeat":
    case "fill":
      edit(commandChanges(state, command), state);
      break;
    case "down":
      // A line of the image, or of the element: its width or outset.
      press(
        state,
        "element" === command.where ? "output" : "source",
        command.point,
        command.scale,
        0,
        command.zone,
        command.line,
      );
      break;
    case "move":
      moveTo(state, command.point, command);
      break;
    case "up":
      drag = null;
      break;
  }
  schedule();
}

/** The changes a command of the panel makes to the value. */
function commandChanges({ layout, parsed }, command) {
  if (null === layout || parsed.opaque) {
    return [];
  }
  if ("fill" === command.type) {
    return toggleFill(parsed);
  }
  const now = repeatOf(parsed)[command.axis];
  const next = REPEATS[(REPEATS.indexOf(now) + 1) % REPEATS.length];
  return writeRepeat(parsed, command.axis, next);
}

// ——— Editing ———

/**
 * Applies changes of the value's text to the editor.
 *
 * The steps of a drag go without a user event: CodeMirror joins those into a
 * single undo, as it does for typing.
 */
function edit(changes, state, { step = false } = {}) {
  const doc = view.state.doc.toString();
  const offset = state.value.from;
  const effective = changes
    .map(({ from, to, insert }) => ({
      from: from + offset,
      to: to + offset,
      insert,
    }))
    .filter(({ from, to, insert }) => doc.slice(from, to) !== insert);
  if (0 === effective.length) {
    return;
  }
  view.dispatch({
    changes: effective,
    ...(step ? {} : { userEvent: USER_EVENT }),
  });
}

/** The lines of a place: the output, or the image in the panel. */
function linesOf(state, where) {
  return "output" === where
    ? outputLines(state.layout)
    : sourceLines(state.layout);
}

/**
 * Starts dragging the line under a point, or the line pressed by its handle,
 * which stands off it; or waits for the pointer to move to choose between
 * some. A piece of the image pressed elsewhere shows alone.
 *
 * @param {string} [id] the line pressed, found by the point without it
 * @returns {boolean} whether a drag started
 */
function press(state, where, point, scale, pointerId, zone, id) {
  if (null === state.layout) {
    return false;
  }
  const all = linesOf(state, where);
  const lines = enabledLines(
    state,
    undefined === id
      ? linesAt(all, point, TOLERANCE / scale)
      : all.filter((l) => l.id === id),
  );
  if (0 === lines.length) {
    if (Number.isInteger(zone)) {
      isolated = zone === isolated ? -1 : zone;
    }
    return false;
  }
  drag = {
    where,
    pointerId,
    ...(1 === lines.length ? { id: lines[0].id } : { lines, start: point }),
  };
  return true;
}

function moveTo(state, point, { shiftKey, altKey }) {
  if (null === drag || null === state.layout) {
    return;
  }
  if (undefined === drag.id) {
    const move = { x: point.x - drag.start.x, y: point.y - drag.start.y };
    if (0 === move.x && 0 === move.y) {
      return;
    }
    drag.id = chooseLine(drag.lines, move).id;
  }
  const l = linesOf(state, drag.where).find(({ id }) => id === drag.id);
  const node = sideNode(state.parsed[l.group], l.side);
  const text = valueText(l.group, l.side, node, valueAt(l, point), state.ctx, {
    precision: shiftKey ? 1 : 0,
  });
  if (null === text) {
    return;
  }
  edit(
    writeSide(state.parsed, l.group, l.side, text, { split: altKey }),
    state,
    { step: true },
  );
}

/** The pointer, in pixels of the border box, and the scale of the page. */
function localPoint(event) {
  const group = overlay.querySelector('g[data-part="output"]');
  const matrix = group.getScreenCTM();
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
    matrix.inverse(),
  );
  return {
    x: point.x,
    y: point.y,
    scale: Math.hypot(matrix.a, matrix.b) || 1,
  };
}

function onPointerDown(event) {
  if (!event.target.closest?.("[data-line]")) {
    return;
  }
  const state = current();
  if (!state?.layout) {
    return;
  }
  const point = localPoint(event);
  if (press(state, "output", point, point.scale, event.pointerId)) {
    event.preventDefault();
    overlay.setPointerCapture?.(event.pointerId);
    schedule();
  }
}

function onPointerMove(event) {
  if (null === drag || event.pointerId !== drag.pointerId) {
    return;
  }
  const state = current();
  if (state?.layout) {
    moveTo(state, localPoint(event), event);
  }
}

function onPointerUp(event) {
  if (null === drag || event.pointerId !== drag.pointerId) {
    return;
  }
  drag = null;
  schedule();
  overlay?.releasePointerCapture?.(event.pointerId);
}
