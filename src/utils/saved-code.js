import { targetId } from "./spa-router";

// cssbattle's starting code for a battle, as the editor's `textContent` reads it.
export const BOILERPLATE =
  "<div></div><style>  div {    width: 100px;    height: 100px;    background: #dd6b4d;  }</style><!-- OBJECTIVE --><!-- Write HTML/CSS in this editor and replicate the given target image in the least code possible. What you write here, renders as it is --><!-- SCORING --><!-- The score is calculated based on the number of characters you use (this comment included :P) and how close you replicate the image. Read the FAQS (https://cssbattle.dev/faqs) for more info. --><!-- IMPORTANT: remove the comments before submitting -->";

/**
 * The key the extension saves a battle's code under.
 *
 * cssbattle has its own `lastCode-<id>`, but only writes it on `unload`, which
 * Chrome no longer reliably fires — so a refresh loses the code even without the
 * extension. Ours is prefixed so the two never collide.
 *
 * @param {string} [id] The target id, as the /play/<id> URL has it.
 */
export function savedCodeKey(id = targetId()) {
  return `cbt-lastCode-${id}`;
}

/** @param {string} [id] */
export function loadSavedCode(id = targetId()) {
  try {
    return window.localStorage.getItem(savedCodeKey(id));
  } catch {
    return null;
  }
}

/**
 * @param {string} code
 * @param {string} [id]
 */
export function saveCode(code, id = targetId()) {
  try {
    window.localStorage.setItem(savedCodeKey(id), code);
  } catch (error) {
    console.debug("[cbt] could not save the code", error);
  }
}

/**
 * The code in the editor, line breaks included.
 *
 * `textContent` is not enough: CodeMirror renders one `.cm-line` per line and
 * no newline between them, so a save through it would come back as a single
 * line. Its widgets — the empty-editor placeholder, say — are
 * `contenteditable="false"` and are not part of the code.
 *
 * Returns null when the editor is only partly rendered: CodeMirror swaps the
 * lines far out of view for a `.cm-gap`, and saving then would truncate the code.
 *
 * @param {Element} editor The `[contenteditable]` node.
 * @returns {string | null}
 */
export function readEditorCode(editor) {
  const lines = editor.querySelectorAll(".cm-line");
  if (0 === lines.length) {
    return editor.textContent;
  }
  if (null !== editor.querySelector(".cm-gap")) {
    return null;
  }
  return Array.from(lines, lineText).join("\n");
}

function lineText(line) {
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
  let text = "";
  for (let node = walker.nextNode(); null !== node; node = walker.nextNode()) {
    if (null === node.parentElement.closest('[contenteditable="false"]')) {
      text += node.data;
    }
  }
  return text;
}
