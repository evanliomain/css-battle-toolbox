import { htmlToElement } from "./utils/html-to-element";
import { minify } from "./utils/minify";

init();

const observer = new MutationObserver(insert);

observer.observe(document.querySelector('[contenteditable]'), { attributes: true, childList: true });

insert();

function getMinifiedNbCharacters() {
  return minify(document.querySelector("[contenteditable]")?.textContent ?? "")
    .length;
}

function init() {
  const el = document.createElement("span");
  el.id = "nb-minified-characters";
  document
    .querySelector(
      '[class^="Editor_editor"] > .item__header > .header__extra-info > .hstack',
    )
    .insertAdjacentElement(
      "afterbegin",
      htmlToElement(`
        <span
          id="nb-minified-characters"
          class="hint--bottom"
          aria-label="Number of characters once your code is minified"
          data-hint="Number of characters once your code is minified"
        ></span>
      `),
    );
}
function insert() {
  document.getElementById("nb-minified-characters").innerText =
    `{${getMinifiedNbCharacters()}}`;
}
