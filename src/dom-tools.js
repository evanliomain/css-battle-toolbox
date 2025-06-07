import "./dom-tools.css";
import { doAsync } from "./utils/do-async";
import { DOM_COLOR } from "./utils/dom-color";
import { htmlToElement } from "./utils/html-to-element";
import { round } from "./utils/round";

let domId = 0;

doAsync(addTool)();

function addTool() {
  const container = document.querySelector(
    ".container__item--output .item__content :first-child",
  );
  if (null === container) {
    return false;
  }
  container.insertAdjacentElement("afterend", htmlToElement(template()));

  appendToTargetContainer(`<div id="dom-highlight"></div>`);
  appendToTargetContainer(`<div id="dom-highlight-margin"></div>`);
  appendToTargetContainer(`<div id="dom-highlight-padding"></div>`);

  const observer = new MutationObserver(() => {
    displayDom();
  });
  const iframe = document.querySelector("iframe");
  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

  // Commence à observer le noeud cible pour les mutations précédemment configurées
  observer.observe(iframeDoc, { attributes: true, childList: true });

  displayDom();

  return true;
}

function template() {
  return `
    <div id="dom-tool">
      <div data-dom-tool="main"></div>
      <div data-dom-box-model></div>
    </div>
  `;
}

function displayDom() {
  const iframe = document.querySelector("iframe");
  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

  // Reset elements
  document
    .querySelector(`[data-dom-tool="main"]`)
    .childNodes.forEach((node) => node.remove());

  domOutline()?.remove();
  appendToTargetContainer(`<div id="dom-outline"></div>`);

  iframeDoc.childNodes.forEach((child) => {
    displayRec(child, "main");
  });

  document.querySelectorAll(`.dom-element`).forEach((el) => {
    el.addEventListener("mouseleave", (event) => {
      // Supposons que chaque élément de l'arborescence DOM contienne une référence au vrai élément DOM
      const targetElement = getDataIdRec(event.target);
      if (targetElement) {
        // Surligne l'élément correspondant
        hideElement();
      }
    });
    el.addEventListener("mouseenter", (event) => {
      // Supposons que chaque élément de l'arborescence DOM contienne une référence au vrai élément DOM
      const targetElement = getDataIdRec(event.target);
      if (targetElement) {
        // Surligne l'élément correspondant
        highlightElement(
          iframeDoc.querySelector(`[data-id="${targetElement}"]`),
        );
      }
    });
  });
}

function getDataIdRec(node) {
  if (null === node) {
    return null;
  }
  if (undefined !== node.dataset.id) {
    return node.dataset.id;
  }
  return getDataIdRec(node.parentElement);
}

function displayRec(node, containerName, depth = 0) {
  const { template, id } = nodeToTemplate(node, depth);

  const element = htmlToElement(template);

  const elementOutline = htmlToElement(`<div></div>`);
  elementOutline.style.setProperty(
    "--outline-color",
    DOM_COLOR[depth % DOM_COLOR.length],
  );
  elementOutline.style.setProperty("z-index", 11 + depth);
  elementOutline.dataset.tagname = node.localName;

  if ("function" !== typeof node.getBoundingClientRect) {
    return;
  }

  const transformProperties = getTransformProperties(node);
  resetTransform(node);
  moveElement(elementOutline, node.getBoundingClientRect());
  borderRadiusElement(elementOutline, node.computedStyleMap());
  applyTransform(node, transformProperties);
  applyTransform(elementOutline, transformProperties);
  domOutline().insertAdjacentElement("beforeend", elementOutline);
  transformElement(
    elementOutline,
    node.computedStyleMap(),
    node.getBoundingClientRect(),
  );

  document
    .querySelector(`[data-dom-tool="${containerName}"]`)
    .insertAdjacentElement("beforeend", element);

  node.dataset.id = id;
  node.childNodes.forEach((child) => {
    if (["head", "style"].includes(child.localName)) {
      return;
    }
    if ("#text" === child.nodeName && "\n" === child.data) {
      return;
    }
    displayRec(child, id, 1 + depth);
  });
}

function nodeToTemplate(node, depth) {
  if ("#text" === node.nodeName) {
    return { template: `<p>text: ${node.data}</p>`, id: "" };
  }
  const id = `node.localName-${domId++}`;

  const attributes = [];
  for (let i = 0; i < node.attributes.length; i++) {
    const attribute = node.attributes.item(i);
    if (
      attribute.name.startsWith("data-") ||
      ["class", "id"].includes(attribute.name)
    ) {
      continue;
    }
    attributes.push(attribute.name);
  }
  const { height, width } = node.getBoundingClientRect();

  return {
    template: `
  <ul data-id="${id}">
    <li style="--dom-level-color: ${DOM_COLOR[depth % DOM_COLOR.length]}">
      <div class="dom-element">
        <div class="dom-title">
          <span class="dom-title-name">${node.localName}</span>
          <span class="dom-title-attrs dom-title-id">${"" === node.id ? "" : "#" + node.id}</span>
          <span class="dom-title-attrs dom-title-class">${[...node.classList].map((c) => `.${c}`).join("")}</span>
          <span class="dom-title-attrs dom-title-attributes">${attributes.map((a) => `[${a}]`).join(" ")}</span>
        </div>
        <span class="dom-detail-size">W ${round(width)} x H ${round(height)}</span>
      </div>
      <div data-dom-tool="${id}"></div>
    </li>
  </ul>`,
    id,
  };
}

// Fonction pour obtenir les styles spécifiés par la page
function getSpecifiedStyles(element) {
  // Cloner l'élément
  const clone = document.createElement(element.tagName);
  document.body.appendChild(clone); // Ajouter temporairement au DOM

  // Récupérer les styles calculés
  const elementStyles = window.getComputedStyle(element);
  const defaultStyles = window.getComputedStyle(clone);

  // Trouver les propriétés qui diffèrent
  const specifiedStyles = {};
  for (let property of elementStyles) {
    if (
      elementStyles.getPropertyValue(property) !==
      defaultStyles.getPropertyValue(property)
    ) {
      specifiedStyles[property] = elementStyles.getPropertyValue(property);
    }
  }

  // Retirer l'élément temporaire
  document.body.removeChild(clone);

  return specifiedStyles;
}

function hideElement() {
  moveHighlightElement({ width: 0, height: 0, x: 0, y: 0 });
  moveElement(document.getElementById("dom-highlight-margin"), {
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    borderWidth: 0,
  });
  moveElement(document.getElementById("dom-highlight-padding"), {
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    borderWidth: 0,
  });
}

function highlightElement(element) {
  const rect = element.getBoundingClientRect();
  const styles = getComputedStyle(element);

  // Dimensions des différentes parties
  const margin = {
    top: parseFloat(styles.marginTop),
    right: parseFloat(styles.marginRight),
    bottom: parseFloat(styles.marginBottom),
    left: parseFloat(styles.marginLeft),
  };

  const border = {
    top: parseFloat(styles.borderTopWidth),
    right: parseFloat(styles.borderRightWidth),
    bottom: parseFloat(styles.borderBottomWidth),
    left: parseFloat(styles.borderLeftWidth),
  };

  const padding = {
    top: parseFloat(styles.paddingTop),
    right: parseFloat(styles.paddingRight),
    bottom: parseFloat(styles.paddingBottom),
    left: parseFloat(styles.paddingLeft),
  };

  const contentBox = {
    width:
      rect.width - border.left - border.right - padding.left - padding.right,
    height:
      rect.height - border.top - border.bottom - padding.top - padding.bottom,
    x: rect.left + border.left + padding.left,
    y: rect.top + border.top + padding.top,
  };
  const paddingBox = {
    width: rect.width - border.left - border.right,
    height: rect.height - border.top - border.bottom,
    x: rect.left + border.left,
    y: rect.top + border.top,
  };
  const marginBox = {
    width: rect.width + margin.left + margin.right,
    height: rect.height + margin.top + margin.bottom,
    x: rect.left - margin.left,
    y: rect.top - margin.top,
  };

  // Update calques
  moveElement(document.getElementById("dom-highlight"), contentBox);
  moveElement(document.getElementById("dom-highlight-margin"), {
    ...marginBox,
    clipPath: polygonWithHole(paddingBox),
  });
  moveElement(document.getElementById("dom-highlight-padding"), {
    ...paddingBox,
    clipPath: polygonWithHole({
      width: contentBox.width,
      height: contentBox.height,
      x: contentBox.x - paddingBox.x,
      y: contentBox.y - paddingBox.y,
    }),
  });
}

function polygonWithHole({ x, y, width, height }) {
  return `polygon(
    0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
    ${x}px ${y}px,
    ${x}px ${y + height}px,
    ${x + width}px ${y + height}px,
    ${x + width}px ${y}px,
    ${x}px ${y}px
  )`;
}

function moveHighlightElement(dimensions) {
  moveElement(document.getElementById("dom-highlight"), dimensions);
}
function moveElement(element, { width, height, x, y, borderWidth, clipPath }) {
  element.style.width = width + "px";
  element.style.height = height + "px";
  element.style.left = x + "px";
  element.style.top = y + "px";
  element.style.borderWidth = borderWidth ?? 0;
  element.style.clipPath = clipPath ?? "none";
}

function borderRadiusElement(element, styles) {
  element.attributeStyleMap.set("border-radius", styles.get("border-radius"));
}

function getTransformProperties(element) {
  return {
    transform: element.computedStyleMap().get("transform"),
    rotate: element.computedStyleMap().get("rotate"),
    scale: element.computedStyleMap().get("scale"),
    translate: element.computedStyleMap().get("translate"),
  };
}
function resetTransform(element) {
  element.attributeStyleMap.set("transform", "none");
  element.attributeStyleMap.set("rotate", "none");
  element.attributeStyleMap.set("scale", "none");
  element.attributeStyleMap.set("translate", "none");
}
function applyTransform(element, style) {
  element.attributeStyleMap.set("transform", style.transform ?? "none");
  element.attributeStyleMap.set("rotate", style.rotate ?? "none");
  element.attributeStyleMap.set("scale", style.scale ?? "none");
  element.attributeStyleMap.set("translate", style.translate ?? "none");
}
function transformElement(element, styles, { width, height }) {
  element.style.transformOrigin = styles.get("transform-origin").toString();
  element.attributeStyleMap.set("transform-box", styles.get("transform-box"));
  element.attributeStyleMap.set(
    "transform-style",
    styles.get("transform-style"),
  );
}

function appendToTargetContainer(template) {
  targetContainer().insertAdjacentElement("beforeend", htmlToElement(template));
}

// Selector
function targetContainer() {
  return document.querySelector(".target-container");
}
function domOutline() {
  return document.getElementById("dom-outline");
}
