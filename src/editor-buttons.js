import { addButton } from "./utils/add-button";
import { changeCode } from "./utils/change-code";
import { minify } from "./utils/minify";
import { prettify } from "./utils/prettify";

addButton("Minify", () => changeCode(minify));
addButton("Prettify", () => changeCode(prettify));
