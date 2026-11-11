import "./clip-path-tools.css";
import pageScript from "./clip-path-page.js?script&module";
import { ATTACH_EVENT, DETACH_EVENT } from "./utils/clip-path-tool";
import { injectPageScript } from "./utils/inject-page-script";
import { mount } from "./utils/mount";

mount("clip-path-tools", {
  selectors: {
    editor: ".cm-content",
  },
  init(_, onCleanup) {
    // The editor and its caret are only reachable from the page's own JS world.
    injectPageScript("cbt-clip-path-script", pageScript);
    // Each battle gets a new editor, which the page script must reach again.
    document.dispatchEvent(new CustomEvent(ATTACH_EVENT));
    onCleanup(() => document.dispatchEvent(new CustomEvent(DETACH_EVENT)));
  },
});
