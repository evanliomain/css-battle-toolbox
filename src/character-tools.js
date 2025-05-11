import { doAsync } from "./utils/do-async";
import { htmlToElement } from "./utils/html-to-element";
import { minify } from "./utils/minify";

doAsync(init)();

function getMinifiedNbCharacters() {
  return minify(document.querySelector("[contenteditable]")?.textContent ?? "")
    .length;
}

function init() {
  const container = document.querySelector(
    '[class^="Editor_editor"] > .item__header > .header__extra-info > .hstack',
  );

  if (null === container) {
    return false;
  }

  const el = document.createElement("span");
  el.id = "nb-minified-characters";
  container.insertAdjacentElement(
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

  const observer = new MutationObserver(insert);

  observer.observe(document.querySelector("[contenteditable]"), {
    attributes: true,
    childList: true,
  });

  insert();

  return true;
}
function insert() {
  document.getElementById("nb-minified-characters").innerText =
    `{${getMinifiedNbCharacters()}}`;
}
