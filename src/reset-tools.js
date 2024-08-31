import { changeCode } from "./utils/change-code";

// Reset code with simpler version
changeCode(reset);

function reset(code) {
  if (
    code ===
    "<div></div><style>  div {    width: 100px;    height: 100px;    background: #dd6b4d;  }</style><!-- OBJECTIVE --><!-- Write HTML/CSS in this editor and replicate the given target image in the least code possible. What you write here, renders as it is --><!-- SCORING --><!-- The score is calculated based on the number of characters you use (this comment included :P) and how close you replicate the image. Read the FAQS (https://cssbattle.dev/faqs) for more info. --><!-- IMPORTANT: remove the comments before submitting -->"
  ) {
    return `<style>
  & {

    * {

    }
  }`;
  }
  return false;
}
