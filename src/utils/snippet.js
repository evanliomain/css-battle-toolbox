// Shared by both halves of the snippet tool: the content script, and the
// script it injects into the page.

/** Asks the page script to add the completions to the current editor. */
export const ATTACH_EVENT = "cbt-snippet-attach";

/** The palette cssbattle shows under the target. */
export const TARGET_COLORS = ".colors-list__color";

/** @returns {string[]} the colors of the target, as the site shows them */
export function targetColors() {
  return Array.from(document.querySelectorAll(TARGET_COLORS), (node) =>
    node.innerText.trim(),
  );
}

/**
 * The CSS class of a color's swatch in the completion list. CodeMirror turns
 * each word of an option's `type` into a `cm-completionIcon-<word>` class.
 *
 * @param {string} color
 */
export function swatchType(color) {
  return `cbt-color-${color.replace("#", "").toLowerCase()}`;
}
