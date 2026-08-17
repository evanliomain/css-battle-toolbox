import { changeCode } from "./utils/change-code";
import { mount } from "./utils/mount";

// cssbattle's starting code for a battle. The reset only ever replaces exactly
// this, so the user's own work is never touched.
const BOILERPLATE =
  "<div></div><style>  div {    width: 100px;    height: 100px;    background: #dd6b4d;  }</style><!-- OBJECTIVE --><!-- Write HTML/CSS in this editor and replicate the given target image in the least code possible. What you write here, renders as it is --><!-- SCORING --><!-- The score is calculated based on the number of characters you use (this comment included :P) and how close you replicate the image. Read the FAQS (https://cssbattle.dev/faqs) for more info. --><!-- IMPORTANT: remove the comments before submitting -->";

mount("reset-tools", {
  // Deliberately short. The boilerplate, when there is one, is in the editor
  // almost immediately; waiting longer would risk catching a brief boilerplate
  // frame before cssbattle restores saved progress, and overwriting real work.
  timeout: 3000,
  selectors: {
    editor: "[contenteditable]",
    // Waiting for the boilerplate itself, not just for the editor to exist. On a
    // client-side navigation React reuses the editor node, so it still holds the
    // previous battle's code for a moment — checking once there would silently
    // do nothing and never retry.
    boilerplate: (refs) => refs.editor.textContent === BOILERPLATE || undefined,
  },
  init() {
    // Reset code with simpler version
    changeCode(reset);
  },
});

function reset(code) {
  return chrome.storage.sync.get("strDefaultCode").then((items) => {
    if (code === BOILERPLATE) {
      return (
        items.strDefaultCode ??
        `<style>
& {
  background: ;
  * {
  }
}
</style>`
      );
    }
    return false;
  });
}
