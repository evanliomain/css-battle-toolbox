/**
 * Runs in the page's own JS world, injected by clip-path-tools.js: CodeMirror's
 * view hangs off a DOM property, which a content script's isolated world
 * cannot see. No `chrome.*` here.
 *
 * While the caret stands in a clip-path or border-shape value, draws the points
 * of its shapes over the element in the render, and rewrites the value as they
 * are dragged.
 */
import { findView, keepFacet } from "./utils/cm-view";
import { PRESET_GROUPS, PRESETS } from "./utils/clip-path-presets";
import {
  ADDED_COMMANDS,
  layoutShape,
  parseClipPath,
  SHAPE_NAMES,
} from "./utils/clip-path-shape";
import {
  findElement,
  measure,
  targetAt,
  toRender,
  unitSizes,
  viewportFrame,
} from "./utils/clip-path-target";
import {
  ATTACH_EVENT,
  BAR_ANCHOR,
  DETACH_EVENT,
  RENDER,
  RENDER_CONTAINER,
} from "./utils/clip-path-tool";
import { unitFactor } from "./utils/clip-path-geometry";
import { POINT_COLORS } from "./utils/point-colors";
import { isPlayPage } from "./utils/spa-router";
import {
  GEOMETRY_BOXES,
  shapeParts,
  shapeValueAt,
} from "./utils/clip-path-value";

const OVERLAY_ID = "cbt-clip-path";
const BAR_ID = "cbt-clip-path-bar";
/** Tells our edits apart from the user's typing. */
const USER_EVENT = "input.cbt-clip-path";
/** Two presses on a point this close in time remove it. */
const DOUBLE_PRESS_MS = 400;
/** The highlights of the code, one per color: `cbt-point-0`… */
const HIGHLIGHT = "cbt-point-";
const HIGHLIGHT_STYLE_ID = "cbt-point-colors";
/** The option that hides the tool, by property. */
const HIDDEN = {
  "clip-path": "hideClipPath",
  "-webkit-clip-path": "hideClipPath",
  "border-shape": "hideBorderShape",
};

let view = null;
let frame = 0;
let overlay = null;
let bar = null;
let drawn = "";
/**
 * @type {{ id: string, part: number, units: object, pointerId: number } | null}
 */
let drag = null;
let lastPress = { id: "", time: -Infinity };
/**
 * The values colored in the code, kept while the code and its lines stay:
 * CodeMirror redraws a line once edited or scrolled back into view.
 */
let highlighted = { doc: null, key: "", ranges: [] };
/** The command a new point of a shape() comes with, picked in the bar. */
let added = "line";
/**
 * Whether the shape is drawn over the output. Turned off, the output shows as
 * it is, the difference with the target too, while the numbers are tuned in
 * the code. Kept from a battle to the next.
 */
let editing = true;

document.addEventListener(ATTACH_EVENT, attach);
document.addEventListener(DETACH_EVENT, detach);
// The first event can fire before this module has loaded.
attach();

function attach() {
  const found = findView();
  if (!found) {
    console.debug("[cbt] clip-path tool: no CodeMirror view found");
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
 * stays in the value: cssbattle rebuilds it after each edit, and the element
 * can move or resize with it.
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

function enabled(property) {
  return !document.body.classList.contains(HIDDEN[property]) && isPlayPage();
}

/**
 * @typedef {object} Drawn a shape of the value, laid out in its reference box
 * @property {object | null} shape its function node
 * @property {object} place where its reference box lands in the render
 * @property {object} box its reference box, and what its units resolve against
 * @property {object} layout its outline and its handles, their ids told apart
 *   from those of the other shape
 */

/** Everything the tool draws, read again from the editor and the render. */
function current() {
  if (null === view) {
    return null;
  }
  const code = view.state.doc.toString();
  const head = view.state.selection.main.head;
  const value = shapeValueAt(code, head);
  const iframe = document.querySelector(RENDER);
  const container = document.querySelector(RENDER_CONTAINER);
  const renderDoc = iframe?.contentDocument;
  if (null === value || !enabled(value.property) || !container || !renderDoc) {
    return null;
  }

  const parsed = parseClipPath(value.text);
  const target = targetAt(code, head);
  const found = target
    ? findElement(renderDoc, target)
    : { element: null, reason: "element not found" };
  const width = iframe.clientWidth;
  const height = iframe.clientHeight;
  const viewport = { width, height };
  // The units only the render knows, like `lh`, measured on the element.
  const unknown = [...value.text.matchAll(/[\d.]([a-z]+)/gi)]
    .map(([, unit]) => unit.toLowerCase())
    .filter(
      (unit) =>
        null ===
        unitFactor(unit, "x", { viewport, fontSize: 0, rootFontSize: 0 }),
    );
  const units = unitSizes(found.element ?? renderDoc.documentElement, unknown);

  const caret = head - value.from;
  /** @type {Drawn[]} */
  const parts = shapeParts(parsed, value.property).map(({ shape, box }, i) => {
    const place = found.element
      ? measure(found.element, box)
      : viewportFrame(width, height);
    const size = {
      width: place.box.width,
      height: place.box.height,
      fontSize: place.fontSize,
      rootFontSize: place.rootFontSize,
      viewport,
      units,
    };
    // A path() shows its box, with nothing to drag.
    const editable = SHAPE_NAMES.includes(shape?.name) ? shape : null;
    const layout = layoutShape({ text: value.text, shape: editable }, size, {
      add: added,
    });
    return { shape, place, box: size, layout: tagHandles(layout, i) };
  });
  // A color per point, in the order of the code: the new points have none.
  parts
    .flatMap(({ layout }) => layout.handles)
    .filter(({ kind }) => "mid" !== kind)
    .forEach((handle, i) => {
      handle.color = POINT_COLORS[i % POINT_COLORS.length];
    });
  const active = parts.findIndex(
    ({ shape }) => shape && shape.from <= caret && caret <= shape.to,
  );
  return {
    value,
    parsed,
    parts,
    active,
    reason: found.reason,
    width,
    height,
    container,
  };
}

/**
 * Tells the handles of the second shape of a border-shape from those of the
 * first, whose ids stay as they are.
 */
function tagHandles(layout, part) {
  const tag = (id) => (0 === part || undefined === id ? id : `${part}:${id}`);
  return {
    ...layout,
    handles: layout.handles.map((handle) => ({
      ...handle,
      id: tag(handle.id),
      next: tag(handle.next),
      part,
    })),
  };
}

/** The handles of every shape. */
function handlesOf(state) {
  return state.parts.flatMap(({ layout }) => layout.handles);
}

// ——— Drawing ———

function render(state) {
  if (!bar?.isConnected) {
    bar?.remove();
    bar = createBar();
    document.querySelector(BAR_ANCHOR)?.insertAdjacentElement("afterend", bar);
  }
  const shapes = state.parts.map(({ shape }) => shape).filter(Boolean);
  bar.querySelector(".cbt-clip-path__status").textContent = [
    describe(state),
    shapes.length > 0 && 0 === handlesOf(state).length
      ? "nothing to drag yet, pick a shape below"
      : "",
    state.reason ? `${state.reason}, drawn on the whole output` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  showAdded(shapes.some(({ name }) => "shape" === name));
  bar
    .querySelector("[data-toggle]")
    .setAttribute("aria-checked", String(editing));

  if (!editing) {
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
  // Out of the output's panel, which would cut the points beyond the render,
  // and of the filter the difference puts on the render: pinned over it.
  const { left, top } = state.container.getBoundingClientRect();
  overlay.style.translate = `${left}px ${top}px`;
  const markup = svg(state);
  if (markup !== drawn) {
    overlay.innerHTML = markup;
    drawn = markup;
  }
  highlightCode(state);
}

/**
 * Colors the values of each point in the code as the point, with the CSS
 * Custom Highlight API: CodeMirror owns its DOM, which a highlight leaves as
 * it is. Only the values of the lines drawn have a DOM to color.
 */
function highlightCode(state) {
  const registry = globalThis.CSS?.highlights;
  if (!registry || "function" !== typeof globalThis.Highlight) {
    return;
  }
  const { from: top, to: bottom } = view.viewport;
  const { value } = state;
  const spans = handlesOf(state).flatMap(({ color, spans }) =>
    color
      ? spans
          .map(({ from, to }) => ({
            color,
            from: value.from + from,
            to: value.from + to,
            text: value.text.slice(from, to),
          }))
          .filter(({ from, to }) => from >= top && to <= bottom)
      : [],
  );
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
  const byColor = new Map();
  const ranges = [];
  for (const { color, from, to, text } of spans) {
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
    byColor.set(color, [...(byColor.get(color) ?? []), range]);
  }
  byColor.forEach((colored, color) => {
    const name = `${HIGHLIGHT}${POINT_COLORS.indexOf(color)}`;
    registry.set(name, new Highlight(...colored));
  });
  highlighted = { doc, key, ranges };
}

function clearHighlights() {
  POINT_COLORS.forEach((_, i) =>
    globalThis.CSS?.highlights?.delete(`${HIGHLIGHT}${i}`),
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
  style.textContent = POINT_COLORS.map(
    (color, i) =>
      `::highlight(${HIGHLIGHT}${i}) { color: ${color}; background-color: color-mix(in srgb, ${color} 22%, transparent); }`,
  ).join("\n");
  document.head.append(style);
}

/**
 * The shapes of the value, and how a border-shape draws them: one stroked
 * along its path, or two filled between.
 */
function describe({ value, parts }) {
  const names = parts
    .filter(({ shape }) => shape)
    .map(({ shape }) => `${shape.name}()`);
  if (0 === names.length) {
    return "Pick a shape";
  }
  if ("border-shape" !== value.property) {
    return names[0];
  }
  return 1 === names.length
    ? `${names[0]} stroked`
    : `${names[0]} outside, ${names[1]} inside`;
}

function hide() {
  removeOverlay();
  clearHighlights();
  bar?.remove();
  bar = null;
}

function removeOverlay() {
  overlay?.remove();
  overlay = null;
  drawn = "";
  drag = null;
}

const n = (value) => Number(value.toFixed(2));

/**
 * The SVG of the overlay: each shape in a group from its reference box's top
 * left, then the handles. The shape the caret stands in comes last, its
 * handles on top of the other's where they meet, and the other one fades.
 */
function svg({ parts, active, width, height }) {
  const order = parts.map((_, i) => i);
  if (active > -1) {
    order.push(...order.splice(active, 1));
  }
  const idle = (i) => parts.length > 1 && active > -1 && i !== active;
  const groups = order.map((i) => group(parts[i], i, idle(i))).join("");
  const handles = order.map((i) => handlesSvg(parts[i])).join("");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${groups}${handles}</svg>`;
}

/** A shape's box, outline and control lines, in its reference box. */
function group({ place, layout }, i, idle) {
  const { box } = place;
  const transform = `${place.transform} translate(${n(box.x)} ${n(box.y)})`;
  const lines = layout.lines
    .map(
      ([a, b]) =>
        `<line class="cbt-clip-path__line" x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}"/>`,
    )
    .join("");
  const path = layout.path
    ? `<path class="cbt-clip-path__outline" d="${layout.path}"/>`
    : "";
  const attributes = idle ? ` class="cbt-clip-path__idle"` : "";
  return `<g data-part="${i}"${attributes} transform="${transform}"><rect class="cbt-clip-path__box" width="${n(box.width)}" height="${n(box.height)}"/>${path}${lines}</g>`;
}

/**
 * A shape's handles, in pixels of the render, out of the transforms: round and
 * of the same size, however the element is scaled or skewed.
 */
function handlesSvg({ place, layout }) {
  return layout.handles
    .map(({ id, kind, x, y, free, color }) => {
      const move =
        free.x && free.y ? "move" : free.x ? "ew" : free.y ? "ns" : "locked";
      const at = toRender(place, { x, y });
      const style = color ? ` style="--cbt-point: ${color}"` : "";
      return `<circle class="cbt-clip-path__handle cbt-clip-path__handle--${kind} cbt-clip-path__handle--${move}" data-handle="${id}"${style} cx="${n(at.x)}" cy="${n(at.y)}" r="${"mid" === kind ? 4 : 5}"/>`;
    })
    .join("");
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

function createBar() {
  const element = document.createElement("div");
  element.id = BAR_ID;
  element.innerHTML = `<div class="cbt-clip-path__header"><span class="cbt-clip-path__status"></span><button type="button" class="cbt-clip-path__toggle hint--bottom-left" role="switch" data-toggle aria-checked="true" aria-label="Edit the shape on the output" data-hint="Edit the shape on the output"><span class="cbt-clip-path__knob"></span></button></div><div class="cbt-clip-path__added" role="group" aria-label="New point" hidden><span>New point</span>${ADDED_COMMANDS.map(
    ({ name, label, title }) =>
      `<button type="button" class="cbt-clip-path__command" data-add="${name}" title="${title}" aria-pressed="false">${label}</button>`,
  ).join("")}</div>${PRESET_GROUPS.map(
    ({ name, presets }) =>
      `<div class="cbt-clip-path__presets" role="group" aria-label="${name}">${presets
        .map(presetButton)
        .join("")}</div>`,
  ).join("")}`;
  element.addEventListener("mousedown", (event) => event.preventDefault());
  element.addEventListener("click", (event) => {
    if (event.target.closest("[data-toggle]")) {
      editing = !editing;
      schedule();
      return;
    }
    const command = event.target.closest("[data-add]");
    if (command) {
      added = command.dataset.add;
      showAdded(true);
      return;
    }
    const button = event.target.closest("[data-preset]");
    if (button) {
      applyPreset(PRESETS[Number(button.dataset.preset)].value);
    }
  });
  return element;
}

/** A preset, found back by its rank among all of them. */
function presetButton(preset) {
  const { name, value } = preset;
  return `<button type="button" class="cbt-clip-path__preset" data-preset="${PRESETS.indexOf(preset)}" title="${name}: ${value}" aria-label="${name}"><svg viewBox="-1 -1 22 22" width="16" height="16"><path d="${icon(value)}"/></svg></button>`;
}

/** The commands to add a point with, for a shape() only. */
function showAdded(visible) {
  const group = bar.querySelector(".cbt-clip-path__added");
  group.hidden = !visible;
  group.querySelectorAll("[data-add]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.add === added));
  });
}

/** A preset drawn in a 20px box. */
function icon(value) {
  const size = 20;
  return layoutShape(parseClipPath(value), {
    width: size,
    height: size,
    fontSize: 16,
    rootFontSize: 16,
    viewport: { width: size, height: size },
  }).path;
}

// ——— Editing ———

/**
 * Applies changes of the value's text to the editor, leaving out those that
 * change nothing.
 *
 * The steps of a drag go without a user event: CodeMirror joins those into a
 * single undo, as it does for typing, while they follow each other closely.
 * Kept out of the history instead, they would shift the older undos.
 */
function edit(changes, offset, { step = false } = {}) {
  const doc = view.state.doc.toString();
  const effective = changes
    .map(({ from, to = from, insert }) => ({
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

/**
 * Replaces a shape, or fills the value, with a ready-made one: the shape the
 * caret stands in, the first one otherwise.
 */
function applyPreset(preset) {
  const state = current();
  if (null === state) {
    return;
  }
  const { parsed, parts, active, value } = state;
  const shape = parts[active]?.shape ?? parts[0].shape;
  let from;
  let to;
  let insert = preset;
  if (shape) {
    ({ from, to } = shape);
  } else {
    // What was there, but the geometry box, gives way to the shape.
    const boxes = parsed.nodes
      .filter(
        (node) => "ident" === node.type && GEOMETRY_BOXES.includes(node.name),
      )
      .map((node) => value.text.slice(node.from, node.to));
    insert = [preset, ...boxes].join(" ");
    from = /^\s*/.exec(value.text)[0].length;
    to = Math.max(from, value.text.trimEnd().length);
  }
  const caret = value.from + from + preset.indexOf("(") + 1;
  view.dispatch({
    changes: { from: value.from + from, to: value.from + to, insert },
    selection: { anchor: caret },
    userEvent: USER_EVENT,
  });
  view.focus();
}

/** The pointer, in pixels of the reference box of a shape. */
function localPoint(event, part) {
  const group = overlay.querySelector(`g[data-part="${part}"]`);
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
    group.getScreenCTM().inverse(),
  );
  return { x: point.x, y: point.y };
}

function handleAt(state, id) {
  return state
    ? (handlesOf(state).find((handle) => handle.id === id) ?? null)
    : null;
}

function onPointerDown(event) {
  const id = event.target.closest?.("[data-handle]")?.dataset.handle;
  const state = current();
  const handle = handleAt(state, id);
  if (null === handle) {
    return;
  }
  event.preventDefault();

  // Pressed twice on the same point: it goes, when the shape can lose it.
  const now = event.timeStamp;
  const double = lastPress.id === id && now - lastPress.time < DOUBLE_PRESS_MS;
  lastPress = { id, time: now };
  if (double && handle.remove) {
    lastPress = { id: "", time: -Infinity };
    edit(handle.remove(), state.value.from);
    return;
  }

  let dragged = handle;
  if (handle.next) {
    // A side's middle: the new point is added, then dragged.
    edit(handle.write(localPoint(event, handle.part)), state.value.from, {
      step: true,
    });
    dragged = { id: handle.next, units: handle.units };
  }
  drag = {
    id: dragged.id,
    part: handle.part,
    units: dragged.units,
    pointerId: event.pointerId,
  };
  overlay.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event) {
  if (null === drag || event.pointerId !== drag.pointerId) {
    return;
  }
  const state = current();
  const handle = handleAt(state, drag.id);
  if (null === handle) {
    return;
  }
  const changes = handle.write(localPoint(event, drag.part), {
    precision: event.shiftKey ? 1 : 0,
    units: drag.units,
  });
  edit(changes, state.value.from, { step: true });
}

function onPointerUp(event) {
  if (null === drag || event.pointerId !== drag.pointerId) {
    return;
  }
  drag = null;
  overlay?.releasePointerCapture?.(event.pointerId);
}
