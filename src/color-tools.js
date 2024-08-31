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
      <div style="display: grid; gap: 0.1rem; grid-template-columns: repeat(6, 1fr);">
      ${colors.map((color) => `
        <button
          type="button"
          aria-label="Copy color ${color}"
          class="colors-list__color js-trigger-color"
          style="--color: ${color}; font-size: .6em; padding: 0"
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
      <div style="display: grid; gap: 1rem; grid-template-columns: repeat(6, 1fr);">
      ${colors.map((color) => `
        <button
          type="button"
          aria-label="Copy color ${color}"
          class="colors-list__color js-trigger-color"
          style="--color: ${color}; font-size: .6em; padding: 0"
          onclick="document.getElementById('color-input-target').value = '${color}'"
        >
        </button>
        `,
        )
        .join("")}
      </div>
    </div>
    <button
      id="color-result"
      type="button"
      class="colors-list__color js-target-color"
      style="opacity: 0; width: fit-content;"
      onclick="navigator.clipboard.writeText(this.dataset.color.toUpperCase())"
    >
    </button>
    </div>
  `;
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
  if ("" === target) {
    result.style.setProperty("opacity", "0");
    return;
  }
  const colors = findColors(background, target);
  if (0 === colors.length) {
    result.innerText = "No shorter color found";
    result.style.setProperty("--color", "transparent");
    result.style.setProperty("opacity", "1");
    return;
  }
  const [color, err, mix] = colors[0];
  result.innerText = `${color} (${err.toFixed(2)})`;
  result.style.setProperty("--color", mix);
  result.style.setProperty("opacity", "1");
  result.dataset.color = color;
}

function findColors(background, target) {
  const parseHex = (color) =>
    color
      .substr(1)
      .match(/.{1,2}/g)
      .map((n) => parseInt(n, 16));
  const colors = [];
  const [r0, g0, b0] = parseHex(background);
  const [rt, gt, bt] = parseHex(target);
  const threshold = 7;

  for (let r = 0; r < 256; r += 17) {
    for (let g = 0; g < 256; g += 17) {
      for (let b = 0; b < 256; b += 17) {
        for (let a = 0; a < 256; a += 17) {
          const r1 = (r0 * (255 - a)) / 255 + (r * a) / 255;
          const g1 = (g0 * (255 - a)) / 255 + (g * a) / 255;
          const b1 = (b0 * (255 - a)) / 255 + (b * a) / 255;
          const err = Math.hypot(r1 - rt, g1 - gt, b1 - bt);
          if (err < threshold) {
            colors.push([
              toHex([r, g, b, a]),
              err,
              toHex(mixColors([r0, g0, b0], [r, g, b], a / 255)),
            ]);
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
