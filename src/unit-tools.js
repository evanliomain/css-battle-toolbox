import { changeCode } from "./utils/change-code";
import { doAsync } from "./utils/do-async";
import { htmlToElement } from "./utils/html-to-element";
import { round } from "./utils/round";

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

const ANGLE_UNITS = ["deg", "rad", "grad", "turn"];

const RE_UNITS = new RegExp(
  "[0-9]+(" +
    UNITS.filter((unit) => !unit.endsWith("px") && !unit.endsWith("in")).join(
      "|",
    ) +
    ")",
  "g",
);

const RE_ANGLE_UNITS = new RegExp(ANGLE_UNITS.join("|"));

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
    <div id="unit-golf-tool" style="display: grid; gap: 0.5rem; grid-template-columns: repeat(3, 1fr) auto;">
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
      <div class="input-container" style="margin-bottom: 0; display: flex; flex-direction: column; justify-content: space-evenly;">
        <button
          type="button"
          id="minifyAllPx"
          class="button button--small hint--top-left"
          aria-label="Replace all px value by a the shortest value"
          data-hint="Replace all px value by a the shortest value"
        >
          ⇾ px ⇽
        </button>
        <button
          type="button"
          id="maxifyAllPx"
          class="button button--small hint--bottom-left"
          aria-label="Replace all value by pixel"
          data-hint="Replace all value by pixel"
        >
          ⇽ px ⇾
        </button>
      </div>
      <div id="unit-minify-result" style="grid-column: 1 / span 2;"></div>
    </div>
  `;
}

function addListener() {
  document
    .querySelectorAll(".js-unit-input-minify")
    .forEach((input) => input.addEventListener("input", computeUnit));

  document.getElementById("minifyAllPx").addEventListener("click", minifyAllPx);
  document.getElementById("maxifyAllPx").addEventListener("click", maxifyAllPx);
}

function computeUnit() {
  const { unit, font, tolerance } = getInputs();
  const calcDiv = getCalcDiv();

  if (RE_ANGLE_UNITS.test(unit)) {
    displayResults(formatAngleResult(convertAngleUnit(unit)));
    return;
  }

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

function getInputs(defaultTolerance = 0.2) {
  let unit = document.getElementById("unit-input-background").value;
  let font = document.getElementById("font-input-background").value;
  let tolerance = document.getElementById("tolerance-input-background").value;
  if (!font) {
    font = "16px/18px''";
  }
  if (!tolerance) {
    tolerance = defaultTolerance;
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
  return [...UNITS, ...ANGLE_UNITS].some((unit) => {
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

function minifyAllPx() {
  const code = document.querySelector("[contenteditable]").innerText;
  changeCode(() =>
    code.replace(/[0-9]+px/g, (unit) => {
      const { font, tolerance } = getInputs(0);

      const { units, pxWidth } = measureUnits(getCalcDiv(), unit, font, UNITS);
      let result = [];

      if (pxWidth > 0) {
        result = convertAndSort(pxWidth, units, tolerance).filter(
          ({ pixelOffset }) => pixelOffset <= tolerance,
        );
      }
      if (result.length === 0) {
        return unit;
      }
      return result[0]?.string;
    }),
  );
}

function maxifyAllPx() {
  const code = document.querySelector("[contenteditable]").innerText;

  changeCode(() =>
    code.replace(RE_UNITS, (unit) => {
      if (unit.endsWith("px") || unit.startsWith("#")) {
        return unit;
      }
      const { font, tolerance } = getInputs(0);

      const { units, pxWidth } = measureUnits(getCalcDiv(), unit, font, UNITS);
      let result = [];

      if (pxWidth > 0) {
        result = convertAndSort(pxWidth, units, tolerance).filter(
          ({ string }) => string.endsWith("px"),
        );
      }
      if (result.length === 0) {
        return unit;
      }
      return result[0]?.string;
    }),
  );
}

function convertAngleUnit(unit) {
  console.log("unit: ", unit + "<");
  if (unit.endsWith("deg")) {
    const value = parseFloat(unit.replace("deg", ""));
    return [
      unit,
      round((Math.PI / 180) * value) + "rad",
      (value * 10) / 9 + "grad",
      value / 360 + "turn",
    ];
  }
  if (unit.endsWith("grad")) {
    const value = parseFloat(unit.replace("grad", ""));
    console.log("value: ", value);
    return [
      round((value * 9) / 10) + "deg",
      round((value * Math.PI) / 200) + "rad",
      unit,
      round((value * 1) / 400) + "turn",
    ];
  }
  if (unit.endsWith("rad")) {
    const value = parseFloat(unit.replace("rad", ""));
    return [
      round((value * 180) / Math.PI) + "deg",
      unit,
      round((value * 200) / Math.PI) + "grad",
      round((value * 0.5) / Math.PI) + "turn",
    ];
  }
  if (unit.endsWith("turn")) {
    const value = parseFloat(unit.replace("turn", ""));
    return [
      round(value * 360) + "deg",
      round(value * 2 * Math.PI) + "rad",
      round(value * 400) + "grad",
      unit,
    ];
  }
  return [];
}

function formatAngleResult(result) {
  return result.map((string) => ({ string, pixelOffset: 0 }));
}
