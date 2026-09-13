import "./dom-tools.css";
import { DOM_COLOR } from "./utils/dom-color";
import { htmlToElement } from "./utils/html-to-element";
import { mount } from "./utils/mount";
import { removeStale } from "./utils/remove-stale";
import { round } from "./utils/round";

let domId = 0;

const OBSERVE = { attributes: true, childList: true };

const INJECTED_IDS = [
  "dom-tool",
  "dom-highlight",
  "dom-highlight-margin",
  "dom-highlight-padding",
  "dom-outline",
];

mount("dom-tools", {
  selectors: {
    container: ".container__item--output .item__content :first-child",
    targetContainer: ".target-container",
    // Excludes the extension's own hidden iframes (unit-tools' calculator
    // and leaderboard-tools' scraper), which a bare "iframe" could match.
    iframe: "iframe:not(#calcFrame):not(.cbt-scraper)",
    iframeDoc: (refs) =>
      refs.iframe.contentDocument ?? refs.iframe.contentWindow?.document,
  },
  init(refs, onCleanup) {
    const { container, targetContainer } = refs;

    // Clear anything a previous mount left on the page before injecting, so the
    // panel and its overlays can never end up duplicated.
    removeStale(...INJECTED_IDS);

    const tool = htmlToElement(template());
    container.insertAdjacentElement("afterend", tool);
    onCleanup(() => tool.remove());

    const overlays = [
      appendToTargetContainer(
        targetContainer,
        `<div id="dom-highlight"></div>`,
      ),
      appendToTargetContainer(
        targetContainer,
        `<div id="dom-highlight-margin"></div>`,
      ),
      appendToTargetContainer(
        targetContainer,
        `<div id="dom-highlight-padding"></div>`,
      ),
      // Created once, then emptied on each rebuild. Re-creating it per rebuild
      // leaked copies, because domOutline() only ever removed the first one.
      appendToTargetContainer(targetContainer, `<div id="dom-outline"></div>`),
    ];
    onCleanup(() => overlays.forEach((overlay) => overlay.remove()));

    let rebuilding = false;
    const observer = new MutationObserver(rebuild);

    // displayRec writes dataset ids and inline transforms onto the iframe's own
    // nodes — the very nodes this observer watches. Rebuilding while connected
    // fed the observer its own mutations, so the tree duplicated without end.
    function rebuild() {
      if (rebuilding) {
        return;
      }
      rebuilding = true;
      observer.disconnect();
      try {
        displayDom(refs);
      } finally {
        observer.observe(refs.iframeDoc, OBSERVE);
        rebuilding = false;
      }
    }

    // Start watching the target node for the mutations configured above
    observer.observe(refs.iframeDoc, OBSERVE);
    onCleanup(() => observer.disconnect());

    rebuild();

    onCleanup(() => {
      domId = 0;
    });
  },
});

function template() {
  return `
    <div id="dom-tool">
      <div data-dom-tool="main"></div>
      <div data-dom-box-model></div>
    </div>
  `;
}

function displayDom({ iframeDoc, targetContainer }) {
  const main = document.querySelector(`[data-dom-tool="main"]`);
  if (null === main) {
    return;
  }

  // Reset elements. `replaceChildren` rather than iterating `childNodes`, which
  // is a live list: removing while walking it skipped every other node, so each
  // rebuild left residue behind and the tree grew without bound.
  main.replaceChildren();
  domOutline()?.replaceChildren();

  // Ids are handed out fresh per rebuild, and they pair the panel's [data-id]
  // with the iframe node it describes, so the counter restarts with the tree.
  domId = 0;

  Array.from(iframeDoc.childNodes).forEach((child) => {
    displayRec(child, "main");
  });

  // The .dom-element nodes are rebuilt on every call, so these listeners go away
  // with them — no need to unregister them.
  document.querySelectorAll(`.dom-element`).forEach((el) => {
    el.addEventListener("mouseleave", (event) => {
      // Each DOM tree entry carries a reference to the real DOM element
      const targetElement = getDataIdRec(event.target);
      if (targetElement) {
        // Highlight the matching element
        hideElement();
      }
    });
    el.addEventListener("mouseenter", (event) => {
      // Each DOM tree entry carries a reference to the real DOM element
      const targetElement = getDataIdRec(event.target);
      if (targetElement) {
        const match = iframeDoc.querySelector(`[data-id="${targetElement}"]`);
        if (null !== match) {
          // Highlight the matching element
          highlightElement(match);
        }
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
      ["style", "class", "id"].includes(attribute.name)
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

// Returns the styles the page actually specifies for an element
function getSpecifiedStyles(element) {
  // Clone the element
  const clone = document.createElement(element.tagName);
  document.body.appendChild(clone); // Temporarily attach it to the DOM

  // Read the computed styles
  const elementStyles = window.getComputedStyle(element);
  const defaultStyles = window.getComputedStyle(clone);

  // Keep only the properties that differ
  const specifiedStyles = {};
  for (let property of elementStyles) {
    if (
      elementStyles.getPropertyValue(property) !==
      defaultStyles.getPropertyValue(property)
    ) {
      specifiedStyles[property] = elementStyles.getPropertyValue(property);
    }
  }

  // Drop the temporary element
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

  // Sizes of each box-model part
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

  // Update the layers
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
  // The overlays are removed on teardown, but hover handlers can still fire.
  if (null === element) {
    return;
  }
  element.style.width = width + "px";
  element.style.height = height + "px";
  element.style.left = x + "px";
  element.style.top = y + "px";
  element.style.borderWidth = borderWidth ?? 0;
  element.style.clipPath = clipPath ?? "none";
}

function borderRadiusElement(element, styles) {
  element.attributeStyleMap.set("border-radius", styles.get("border-radius"));
  element.attributeStyleMap.set("corner-shape", styles.get("corner-shape"));
  element.attributeStyleMap.set("border-shape", styles.get("border-shape"));
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

function appendToTargetContainer(targetContainer, template) {
  const element = htmlToElement(template);
  targetContainer.insertAdjacentElement("beforeend", element);
  return element;
}

// Selector
function domOutline() {
  return document.getElementById("dom-outline");
}
