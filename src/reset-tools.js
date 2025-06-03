import { changeCode } from "./utils/change-code";
import { doAsync } from "./utils/do-async";

doAsync(init)();

function init() {
  const container = document.querySelector("[contenteditable]");

  if (null === container) {
    return false;
  }
  // Reset code with simpler version
  changeCode(reset);

  return true;
}

function reset(code) {
  return chrome.storage.sync.get("strDefaultCode").then((items) => {
    if (
      code ===
      "<div></div><style>  div {    width: 100px;    height: 100px;    background: #dd6b4d;  }</style><!-- OBJECTIVE --><!-- Write HTML/CSS in this editor and replicate the given target image in the least code possible. What you write here, renders as it is --><!-- SCORING --><!-- The score is calculated based on the number of characters you use (this comment included :P) and how close you replicate the image. Read the FAQS (https://cssbattle.dev/faqs) for more info. --><!-- IMPORTANT: remove the comments before submitting -->"
    ) {
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
