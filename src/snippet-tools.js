import "./snippet-tools.css";
import pageScript from "./snippet-page.js?script&module";
import { injectPageScript } from "./utils/inject-page-script";
import { mount } from "./utils/mount";
import {
  ATTACH_EVENT,
  swatchType,
  TARGET_COLORS,
  targetColors,
} from "./utils/snippet";

const SCRIPT_ID = "cbt-snippet-script";

mount("snippet-tools", {
  selectors: {
    editor: ".cm-content",
    // Without the palette there would be nothing to suggest.
    colors: { all: TARGET_COLORS },
  },
  init(_, onCleanup) {
    const swatches = document.createElement("style");
    swatches.id = "cbt-snippet-swatches";
    swatches.textContent = targetColors()
      // Read from the page and written into a stylesheet: hex colors only.
      .filter((color) => /^#[\da-f]{3,8}$/i.test(color))
      .map(
        (color) =>
          `.cm-completionIcon-${swatchType(color)}{--cbt-swatch:${color}}`,
      )
      .join("\n");
    document.head.append(swatches);
    onCleanup(() => swatches.remove());

    // The completions must be added from the page's own JS world.
    injectPageScript(SCRIPT_ID, pageScript);
    // Each battle gets a new editor, which the page script must reach again.
    document.dispatchEvent(new CustomEvent(ATTACH_EVENT));
  },
});
