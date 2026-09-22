import { DOM_COLOR } from "../utils/dom-color";
import { HIDDEN } from "./ghost-sheet";

/**
 * Draws the tag name of every element over its shape.
 *
 * The layer lives in the ghost document, so a bounding rect taken there is
 * already in the coordinate space the labels are positioned in — placing them
 * from the host would mean converting through the ancestor transforms, which is
 * exactly the arithmetic this tool got rid of.
 *
 * The rect is axis-aligned, so on a rotated element the label sits at the corner
 * of the bounding box rather than of the shape. For a label, that is close
 * enough; the outline itself is exact.
 */
export function renderLabels(ghostDoc, entries) {
  const layer = ghostDoc.createElement("cbt-labels");

  entries.forEach(({ element, depth }) => {
    const rect = element.getBoundingClientRect();
    if (0 === rect.width && 0 === rect.height) {
      return;
    }

    const label = ghostDoc.createElement("cbt-label");
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

  // Appended after <body>, never inside it: a child of body would change what
  // the player's `body > *`, :nth-child and :last-child selectors match, and the
  // ghost would stop laying out like the render.
  ghostDoc.documentElement.insertAdjacentElement("beforeend", layer);
}
