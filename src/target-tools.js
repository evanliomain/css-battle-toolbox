import "./target-tools.css";
import { doAsync } from "./utils/do-async";
import { htmlToElement } from "./utils/html-to-element";

doAsync(async () => {
  const target = document.querySelector(".container__item--target");
  if (null === target) {
    return false;
  }

  init();

  return true;
})();

function init() {
  addCopyImageUrl();
}

function addCopyImageUrl() {
  const container = document.querySelector(
    ".container__item--target .item__header :first-child",
  );
  if (null === container) {
    return;
  }

  const btn = htmlToElement(template());
  container.insertAdjacentElement("beforeend", btn);
  btn.addEventListener("click", () => {
    // Copy de l'url de l'image dans le clipboard
    navigator.clipboard.writeText(
      document
        .querySelector(".container__item--target img")
        .getAttribute("src"),
    );
  });
}

function template() {
  return `
  <button
    type="button"
    id="cbt-copy-image-url"
    class="button button--mini hint--bottom"
    style="margin-right: 0;"
    aria-label="Copy image url"
    data-hint="Copy image url"
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" x="0" y="0"
    height="20"
    width="20"
    >
      <path
        d="M 32.71 5.57 H 17.15 a 3.85 3.85 0 0 0 -3.85 3.85 v 3.75 h -4 A 3.85 3.85 0 0 0 5.44 17 V 32.58 a 3.86 3.86 0 0 0 3.85 3.85 H 24.85 a 3.85 3.85 0 0 0 3.85 -3.85 V 28.83 h 4 A 3.85 3.85 0 0 0 36.56 25 V 9.42 A 3.86 3.86 0 0 0 32.71 5.57 Z m -7.09 27 a 0.77 0.77 0 0 1 -0.77 0.77 H 9.29 a 0.78 0.78 0 0 1 -0.77 -0.77 V 17 a 0.77 0.77 0 0 1 0.77 -0.77 H 24.85 a 0.76 0.76 0 0 1 0.77 0.77 V 32.58 Z M 33.48 25 a 0.77 0.77 0 0 1 -0.77 0.77 h -4 V 17 a 3.85 3.85 0 0 0 -3.85 -3.85 H 16.38 V 9.42 a 0.77 0.77 0 0 1 0.77 -0.77 H 32.71 a 0.78 0.78 0 0 1 0.77 0.77 Z" />
    </svg>
  </button>
  `;
}
