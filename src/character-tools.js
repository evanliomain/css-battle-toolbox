import { htmlToElement } from "./utils/html-to-element";
import { minify } from "./utils/minify";
import { mount } from "./utils/mount";

mount("character-tools", {
  selectors: {
    container:
      '[class^="Editor-module"] > .item__header > .header__extra-info > .hstack',
    // Declared here because the observer below needs it: guarding on `container`
    // alone and then observing a null editor used to kill the retry loop.
    editor: "[contenteditable]",
  },
  init({ container, editor }, onCleanup) {
    const counter = htmlToElement(`
        <span
          id="nb-minified-characters"
          class="hint--bottom"
          aria-label="Number of characters once your code is minified"
          data-hint="Number of characters once your code is minified"
        ></span>
      `);
    container.insertAdjacentElement("afterbegin", counter);
    onCleanup(() => counter.remove());

    function insert() {
      counter.innerText = `{${getMinifiedNbCharacters(editor)}}`;
    }

    const observer = new MutationObserver(insert);
    observer.observe(editor, { attributes: true, childList: true });
    onCleanup(() => observer.disconnect());

    insert();
  },
});

function getMinifiedNbCharacters(editor) {
  return minify(editor.textContent ?? "").length;
}
