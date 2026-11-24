import { DOM_COLOR } from "../utils/dom-color";
import { HIDDEN } from "./ghost-sheet";

/**
 * Draws the tag name of every element over its shape.
 *
 * The labels live in the overlay, next to the ghost iframe, and never in the
 * ghost document itself. Everything in a document descends from <html>, so a
 * transform on the root — an `offset`, a `rotate`, a `scale`, the stuff of
 * golfed code — moved and turned the labels along with it, and a fixed layer
 * was no way out: a transformed ancestor becomes the box `fixed` is relative to.
 *
 * The ghost iframe fills the overlay from its top-left corner, with no border,
 * so a bounding rect taken in the ghost is already in the overlay's coordinates.
 *
 * The rect is axis-aligned, so on a rotated element the label sits at the corner
 * of the bounding box rather than of the shape. For a label, that is close
 * enough; the outline itself is exact.
 */
export function renderLabels(overlay, entries) {
  const doc = overlay.ownerDocument;
  const layer = doc.createElement("cbt-labels");

  entries.forEach(({ element, depth }) => {
    const rect = element.getBoundingClientRect();
    if (0 === rect.width && 0 === rect.height) {
      return;
    }

    const label = doc.createElement("cbt-label");
    label.textContent = element.localName;
    // Greyed with its contour, so a switched-off layer reads as off from the
    // render alone, without going back to the panel.
    if (element.hasAttribute(HIDDEN)) {
      label.setAttribute(HIDDEN, "");
    }
    label.style.setProperty("--cbt-x", `${rect.left + 4}px`);
    label.style.setProperty("--cbt-y", `${rect.top + 4}px`);
    label.style.setProperty("--cbt-color", DOM_COLOR[depth % DOM_COLOR.length]);
    layer.insertAdjacentElement("beforeend", label);
  });

  // The ghost is rebuilt on every keystroke, and the labels with it.
  overlay
    .querySelectorAll(":scope > cbt-labels")
    .forEach((old) => old.remove());
  overlay.insertAdjacentElement("beforeend", layer);
}
