import "./border-image-tools.css";
import pageScript from "./border-image-page.js?script&module";
import { ATTACH_EVENT, DETACH_EVENT } from "./utils/border-image-tool";
import { injectPageScript } from "./utils/inject-page-script";
import { mount } from "./utils/mount";

mount("border-image-tools", {
  selectors: {
    editor: ".cm-content",
  },
  init(_, onCleanup) {
    // The editor and its caret are only reachable from the page's own JS world.
    injectPageScript("cbt-border-image-script", pageScript);
    // Each battle gets a new editor, which the page script must reach again.
    document.dispatchEvent(new CustomEvent(ATTACH_EVENT));
    onCleanup(() => document.dispatchEvent(new CustomEvent(DETACH_EVENT)));
  },
});
