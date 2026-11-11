/**
 * Runs in the page's own JS world, injected by clip-path-tools.js: CodeMirror's
 * view hangs off a DOM property, which a content script's isolated world
 * cannot see. No `chrome.*` here.
 *
 * While the caret stands in a clip-path value, draws the points of its shape
 * over the element in the render, and rewrites the value as they are dragged.
 */
import { findView, keepFacet } from "./utils/cm-view";
import { PRESET_GROUPS, PRESETS } from "./utils/clip-path-presets";
import {
  ADDED_COMMANDS,
  layoutShape,
  parseClipPath,
} from "./utils/clip-path-shape";
import {
  findElement,
  measure,
  targetAt,
  viewportFrame,
} from "./utils/clip-path-target";
import {
  ATTACH_EVENT,
  BAR_ANCHOR,
  DETACH_EVENT,
  RENDER,
  RENDER_CONTAINER,
} from "./utils/clip-path-tool";
import { isPlayPage } from "./utils/spa-router";
import { clipPathAt } from "./utils/clip-path-value";

const OVERLAY_ID = "cbt-clip-path";
const BAR_ID = "cbt-clip-path-bar";
/** Tells our edits apart from the user's typing. */
const USER_EVENT = "input.cbt-clip-path";
/** Two presses on a point this close in time remove it. */
const DOUBLE_PRESS_MS = 400;
const GEOMETRY_BOXES = [
  "border-box",
  "padding-box",
  "content-box",
  "margin-box",
  "fill-box",
  "stroke-box",
  "view-box",
];

let view = null;
let frame = 0;
let overlay = null;
let bar = null;
let drawn = "";
/** @type {{ id: string, units: object, pointerId: number } | null} */
let drag = null;
let lastPress = { id: "", time: -Infinity };
/** The command a new point of a shape() comes with, picked in the bar. */
let added = "line";

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

function enabled() {
  return !document.body.classList.contains("hideClipPath") && isPlayPage();
}

/** Everything the tool draws, read again from the editor and the render. */
function current() {
  if (null === view || !enabled()) {
    return null;
  }
  const code = view.state.doc.toString();
  const head = view.state.selection.main.head;
  const value = clipPathAt(code, head);
  const iframe = document.querySelector(RENDER);
  const container = document.querySelector(RENDER_CONTAINER);
  const renderDoc = iframe?.contentDocument;
  if (null === value || !container || !renderDoc) {
    return null;
  }

  const parsed = parseClipPath(value.text);
  const keyword =
    parsed.nodes.find(
      (node) => "ident" === node.type && GEOMETRY_BOXES.includes(node.name),
    )?.name ?? null;
  const target = targetAt(code, head);
  const found = target
    ? findElement(renderDoc, target)
    : { element: null, reason: "element not found" };
  const width = iframe.clientWidth;
  const height = iframe.clientHeight;
  const place = found.element
    ? measure(found.element, keyword)
    : viewportFrame(width, height);
  const box = {
    width: place.box.width,
    height: place.box.height,
    fontSize: place.fontSize,
    rootFontSize: place.rootFontSize,
    viewport: { width, height },
  };
  return {
    value,
    parsed,
    place,
    box,
    layout: layoutShape(parsed, box, { add: added }),
    reason: found.reason,
    width,
    height,
    container,
  };
}

// ——— Drawing ———

function render(state) {
  if (!overlay?.isConnected || overlay.parentElement !== state.container) {
    overlay?.remove();
    overlay = createOverlay();
    state.container.append(overlay);
    drawn = "";
  }
  if (!bar?.isConnected) {
    bar?.remove();
    bar = createBar();
    document.querySelector(BAR_ANCHOR)?.insertAdjacentElement("afterend", bar);
  }
  const shape = state.parsed.shape;
  bar.querySelector(".cbt-clip-path__status").textContent = [
    shape ? `${shape.name}()` : "Pick a shape",
    shape && 0 === state.layout.handles.length
      ? "nothing to drag yet, pick a shape below"
      : "",
    state.reason ? `${state.reason}, drawn on the whole output` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  showAdded(shape?.name);

  const markup = svg(state);
  if (markup !== drawn) {
    overlay.innerHTML = markup;
    drawn = markup;
  }
}

function hide() {
  overlay?.remove();
  bar?.remove();
  overlay = null;
  bar = null;
  drawn = "";
  drag = null;
}

/** The SVG of the overlay, from the reference box's top left. */
function svg({ place, layout, width, height }) {
  const { box } = place;
  const n = (value) => Number(value.toFixed(2));
  const transform = [
    `translate(${n(place.x)} ${n(place.y)})`,
    place.transform,
    `translate(${n(box.x)} ${n(box.y)})`,
  ]
    .filter(Boolean)
    .join(" ");
  const lines = layout.lines
    .map(
      ([a, b]) =>
        `<line class="cbt-clip-path__line" x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}"/>`,
    )
    .join("");
  const handles = layout.handles
    .map(({ id, kind, x, y, free }) => {
      const move =
        free.x && free.y ? "move" : free.x ? "ew" : free.y ? "ns" : "locked";
      return `<circle class="cbt-clip-path__handle cbt-clip-path__handle--${kind} cbt-clip-path__handle--${move}" data-handle="${id}" cx="${n(x)}" cy="${n(y)}" r="${"mid" === kind ? 4 : 5}"/>`;
    })
    .join("");
  const path = layout.path
    ? `<path class="cbt-clip-path__outline" d="${layout.path}"/>`
    : "";
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g transform="${transform}"><rect class="cbt-clip-path__box" width="${n(box.width)}" height="${n(box.height)}"/>${path}${lines}${handles}</g></svg>`;
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
  element.innerHTML = `<span class="cbt-clip-path__status"></span><div class="cbt-clip-path__added" role="group" aria-label="New point" hidden><span>New point</span>${ADDED_COMMANDS.map(
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
    const command = event.target.closest("[data-add]");
    if (command) {
      added = command.dataset.add;
      showAdded("shape");
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
function showAdded(shapeName) {
  const group = bar.querySelector(".cbt-clip-path__added");
  group.hidden = "shape" !== shapeName;
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

/** Replaces the shape, or fills the value, with a ready-made one. */
function applyPreset(preset) {
  const state = current();
  if (null === state) {
    return;
  }
  const { parsed, value } = state;
  let from;
  let to;
  let insert = preset;
  if (parsed.shape) {
    ({ from, to } = parsed.shape);
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

/** The pointer, in pixels of the reference box. */
function localPoint(event) {
  const group = overlay.querySelector("g");
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
    group.getScreenCTM().inverse(),
  );
  return { x: point.x, y: point.y };
}

function handleAt(state, id) {
  return state?.layout.handles.find((handle) => handle.id === id) ?? null;
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
    edit(handle.write(localPoint(event)), state.value.from, { step: true });
    dragged = { id: handle.next, units: handle.units };
  }
  drag = { id: dragged.id, units: dragged.units, pointerId: event.pointerId };
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
  const changes = handle.write(localPoint(event), {
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
