import { doAsync } from "./utils/do-async";
import { htmlToElement } from "./utils/html-to-element";

const UNITS = [
  "px",
  "vw",
  "vh",
  "in",
  "cm",
  "mm",
  "pt",
  "pc",
  "em",
  "ex",
  "q",
  "ch",
  "lh",
  "cap",
];

doAsync(addTool)();

function addTool() {
  const container = document.querySelector(
    ".container__item--target .item__content > div",
  );
  if (null === container) {
    return false;
  }
  createComputeIFrame();
  container.insertAdjacentElement("afterend", htmlToElement(template()));
  addListener();
  return true;
}

function createComputeIFrame() {
  const iframe = document.createElement("iframe");
  iframe.id = "calcFrame";
  iframe.width = 400;
  iframe.height = 300;
  iframe.style.setProperty("border", "none");
  iframe.style.setProperty("position", "fixed");
  iframe.style.setProperty("z-index", "-1");
  document.body.appendChild(iframe);

  // Access the document inside the Iframe
  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

  // Create a div inside the Iframe
  const div = document.createElement("div");
  div.id = "calcDiv";
  iframeDoc.body.appendChild(div);
  iframeDoc.body.style.setProperty("margin", "0");
}

function template() {
  return `
    <div id="unit-golf-tool" style="display: grid; gap: 0.5rem; grid-template-columns: repeat(3, 1fr);">
      <div class="input-container" style="margin-bottom: 0;">
        <label for="unit-input-background">Unit</label>
        <input id="unit-input-background" type="text" class="js-unit-input-minify" placeholder="20px" />
      </div>
      <div class="input-container" style="margin-bottom: 0;">
        <label for="font-input-background">Font</label>
        <input id="font-input-background" type="text" class="js-unit-input-minify" placeholder="16px/18px''" />
      </div>
      <div class="input-container" style="margin-bottom: 0;">
        <label for="tolerance-input-background">Tolerance</label>
        <input id="tolerance-input-background" type="text" class="js-unit-input-minify" placeholder="0.2" />
      </div>
      <div id="unit-minify-result" style="grid-column: 1 / span 2;"></div>
    </div>
  `;
}

function addListener() {
  document
    .querySelectorAll(".js-unit-input-minify")
    .forEach((input) => input.addEventListener("input", computeUnit));
}

function computeUnit() {
  const { unit, font, tolerance } = getInputs();
  const calcDiv = getCalcDiv();

  const { units, pxWidth } = measureUnits(calcDiv, unit, font, UNITS);
  let result = [];
  if (pxWidth > 0) {
    result = convertAndSort(pxWidth, units, tolerance);
  }
  displayResults(result);
}

function getCalcDiv() {
  return document
    .getElementById("calcFrame")
    .contentWindow.document.getElementById("calcDiv");
}

function getInputs() {
  let unit = document.getElementById("unit-input-background").value;
  let font = document.getElementById("font-input-background").value;
  let tolerance = document.getElementById("tolerance-input-background").value;
  if (!font) {
    font = "16px/18px''";
  }
  if (!tolerance) {
    tolerance = 0.2;
  }

  // remove all whitespaces
  unit = unit.replace(/\s+/g, "");

  // if no unit is used, assume PX value
  if (!hasValidUnits(unit)) {
    unit += "px";
  }
  return { unit, font, tolerance };
}

function hasValidUnits(value) {
  return UNITS.some((unit) => {
    return value.toLowerCase().includes(unit);
  });
}

function measureUnits(calcDiv, unitValue, fontValue, units) {
  const initialWidth = measureEl(calcDiv, unitValue, fontValue);

  return {
    pxWidth: initialWidth,
    units: units.map((unit) => {
      const measured = measureEl(calcDiv, `${initialWidth}${unit}`, fontValue);
      return {
        name: unit,
        multiplier: measured / initialWidth,
      };
    }, []),
  };
}

function measureEl(calcDiv, widthValue, fontValue) {
  calcDiv.setAttribute("style", `font:${fontValue};width:${widthValue};`);
  const { width } = calcDiv.getBoundingClientRect();
  calcDiv.removeAttribute("style");
  return width;
}

function convertAndSort(px, units, tolerance) {
  return units.map(findBestUnitValue(px, tolerance)).sort((a, b) => {
    const [lnA, lnB] = [a, b].map((item) => item.string.length);
    const [offsetA, offsetB] = [a.pixelOffset, b.pixelOffset].map(Math.abs);
    const lnDiff = lnA - lnB;
    if (offsetA > tolerance) {
      return 1;
    }
    if (lnDiff === 0) {
      return offsetA - offsetB;
    }
    return lnDiff;
  });
}

function findBestUnitValue(px, tolerance) {
  return (unit) => {
    let result = getUnitValues(px, unit);
    const { unitValue } = result;

    if (!Number.isInteger(unitValue, tolerance) && unitValue !== Infinity) {
      for (let i = unitValue.toString().split(".")[1].length - 1; i >= 0; i--) {
        const newUnitValue = clampPrecision(unitValue, i);
        const newResult = getUnitValues(px, unit, newUnitValue);
        const { pixelOffset } = newResult;
        if (Math.abs(pixelOffset) <= tolerance) {
          result = newResult;
        }
      }
    }

    return result;
  };
}

function clampPrecision(number, precision = 2) {
  const pow = Math.pow(10, precision);
  return Number(Math.round(number * pow) / pow);
}

function getUnitValues(px, unit, unitValue) {
  const { name, multiplier } = unit;
  unitValue = unitValue || clampPrecision(px / multiplier);
  const pixelOffset = clampPrecision(unitValue * multiplier - px);
  return {
    unitValue,
    string: `${unitValue}${name}`.replace(/^0./, "."),
    pixelOffset,
  };
}

function displayResults(result) {
  const container = document.getElementById("unit-minify-result");
  container.replaceChildren();
  container.insertAdjacentElement(
    "afterbegin",
    htmlToElement(resultTemplate(result)),
  );
}

function resultTemplate(result) {
  return `
  <div
    style="display: grid; gap: 0.5rem; grid-template-columns: 1fr 1fr; font-family: monospace; text-align: end;">
    ${result
      .map(({ pixelOffset, string }) => ({
        string,
        pixelOffset:
          0 === pixelOffset
            ? ""
            : pixelOffset > 0
              ? `+${pixelOffset}px`
              : `${pixelOffset}px`,
      }))
      .map(
        ({ pixelOffset, string }) => `
    <span
      class="dropdown-menu__item" style="cursor: pointer; padding: 0;"
      onclick="navigator.clipboard.writeText('${string}')"
      title="Click to copy ${string}"
    >
      ${string}
    </span>
    <span style="color: var(--clr-text-lightest-final);">
      ${pixelOffset}
    </span>
    `,
      )
      .join("")}
  </div>
  `;
}
