import { minify } from "./utils/minify";

init();

setInterval(insert, 100);

function getMinifiedNbCharacters() {
  return minify(document.querySelector("[contenteditable]").textContent).length;
}

function init() {
  const el = document.createElement("span");
  el.id = "nb-minified-characters";
  document
    .querySelector(
      '[class^="Editor_editor"] > .item__header > .header__extra-info > .hstack',
    )
    .insertAdjacentElement("afterbegin", el);
}
function insert() {
  document.getElementById("nb-minified-characters").innerText =
    `{${getMinifiedNbCharacters()}}`;
}
