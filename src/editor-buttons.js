import { addButton } from "./utils/add-button";
import { changeCode } from "./utils/change-code";
import { doAsync } from "./utils/do-async";
import { minify } from "./utils/minify";
import { prettify } from "./utils/prettify";

addButton("Minify", () => changeCode(minify));
addButton("Prettify", () => changeCode(prettify));

function markForHide(nthChild) {
  doAsync(() => {
    const button = document.querySelector(
      `.container__item--editor .btn-group > :nth-child(${nthChild})`,
    );

    if (null === button) {
      return false;
    }
    button.dataset.hide = true;
    return true;
  })();
}

markForHide("3");
markForHide("4");
markForHide("5");
markForHide("6");
