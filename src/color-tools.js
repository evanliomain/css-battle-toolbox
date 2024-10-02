import "./color-tools.css";
import { doAsync } from "./utils/do-async";
import { htmlToElement } from "./utils/html-to-element";

doAsync(addTool)();

function addTool() {
  const container = document.querySelector(
    ".container__item--target .item__content > div",
  );

  if (null === container) {
    return false;
  }
  container.insertAdjacentElement("beforeend", htmlToElement(template()));
  addListener();
  return true;
}

function template() {
  const colors = getAllColors();
  return `
  <div style="display: grid; gap: 0.5rem; grid-template-columns: 1fr 1fr;">
    <div class="input-container">
      <label for="color-input-background">Background color</label>
      <input id="color-input-background" type="text" class="js-color-input-minify" placeholder="#FFFFFF" />
      <div class="bullet-buttons">
        <button
          type="button"
          aria-label="Reset background"
          data-transition="true"
          data-hint="Reset background"
          class="bullet-color-button hint--top-right bullet-reset-button js-trigger-color"
          onclick="document.getElementById('color-input-background').value = ''"
          style="--color: var(--clr-bg);"
        >
        </button>
      ${colors
        .map(
          (color) => `
        <button
          type="button"
          aria-label="Copy color ${color} as background"
          data-hint="Copy color ${color} as background"
          class="bullet-color-button hint--top-right js-trigger-color"
          style="--color: ${color};"
          onclick="document.getElementById('color-input-background').value = '${color}'"
        >
        </button>
        `,
        )
        .join("")}
      </div>
    </div>
    <div class="input-container">
      <label for="color-input-target">Target color</label>
      <input id="color-input-target" type="text" class="js-color-input-minify" />
      <div class="bullet-buttons">
      ${colors
        .map(
          (color) => `
        <button
          type="button"

          aria-label="Copy color ${color} as foreground"
          data-hint="Copy color ${color} as foreground"
          class="bullet-color-button hint--top-left js-trigger-color"
          style="--color: ${color};"
          onclick="document.getElementById('color-input-target').value = '${color}'"
        >
        </button>
        `,
        )
        .join("")}
      </div>
    </div>
    <div
      id="color-result"
      style="
        grid-column-start: span 2;
        display: flex; flex-direction: row;
        flex-wrap: wrap;
        gap: 8px;
      "
    ></div>
  </div>`;
}

function addListener() {
  document
    .querySelectorAll(".js-color-input-minify")
    .forEach((input) => input.addEventListener("input", computeColor));
  document
    .querySelectorAll(".js-trigger-color")
    .forEach((button) => button.addEventListener("click", computeColor));
}

function getAllColors() {
  const allColors = [];
  document.querySelectorAll(".colors-list__color").forEach((node) => {
    allColors.push(node.innerText);
  });
  return allColors;
}

function computeColor() {
  const background =
    document.getElementById("color-input-background").value || "#ffffff";
  const target = document.getElementById("color-input-target").value;
  const result = document.getElementById("color-result");
  result.replaceChildren();

  if ("" === target || background === target) {
    return;
  }
  const colors = findColors(background, target);
  if (0 === colors.length) {
    return;
  }
  const minError = colors[0][1];
  colors
    .filter(([color, err, mix]) => err <= 1 + minError)
    .filter((_, index) => index < 10)
    .forEach(([color, err, mix]) => {
      result.insertAdjacentElement(
        "beforeend",
        htmlToElement(`
        <button
          type="button"
          class="colors-list__color js-target-color"
          style="width: fit-content; --color: ${mix};"
          data-color="${color}"
          onclick="navigator.clipboard.writeText(this.dataset.color.toUpperCase())"
          title="Click to copy color ${color}, with error from ${target} is ${err}"
        >
          <span>${color}</span>
          <span>(${err.toFixed(0)})</span>
        </button>`),
      );
    });
}

function findColors(background, target) {
  const parseHex = (color) =>
    color
      .substr(1)
      .match(/.{1,2}/g)
      .map((n) => parseInt(n, 16));
  const colors = [];
  const bg = parseHex(background);
  const fg = parseHex(target);
  const threshold = 10;

  for (let r = 0; r < 256; r += 17) {
    for (let g = 0; g < 256; g += 17) {
      for (let b = 0; b < 256; b += 17) {
        for (let a = 0; a < 256; a += 17) {
          const mix = mixColors(bg, [r, g, b], a / 255);
          const rdiff = fg[0] - mix[0];
          const gdiff = fg[1] - mix[1];
          const bdiff = fg[2] - mix[2];
          const err = Math.abs(rdiff) + Math.abs(gdiff) + Math.abs(bdiff);

          if (err < threshold) {
            colors.push([toHex([r, g, b, a]), err, toHex(mix)]);
          }
        }
      }
    }
  }

  colors.sort((a, b) => a[1] - b[1]);
  return colors;
}

function mixColors(bg, fg, alpha) {
  var r = Math.floor(bg[0] * (1 - alpha) + fg[0] * alpha);
  var g = Math.floor(bg[1] * (1 - alpha) + fg[1] * alpha);
  var b = Math.floor(bg[2] * (1 - alpha) + fg[2] * alpha);
  return [r, g, b];
}

function toHex([r, g, b, a]) {
  const hex = (number) =>
    Math.round(number / 17)
      .toString(16)
      .padStart(1, "0");

  let color = `#${hex(r)}${hex(g)}${hex(b)}`;
  const alpha = hex(a ?? 255);
  if ("f" !== alpha) {
    color += alpha;
  }
  return color;
}
