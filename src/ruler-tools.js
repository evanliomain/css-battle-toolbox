import "./ruler-tools.css";
import { htmlToElement } from "./utils/html-to-element";
import { mount } from "./utils/mount";

/** Size of every cssbattle target, whatever size the image is shown at. */
const TARGET_WIDTH = 400;
const TARGET_HEIGHT = 300;

mount("ruler-tools", {
  selectors: {
    img: ".container__item--target .levelpage__target",
  },
  init({ img }, onCleanup) {
    const ruler = htmlToElement(template());
    const parent = img.parentElement;
    parent.insertAdjacentElement("beforeend", ruler);
    onCleanup(() => ruler.remove());

    function onMove(e) {
      // Measured on every move rather than once: the image shrinks with the
      // window, since cssbattle caps it at the width of its panel.
      const rect = img.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      Object.assign(ruler.style, {
        left: `${rect.left - parentRect.left}px`,
        top: `${rect.top - parentRect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });

      const scale = rect.width / TARGET_WIDTH;
      const x = toTargetPixel(e.clientX - rect.left, scale, TARGET_WIDTH);
      const y = toTargetPixel(e.clientY - rect.top, scale, TARGET_HEIGHT);
      ruler.style.setProperty("--x", `${x * scale}px`);
      ruler.style.setProperty("--y", `${y * scale}px`);
      ruler.querySelector(".cbt-ruler__distance--x").textContent = x;
      ruler.querySelector(".cbt-ruler__distance--y").textContent = y;
      ruler.hidden = false;
    }
    function onLeave() {
      ruler.hidden = true;
    }

    img.addEventListener("mousemove", onMove);
    img.addEventListener("mouseleave", onLeave);
    onCleanup(() => {
      img.removeEventListener("mousemove", onMove);
      img.removeEventListener("mouseleave", onLeave);
    });
  },
});

/**
 * Converts a distance on the displayed image into a target pixel, rounded down
 * like cssbattle's Slide & Compare. Clamped, because the last displayed pixel
 * can round up to one past the edge.
 */
function toTargetPixel(distance, scale, size) {
  return Math.min(Math.max(Math.floor(distance / scale), 0), size - 1);
}

function template() {
  return `
  <div id="cbt-ruler" aria-hidden="true" hidden>
    <div class="cbt-ruler__line cbt-ruler__line--x"></div>
    <div class="cbt-ruler__line cbt-ruler__line--y"></div>
    <div class="cbt-ruler__distance cbt-ruler__distance--x"></div>
    <div class="cbt-ruler__distance cbt-ruler__distance--y"></div>
  </div>
  `;
}
