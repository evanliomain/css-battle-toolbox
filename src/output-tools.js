import "./output-tools.css";
import { doAsync } from "./utils/do-async";
import { htmlToElement } from "./utils/html-to-element";

document
  .querySelector(".container__item--output .hstack .header__title")
  .remove();

doAsync(async () => {
  const target = document.querySelector(
    ".target-container > div:not(#overlay-grid)",
  );
  if (null === target) {
    return false;
  }
  const config = await chrome.storage.sync.get(null);

  addCompareOption(config);
  addGridOption(config);
  addOutlineOption(config);
  addBackgroundOption(config);
  doAsync(useX2Image)();

  doAsync(unCheckSlideNCompare(config))();
  doAsync(displayDiff(config))();

  flagOutput();
  return true;
})();

function displayCompare(display) {
  document.body.classList.toggle("compare-tool", display);

  const target = document.getElementById("overlay-compare");
  if (null === target) {
    return;
  }
  const opacity = target.attributeStyleMap.get("opacity")?.value ?? 1;
  target.attributeStyleMap.set("opacity", 1 === opacity ? 0.7 : 1);
}

function displayGrid() {
  const target = document.getElementById("overlay-grid");
  const opacity = target.attributeStyleMap.get("opacity").value;
  target.attributeStyleMap.set("opacity", 1 === opacity ? 0 : 1);
}

function displayOutline() {
  targetContainer().classList.toggle("display-outline");
}

function displayBackground() {
  targetContainer().classList.toggle("display-background");
}

function unCheckSlideNCompare(config) {
  return () => {
    const node = document.querySelector(
      '.container__item--output .header__extra-info .hstack input[type="checkbox"]',
    );
    const marker = document.querySelector('[class^="Preview_previewDistance"]');

    if (null === node || null === marker) {
      return false;
    }

    const label = document.querySelector(
      '.container__item--output .header__extra-info .hstack label:has(input[type="checkbox"])',
    );
    const input = document.querySelector(
      '.container__item--output .header__extra-info .hstack label:has(input[type="checkbox"]) input',
    );
    label.insertAdjacentElement(
      "beforeend",
      htmlToElement(slideNCompareIcon()),
    );
    label.setAttribute("data-hint", "Slide and Compare");
    label.setAttribute("aria-label", "Slide and Compare");
    label.classList = "hint--bottom hint--left-if-slidencompare-alone";
    label.style.gap = "0";

    if (!(config.defaultSlideAndCompare ?? false)) {
      node.click();
    }
    marker.style.zIndex = 100;

    input.addEventListener("change", (e) => {
      document.getElementById("dom-outline").style.display = e.srcElement
        .checked
        ? "none"
        : "block";
    });

    return true;
  };
}

function displayDiff(config) {
  return () => {
    const label = document.querySelector(
      ".container__item--output .header__extra-info .hstack label:nth-child(2)",
    );
    if (null === label) {
      return false;
    }
    label.insertAdjacentElement("beforeend", htmlToElement(diffIcon()));
    label.setAttribute("data-hint", "Show the difference");
    label.setAttribute("aria-label", "Show the difference");
    label.classList = "hint--bottom-left";
    label.style.gap = "0";

    label.addEventListener("change", (e) => {
      document.body.classList.toggle("diff-tool", e.target.checked);
    });

    if (config.defaultDifference ?? false) {
      label.querySelector("input").click();
    }

    return true;
  };
}

function addCompareOption(config) {
  const template = `
  <label
    class="hint--bottom hint--left-if-compare-alone"
    aria-label="Show the target on output"
    data-hint="Show the target on output"
    style="display: flex; align-items: center;"
  >
    <input
      id="output-compare-input"
      type="checkbox"
      value="true"
      />
    ${compareIcon()}
  </label>
  `;

  document
    .querySelector(".container__item--output .header__extra-info .hstack")
    .appendChild(htmlToElement(template));

  const target = document.querySelector(
    ".target-container > div:not(#overlay-grid)",
  );
  target.id = "overlay-compare";

  document
    .getElementById("output-compare-input")
    .addEventListener("input", (e) => {
      displayCompare(e.target.checked);
    });

  if (config.defaultTargetOnOutput ?? false) {
    document.getElementById("output-compare-input").click();
  }
}

function addGridOption(config) {
  const template = `
  <label
    class="hint--bottom-left"
    aria-label="Show a 10x10 grid on output"
    data-hint="Show a 10x10 grid on output"
    style="display: flex; align-items: center;"
  >
    <input
      id="output-grid-input"
      type="checkbox"
      value="true"
      />
    ${gridIcon()}
  </label>
  `;

  document
    .querySelector(".container__item--output .header__extra-info .hstack")
    .appendChild(htmlToElement(template));

  // Add grid overlay
  const overlayGrid = htmlToElement(`<div id="overlay-grid"></div>`);
  overlayGrid.style.opacity = "0";

  targetContainer().insertAdjacentElement("afterbegin", overlayGrid);

  document
    .getElementById("output-grid-input")
    .addEventListener("input", (e) => {
      displayGrid();
    });
  if (config.defaultGrid ?? false) {
    document.getElementById("output-grid-input").click();
  }
}

function addOutlineOption(config) {
  const template = `
  <label
    class="hint--bottom-left"
    aria-label="Show outline on every tags of the output"
    data-hint="Show outline on every tags of the output"
    style="display: flex; align-items: center;"
  >
    <input
      id="output-outline-input"
      type="checkbox"
      value="true"
      />
    ${outlineIcon()}
  </label>
  `;

  document
    .querySelector(".container__item--output .header__extra-info .hstack")
    .appendChild(htmlToElement(template));

  document
    .getElementById("output-outline-input")
    .addEventListener("input", (e) => {
      displayOutline();
    });

  if (config.defaultOutline ?? false) {
    document.getElementById("output-outline-input").click();
  }
}

function addBackgroundOption(config) {
  const template = `
  <label
    class="hint--bottom-left"
    aria-label="Show background on every tags of the output"
    data-hint="Show background on every tags of the output"
    style="display: flex; align-items: center;"
  >
    <input
      id="output-background-input"
      type="checkbox"
      value="true"
      />
    ${backgroundIcon()}
  </label>
  `;

  document
    .querySelector(".container__item--output .header__extra-info .hstack")
    .appendChild(htmlToElement(template));

  document
    .getElementById("output-background-input")
    .addEventListener("input", (e) => {
      displayBackground();
    });

  if (config.defaultBackground ?? false) {
    document.getElementById("output-background-input").click();
  }
}

function useX2Image() {
  const img = document.querySelector('[class^="Preview_previewTargetImage__"]');
  if (null === img) {
    return false;
  }

  chrome.storage.sync
    .get("x2Difference")
    .then((items) => applyX2Settings(items.x2Difference));
  chrome.storage.onChanged.addListener((changes) => {
    if (undefined !== changes.x2Difference) {
      applyX2Settings(changes.x2Difference.newValue);
    }
  });

  return true;
}
function applyX2Settings(isApply) {
  const img = document.querySelector('[class^="Preview_previewTargetImage__"]');

  if (isApply) {
    img.src = img.srcset;
  } else {
    img.src = img.src.replace(/@2x\.png/, ".png").replace(/%202x$/, "");
  }
}

function flagOutput() {
  const iframe = document.querySelector("iframe");
  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
  const observer = new MutationObserver(flagOutputDOM);
  observer.observe(iframeDoc, { attributes: true, childList: true });
  flagOutputDOM();

  return true;
}

function flagOutputDOM() {
  const iframe = document.querySelector("iframe");
  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

  for (let i = 0; i < iframeDoc.children.length; i++) {
    const child = iframeDoc.children.item(i);

    flagOutputElement(child);
  }
}
function flagOutputElement(element) {
  element.dataset.tagname = element.localName;

  for (let i = 0; i < element.children.length; i++) {
    const child = element.children.item(i);

    flagOutputElement(child);
  }
}

// Selector
function targetContainer() {
  return document.querySelector(".target-container");
}

// Icons

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
  return `<svg xmlns="http://www.w3.org/2000/svg"
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
  return `<svg xmlns="http://www.w3.org/2000/svg"
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
  return `<svg xmlns="http://www.w3.org/2000/svg"
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

function outlineIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 36 36"
    width="20"
  >
    <rect
      x="10"
      y="10"
      width="15" height="15"
      stroke="currentColor"
      stroke-width="2"
      fill="transparent"
      stroke-linejoin="round"
    />
    <rect
      x="5"
      y="5"
      width="25" height="25"
      fill="transparent"
      stroke="currentColor"
      stroke-width="2"
      stroke-dasharray=".2 4"
      stroke-linecap="round"
    />
  </svg>`;
}
function backgroundIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 64 64"
    width="20"
  >
    <path
      d="M24.02,23h15.96c0.56,0,1.02,0.46,1.02,1.02l0,15.96c0,0.56-0.46,1.02-1.02,1.02H24.02C23.46,41,23,40.54,23,39.98V24.02  C23,23.46,23.46,23,24.02,23z M5,57.98V24.02C5,23.46,5.46,23,6.02,23h13.96c0.56,0,1.02,0.46,1.02,1.02v15.96  c0,1.67,1.35,3.02,3.02,3.02h15.96c0.56,0,1.02,0.46,1.02,1.02l0,13.96c0,0.56-0.46,1.02-1.02,1.02H6.02C5.46,59,5,58.54,5,57.98z   M43,39.98V24.02c0-1.67-1.35-3.02-3.02-3.02H24.02C23.46,21,23,20.54,23,19.98V6.02C23,5.46,23.46,5,24.02,5h33.96  C58.54,5,59,5.46,59,6.02l0,33.96c0,0.56-0.46,1.02-1.02,1.02H44.02C43.46,41,43,40.54,43,39.98z"
      fill="currentColor"
    />
  </svg>`;
}
