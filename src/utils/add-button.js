/**
 * Prepends a button to the editor's button group.
 *
 * @param {Element} buttonsEditor The `.btn-group` to insert into.
 * @param {string} label
 * @param {() => void} cb
 * @returns {HTMLButtonElement} The button, so callers can remove it on teardown.
 */
export function addButton(buttonsEditor, label, cb) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "button";
  btn.innerText = label;
  btn.dataset.hide = true;
  buttonsEditor.insertAdjacentElement("afterbegin", btn);

  btn.addEventListener("click", cb);

  return btn;
}
