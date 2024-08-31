import { doAsync } from "./utils/do-async";

document
  .querySelector(".container__item--output .hstack .header__title")
  .remove();
addCompareOption();
addGridOption();

doAsync(unCheckSlideNCompare)();

function displayCompare() {
  const target = document.querySelector(".target-container > div:not(#overlay-grid)");
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
    '.header__extra-info input[type="checkbox"]',
  );
  if (null === node) {
    return false;
  }
  node.click();

  return true;
}

function addCompareOption() {
  const option = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.value = "true";
  input.checked = true;

  option.appendChild(input);
  input.insertAdjacentText("afterend", "Compare");

  document
    .querySelector(".container__item--output .header__extra-info .hstack")
    .appendChild(option);

  displayCompare();

  input.addEventListener("input", (e) => {
    displayCompare();
  });
}

function addGridOption() {
  const option = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.value = "true";
  input.checked = true;

  option.appendChild(input);
  input.insertAdjacentText("afterend", "Grid");

  document
    .querySelector(".container__item--output .header__extra-info .hstack")
    .appendChild(option);

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

  input.addEventListener("input", (e) => {
    displayGrid();
  });
}
