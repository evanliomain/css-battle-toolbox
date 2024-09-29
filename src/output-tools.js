import { doAsync } from "./utils/do-async";
import { htmlToElement } from "./utils/html-to-element";
import './output-tools.css';

document
  .querySelector(".container__item--output .hstack .header__title")
  .remove();
addCompareOption();
addGridOption();

doAsync(unCheckSlideNCompare)();
doAsync(displayDiff)();

function displayCompare() {
  const target = document.querySelector(
    ".target-container > div:not(#overlay-grid)",
  );
  const opacity = target.attributeStyleMap.get("opacity").value;
  target.attributeStyleMap.set("opacity", 1 === opacity ? 0.7 : 1);
}

function displayGrid() {
  const target = document.getElementById("overlay-grid");
  const opacity = target.attributeStyleMap.get("opacity").value;
  target.attributeStyleMap.set("opacity", 1 === opacity ? 0 : 1);
}

function unCheckSlideNCompare() {
  const node = document.querySelector(
    '.container__item--output .header__extra-info .hstack input[type="checkbox"]',
  );
  if (null === node) {
    return false;
  }

  const label = document.querySelector(
    '.container__item--output .header__extra-info .hstack label:has(input[type="checkbox"])',
  );
  label.childNodes[2].remove();
  label.insertAdjacentElement("beforeend", htmlToElement(slideNCompareIcon()));
  label.setAttribute("title", "Slide and Compare");

  node.click();

  return true;
}

function displayDiff() {
  const label = document.querySelector(
    ".container__item--output .header__extra-info .hstack label:nth-child(2)",
  );
  if (null === label) {
    return false;
  }
  label.childNodes[2].remove();
  label.insertAdjacentElement("beforeend", htmlToElement(diffIcon()));
  label.setAttribute("title", "Show the difference between target and output");

  return true;
}

function addCompareOption() {
  const template = `
  <label
    title="Show the target on output, with a 0.7 opacity"
    style="display: flex; gap: 0.25rem; align-items: center;"
  >
    <input
      id="output-compare-input"
      type="checkbox"
      value="true"
      checked
      />
    ${compareIcon()}
  </label>
  `;

  document
    .querySelector(".container__item--output .header__extra-info .hstack")
    .appendChild(htmlToElement(template));

  displayCompare();

  document
    .getElementById("output-compare-input")
    .addEventListener("input", (e) => {
      displayCompare();
    });
}

function addGridOption() {
  const template = `
  <label
    title="Show a grid on output : 100x100, 50x50, 10x10"
    style="display: flex; gap: 0.25rem; align-items: center;"
  >
    <input
      id="output-grid-input"
      type="checkbox"
      value="true"
      checked
      />
    ${gridIcon()}
  </label>
  `;

  document
    .querySelector(".container__item--output .header__extra-info .hstack")
    .appendChild(htmlToElement(template));

  // Add grid overlay
  const overlayGrid = document.createElement("div");
  overlayGrid.id = "overlay-grid";
  overlayGrid.style.position = "absolute";
  overlayGrid.style.inset = "0";
  overlayGrid.style.zIndex = "2";
  overlayGrid.style.opacity = "0";
  overlayGrid.style.background = `
      repeating-linear-gradient(90deg,  #0003 0 3px, #0000 0, #0000 100px),
      repeating-linear-gradient(#0003 0 3px, #0000 0, #0000 100px),
      repeating-linear-gradient(90deg, #0003 0 2px, #0000 0, #0000 50px),
      repeating-linear-gradient(#0003 0 2px, #0000 0, #0000 50px),
      repeating-linear-gradient(90deg, #0003 0 1px, #0000 0, #0000 10px),
      repeating-linear-gradient(#0003 0 1px, #0000 0, #0000 10px)
    `;

  document
    .querySelector(".target-container")
    .insertAdjacentElement("afterbegin", overlayGrid);
  displayGrid();

  document
    .getElementById("output-grid-input")
    .addEventListener("input", (e) => {
      displayGrid();
    });
}

function gridIcon() {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" version="1.1"
    viewBox="-5.0 -10.0 110 110"
    width="20"
  >
    <path
      d="m81.25 9.375h-62.5c-5.168 0-9.375 4.2031-9.375 9.375v62.5c0 5.1719 4.207 9.375 9.375 9.375h62.5c5.168 0 9.375-4.2031 9.375-9.375v-62.5c0-5.1719-4.207-9.375-9.375-9.375zm-40.625 50v-18.75h18.75v18.75zm18.75 6.25v18.75h-18.75v-18.75zm-18.75-31.25v-18.75h18.75v18.75zm-25-15.625c0-1.7266 1.4023-3.125 3.125-3.125h15.625v18.75h-18.75zm0 21.875h18.75v18.75h-18.75zm0 40.625v-15.625h18.75v18.75h-15.625c-1.7227 0-3.125-1.3984-3.125-3.125zm68.75 0c0 1.7266-1.4023 3.125-3.125 3.125h-15.625v-18.75h18.75zm0-21.875h-18.75v-18.75h18.75zm0-25h-18.75v-18.75h15.625c1.7227 0 3.125 1.3984 3.125 3.125z"
      fill="currentColor"
    />
  </svg>`;
}

function slideNCompareIcon() {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" version="1.1"
    viewBox="10 10 80 80"
    width="20"
  >
    <g fill="currentColor">
      <path d="M39,32V24H29a8,8,0,0,0-8,8V68a8,8,0,0,0,8,8H39V68H29V32Z" />
      <path d="M55,18H47V82h8V76H71a8,8,0,0,0,8-8V32a8,8,0,0,0-8-8H55ZM71,32V68H55V32Z" />
    </g>
  </svg>`;
}

function diffIcon() {
  return `
  <svg xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 36 36"
    width="20"
  >
    <g fill="currentColor">
      <polygon points="5.91 31.5 31.5 31.5 31.5 5.91 5.91 31.5" />
      <polygon points="23.53 4.5 4.5 23.53 4.5 30.09 30.09 4.5 23.53 4.5" />
      <polygon points="14.15 4.5 4.5 14.15 4.5 20.7 20.7 4.5 14.15 4.5" />
      <polygon points="4.5 4.5 4.5 11.32 11.32 4.5 4.5 4.5" />
    </g>
  </svg>`;
}

function compareIcon() {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" version="1.1"
    viewBox="-5.0 -10.0 110 110"
    width="20"
  >
    <rect
      width="80" height="80" x="10" y="10"
      stroke-width="5"
      stroke="currentColor"
      fill="transparent"
      rx="10"
    />
    <circle
      cx="40" cy="40" r="20"
      fill="transparent"
      stroke="currentColor"
      stroke-width="5"
      stroke-dasharray="10"
      stroke-linecap="round"
    />
    <path
      d="M 65 50 l 15 30 h -30 Z"
      fill="transparent"
      stroke="currentColor"
      stroke-width="5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>`;
}
