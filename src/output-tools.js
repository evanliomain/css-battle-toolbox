import "./output-tools.css";
import { doAsync } from "./utils/do-async";
import { htmlToElement } from "./utils/html-to-element";

document
  .querySelector(".container__item--output .hstack .header__title")
  .remove();
addCompareOption();
addGridOption();
addOutlineOption();
addBackgroundOption();

doAsync(unCheckSlideNCompare)();
doAsync(displayDiff)();

function displayCompare(display) {
  document.body.classList.toggle("compare-tool", display);

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

function createOutline() {
  const iframe = document.querySelector("iframe");
  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

  const observer = new MutationObserver(() => {
    if (iframe.classList.contains("display-ouline")) {
      injectOutlineStyle();
    }
  });

  // Commence à observer le noeud cible pour les mutations précédemment configurées
  observer.observe(iframeDoc, { attributes: true, childList: true });
}

function createBackground() {
  const iframe = document.querySelector("iframe");
  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

  const observer = new MutationObserver(() => {
    if (iframe.classList.contains("display-background")) {
      injectBackgroundStyle();
    }
  });

  // Commence à observer le noeud cible pour les mutations précédemment configurées
  observer.observe(iframeDoc, { attributes: true, childList: true });
}

function displayOutline() {
  const iframe = document.querySelector("iframe");
  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

  if (!iframe.classList.contains("display-ouline")) {
    iframe.classList.add("display-ouline");
    injectOutlineStyle();
  } else {
    iframe.classList.remove("display-ouline");
    iframeDoc.head.querySelector("[data-outline]")?.remove();
  }
}

function displayBackground() {
  const iframe = document.querySelector("iframe");
  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

  if (!iframe.classList.contains("display-background")) {
    iframe.classList.add("display-background");
    injectBackgroundStyle();
  } else {
    iframe.classList.remove("display-background");
    iframeDoc.head.querySelector("[data-background]")?.remove();
  }
}

function injectOutlineStyle() {
  const iframe = document.querySelector("iframe");
  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

  // Injecter du CSS dans l'iframe
  const style = iframeDoc.createElement("style");
  style.type = "text/css";
  style.setAttribute("data-outline", 0);
  iframeDoc.head.appendChild(style);
  style.setAttribute("data-style", "1");
  style.innerHTML = `* {
    position: relative;
    &:before {
      content: '';
      position: absolute;
      inset: 0;
      outline: 4px dotted var(--outline-color);
      outline-offset: -2px;
      z-index: 10;
    }
    --outline-color: red;
    * {
      --outline-color: blue;
      * {
        --outline-color: green;
        * {
          --outline-color: yellow;
          * {
            --outline-color: pink;
            * {
              --outline-color: aqua;
              * {
                --outline-color: blueviolet;
                * {
                  --outline-color: brown;
                }
              }
            }
          }
        }
      }
    }
  }`;
}

function injectBackgroundStyle() {
  const iframe = document.querySelector("iframe");
  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

  // Injecter du CSS dans l'iframe
  const style = iframeDoc.createElement("style");
  style.type = "text/css";
  style.setAttribute("data-background", 0);
  iframeDoc.head.appendChild(style);
  style.setAttribute("data-style", "1");
  style.innerHTML = `* {
    position: relative;
    &:before {
      content: '';
      position: absolute;
      inset: 0;
      background-color: var(--outline-color);
      opacity: 0.4;
      z-index: 10;
    }
    --outline-color: red;
    * {
      --outline-color: blue;
      * {
        --outline-color: green;
        * {
          --outline-color: yellow;
          * {
            --outline-color: pink;
            * {
              --outline-color: aqua;
              * {
                --outline-color: blueviolet;
                * {
                  --outline-color: brown;
                }
              }
            }
          }
        }
      }
    }
  }`;
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
  label.setAttribute("data-hint", "Slide and Compare");
  label.setAttribute("aria-label", "Slide and Compare");
  label.classList = "hint--bottom-right";

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
  label.setAttribute("data-hint", "Show the difference");
  label.setAttribute("aria-label", "Show the difference");
  label.classList = "hint--bottom-right";

  label.addEventListener("change", (e) => {
    document.body.classList.toggle("diff-tool", e.target.checked);
  });

  return true;
}

function addCompareOption() {
  const template = `
  <label
    class="hint--bottom"
    aria-label="Show the target on output"
    data-hint="Show the target on output"
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

  const target = document.querySelector(
    ".target-container > div:not(#overlay-grid)",
  );
  target.id = "overlay-compare";

  displayCompare(true);

  document
    .getElementById("output-compare-input")
    .addEventListener("input", (e) => {
      displayCompare(e.target.checked);
    });
}

function addGridOption() {
  const template = `
  <label
    class="hint--bottom-left"
    aria-label="Show a 10x10 grid on output"
    data-hint="Show a 10x10 grid on output"
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

function addOutlineOption() {
  const template = `
  <label
    class="hint--bottom-left"
    aria-label="Show outline on every tags of the output"
    data-hint="Show outline on every tags of the output"
    style="display: flex; gap: 0.25rem; align-items: center;"
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

  createOutline();

  document
    .getElementById("output-outline-input")
    .addEventListener("input", (e) => {
      displayOutline();
    });
}

function addBackgroundOption() {
  const template = `
  <label
    class="hint--bottom-left"
    aria-label="Show background on every tags of the output"
    data-hint="Show background on every tags of the output"
    style="display: flex; gap: 0.25rem; align-items: center;"
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

  createBackground();

  document
    .getElementById("output-background-input")
    .addEventListener("input", (e) => {
      displayBackground();
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
