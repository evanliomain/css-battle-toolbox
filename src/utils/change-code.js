/**
 * Fired on `document` when the extension rewrites the code itself: the editor
 * fires no input event then, and the match has to know.
 */
export const CODE_CHANGED = "cbt:code-changed";

export function notifyCodeChanged() {
  document.dispatchEvent(new Event(CODE_CHANGED));
}

/**
 * @param {(code: string) => string | false | Promise<string | false>} cb
 * @param {{ notify?: boolean }} [options] `notify: false` for a rewrite the
 *   user did not ask for, which must not cost a match capture.
 */
export function changeCode(cb, { notify = true } = {}) {
  Promise.resolve(document.querySelector("[contenteditable]").textContent)
    .then((code) => cb(code))
    .then((code) => {
      if (false !== code) {
        document.querySelector("[contenteditable]").textContent = code;
        if (notify) {
          notifyCodeChanged();
        }
      }
    });
}
