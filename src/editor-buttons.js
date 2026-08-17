import { addButton } from "./utils/add-button";
import { changeCode } from "./utils/change-code";
import { doAsync } from "./utils/do-async";
import { minify } from "./utils/minify";
import { mount } from "./utils/mount";
import { prettify } from "./utils/prettify";

// Indices are 1-based and counted after our own two buttons are prepended, so
// these are cssbattle's first four buttons.
const HIDDEN_BUTTONS = [3, 4, 5, 6];

mount("editor-buttons", {
  selectors: {
    buttonGroup: ".container__item--editor .btn-group",
  },
  init({ buttonGroup }, onCleanup, signal) {
    const buttons = [
      addButton(buttonGroup, "Minify", () => changeCode(minify)),
      addButton(buttonGroup, "Prettify", () => changeCode(prettify)),
    ];
    onCleanup(() => buttons.forEach((button) => button.remove()));

    // cssbattle's own buttons can render after the group itself, so each one is
    // polled separately. Never gate the two buttons above on them: that would
    // drop Minify/Prettify entirely on a page that renders fewer buttons.
    HIDDEN_BUTTONS.forEach((nthChild) =>
      markForHide(buttonGroup, nthChild, onCleanup, signal),
    );
  },
});

function markForHide(buttonGroup, nthChild, onCleanup, signal) {
  doAsync(
    () => {
      // `:scope >` keeps this a direct child, which is what the CSS matches on.
      const button = buttonGroup.querySelector(
        `:scope > :nth-child(${nthChild})`,
      );
      if (null === button) {
        return false;
      }
      button.dataset.hide = true;
      onCleanup(() => delete button.dataset.hide);
      return true;
    },
    { name: `editor-buttons:hide-${nthChild}`, signal },
  )();
}
