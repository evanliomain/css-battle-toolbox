import { DOM_COLOR } from "../utils/dom-color";
import { round } from "../utils/round";
import { DEPTH, HOVER } from "./ghost-sheet";

/** Tags that never paint a box of their own. */
const SKIPPED = new Set([
  "base",
  "head",
  "link",
  "meta",
  "noscript",
  "script",
  "style",
  "template",
  "title",
]);

/** Ceiling on the walk, so a <div> bomb in the editor cannot freeze the page. */
const MAX_NODES = 2000;

/**
 * Renders the tree panel from the ghost, and tags every ghost element with the
 * depth its colour comes from.
 *
 * The walk reads the ghost and never the player's document: that is what keeps
 * the tool read-only on the code being played.
 *
 * @returns {{id: string, element: Element, depth: number}[]} one entry per row
 */
export function buildPanel(ghostRoot, main) {
  const entries = [];
  const html = walk(ghostRoot, 0, entries);
  const isTruncated = MAX_NODES <= entries.length;

  // One parse for the whole tree. Building it node by node meant a DOMParser
  // document per element, so a 200-node render paid 200 parses per keystroke.
  main.innerHTML = isTruncated
    ? `${html}<p class="dom-truncated">Stopped after ${MAX_NODES} nodes.</p>`
    : html;

  return entries;
}

/** Paints the box model of one ghost element, or clears it. */
export function setHover(element, isOn) {
  if (!isOn) {
    element.removeAttribute(HOVER);
    element.style.removeProperty("--cbt-margin");
    return;
  }

  // An element has a single outline slot and the margin band takes it, so the
  // band is uniform: the widest of the four margins. The panel row spells the
  // four values out, which is what actually helps when they differ.
  const styles = getComputedStyle(element);
  element.style.setProperty(
    "--cbt-margin",
    `${Math.max(...margins(styles))}px`,
  );
  element.setAttribute(HOVER, "");
}

function walk(element, depth, entries) {
  if (MAX_NODES <= entries.length) {
    return "";
  }

  const id = `${element.localName}-${entries.length}`;
  element.setAttribute(DEPTH, depth % DOM_COLOR.length);
  entries.push({ id, element, depth });

  const children = Array.from(element.children)
    .filter((child) => !SKIPPED.has(child.localName))
    .map((child) => walk(child, 1 + depth, entries))
    .join("");

  return row(element, id, depth, children);
}

function row(element, id, depth, children) {
  const styles = getComputedStyle(element);
  const isHidden = "none" === styles.display;
  const margin = margins(styles);

  const attributes = [];
  for (let i = 0; i < element.attributes.length; i++) {
    const attribute = element.attributes.item(i);
    if (
      attribute.name.startsWith("data-") ||
      ["style", "class", "id"].includes(attribute.name)
    ) {
      continue;
    }
    attributes.push(attribute.name);
  }

  const box = borderBox(element, styles);
  const size = isHidden
    ? `<span class="dom-detail-size dom-detail-hidden">display: none</span>`
    : `<span class="dom-detail-size">W ${round(box.width)} x H ${round(box.height)}</span>`;

  return `
  <ul data-id="${escapeHtml(id)}">
    <li style="--dom-level-color: ${DOM_COLOR[depth % DOM_COLOR.length]}">
      <div class="dom-element${isHidden ? " dom-element--hidden" : ""}">
        <div class="dom-title">
          <span class="dom-title-name">${escapeHtml(element.localName)}</span>
          <span class="dom-title-attrs dom-title-id">${"" === element.id ? "" : "#" + escapeHtml(element.id)}</span>
          <span class="dom-title-attrs dom-title-class">${[...element.classList].map((name) => `.${escapeHtml(name)}`).join("")}</span>
          <span class="dom-title-attrs dom-title-attributes">${attributes.map((name) => `[${escapeHtml(name)}]`).join(" ")}</span>
        </div>
        ${size}
        ${marginLabel(margin)}
      </div>
      <div data-dom-tool="${escapeHtml(id)}">${children}</div>
    </li>
  </ul>`;
}

function marginLabel(margin) {
  if (margin.every((value) => 0 === value)) {
    return "";
  }
  const [top, right, bottom, left] = margin.map((value) => round(value));
  const values =
    top === right && right === bottom && bottom === left
      ? top
      : `${top} ${right} ${bottom} ${left}`;

  return `<span class="dom-detail-margin">M ${values}</span>`;
}

/**
 * The untransformed border box, fractions included.
 *
 * offsetWidth would round to the whole pixel, and a bounding rect would give the
 * axis-aligned box of the transformed shape — which reads far larger than the
 * element as soon as it is rotated. A resolved `width` is the used content box,
 * so padding and border bring it back to the border box.
 */
function borderBox(element, styles) {
  const width = sum(
    styles.width,
    styles.paddingLeft,
    styles.paddingRight,
    styles.borderLeftWidth,
    styles.borderRightWidth,
  );
  const height = sum(
    styles.height,
    styles.paddingTop,
    styles.paddingBottom,
    styles.borderTopWidth,
    styles.borderBottomWidth,
  );

  if (null !== width && null !== height) {
    return { width, height };
  }

  // An inline box resolves its width and height to `auto`, and only the rect
  // knows how big it ended up.
  return element.getBoundingClientRect();
}

function sum(...values) {
  let total = 0;

  for (const value of values) {
    const parsed = parseFloat(value);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    total += parsed;
  }

  return total;
}

function margins(styles) {
  return [
    styles.marginTop,
    styles.marginRight,
    styles.marginBottom,
    styles.marginLeft,
  ].map((value) => {
    const parsed = parseFloat(value);
    // A negative margin cannot be drawn as an outline band, and NaN comes back
    // from jsdom, where margins resolve to "".
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  });
}

/**
 * Tag names, ids, classes and attribute names all come from the player's code,
 * and land in a template string. Without this an `<img onerror>` typed in the
 * editor would fire inside the panel.
 */
function escapeHtml(value) {
  return String(value).replace(
    /[&<>"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character],
  );
}
