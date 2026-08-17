import "./output-tools.css";
import { doAsync } from "./utils/do-async";
import { htmlToElement } from "./utils/html-to-element";
import { mount } from "./utils/mount";
import { removeStale } from "./utils/remove-stale";

const INJECTED_IDS = [
  "overlay-grid",
  "output-compare-input",
  "output-grid-input",
  "output-outline-input",
  "output-background-input",
];

mount("output-tools", {
  selectors: {
    // Optional: once we remove it, a re-mount must not wait for it to come back.
    headerTitle: {
      optional: ".container__item--output .hstack .header__title",
    },
    hstack: ".container__item--output .header__extra-info .hstack",
    target: ".target-container > div:not(#overlay-grid)",
    targetContainer: ".target-container",
    // Excludes the extension's own hidden iframes (unit-tools' calculator
    // and leaderboard-tools' scraper), which a bare "iframe" could match.
    iframe: "iframe:not(#calcFrame):not(.cbt-scraper)",
    iframeDoc: (refs) =>
      refs.iframe.contentDocument ?? refs.iframe.contentWindow?.document,
  },
  async init(refs, onCleanup, signal) {
    // The option checkboxes live inside a wrapping <label>, so drop the label
    // rather than leaving an empty one behind.
    INJECTED_IDS.forEach((id) =>
      document.getElementById(id)?.closest("label")?.remove(),
    );
    removeStale(...INJECTED_IDS);

    refs.headerTitle?.remove();

    const config = await chrome.storage.sync.get(null);

    addCompareOption(config, refs, onCleanup);
    addGridOption(config, refs, onCleanup);
    addOutlineOption(config, refs, onCleanup);
    addBackgroundOption(config, refs, onCleanup);

    // These three wait on nodes owned by cssbattle that show up later, and they
    // read `label:nth-child(2)` of the hstack we just appended to, so they stay
    // sequenced after the options above.
    doAsync(useX2Image(onCleanup), {
      signal,
      name: "output-tools:x2-image",
    })();
    doAsync(unCheckSlideNCompare(config, onCleanup), {
      signal,
      name: "output-tools:slide-n-compare",
    })();
    doAsync(displayDiff(config, onCleanup), {
      signal,
      name: "output-tools:diff",
    })();

    flagOutput(refs, onCleanup);

    onCleanup(() => {
      document.body.classList.remove("compare-tool", "diff-tool");
      refs.targetContainer.classList.remove(
        "display-outline",
        "display-background",
      );
    });
  },
});

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
  if (null === target) {
    return;
  }
  const opacity = target.attributeStyleMap.get("opacity").value;
  target.attributeStyleMap.set("opacity", 1 === opacity ? 0 : 1);
}

function displayOutline(targetContainer) {
  targetContainer.classList.toggle("display-outline");
}

function displayBackground(targetContainer) {
  targetContainer.classList.toggle("display-background");
}

function unCheckSlideNCompare(config, onCleanup) {
  return () => {
    const node = document.querySelector(
      '.container__item--output .header__extra-info .hstack input[type="checkbox"]',
    );
    const label = document.querySelector(
      '.container__item--output .header__extra-info .hstack label:has(input[type="checkbox"])',
    );
    const input = document.querySelector(
      '.container__item--output .header__extra-info .hstack label:has(input[type="checkbox"]) input',
    );
    if (null === node || null === label || null === input) {
      return false;
    }

    const icon = htmlToElement(slideNCompareIcon());
    label.insertAdjacentElement("beforeend", icon);
    onCleanup(() => icon.remove());

    label.setAttribute("data-hint", "Slide and Compare");
    label.setAttribute("aria-label", "Slide and Compare");
    label.classList = "hint--bottom hint--left-if-slidencompare-alone";
    label.style.gap = "0";

    // Compare against the current state rather than clicking blindly: this is
    // cssbattle's own checkbox, so a re-mount that clicks again would flip the
    // setting to the opposite of what the user asked for.
    setChecked(node, config.defaultSlideAndCompare ?? false);

    const marker = document.querySelector('[class^="Preview_previewDistance"]');

    if (null !== marker) {
      marker.style.zIndex = 100;
    }

    // #dom-outline belongs to dom-tools, which mounts independently.
    function onChange(e) {
      const outline = document.getElementById("dom-outline");
      if (null === outline) {
        return;
      }
      outline.style.display = e.srcElement.checked ? "none" : "block";
    }
    input.addEventListener("change", onChange);
    onCleanup(() => input.removeEventListener("change", onChange));

    return true;
  };
}

function displayDiff(config, onCleanup) {
  return () => {
    const label = document.querySelector(
      ".container__item--output .header__extra-info .hstack label:nth-child(2)",
    );
    if (null === label) {
      return false;
    }
    const icon = htmlToElement(diffIcon());
    label.insertAdjacentElement("beforeend", icon);
    onCleanup(() => icon.remove());

    label.setAttribute("data-hint", "Show the difference");
    label.setAttribute("aria-label", "Show the difference");
    label.classList = "hint--bottom-left";
    label.style.gap = "0";

    function onChange(e) {
      document.body.classList.toggle("diff-tool", e.target.checked);
    }
    label.addEventListener("change", onChange);
    onCleanup(() => label.removeEventListener("change", onChange));

    const input = label.querySelector("input");
    if (null !== input) {
      setChecked(input, config.defaultDifference ?? false);
    }

    return true;
  };
}

/** Clicks a checkbox only when it is not already in the wanted state. */
function setChecked(input, checked) {
  if (input.checked !== checked) {
    input.click();
  }
}

/**
 * Appends a checkbox option to the output header and wires it up.
 *
 * @returns {HTMLInputElement} The checkbox.
 */
function addOption({ hstack, onCleanup, template, id, onInput, checked }) {
  const label = htmlToElement(template);
  hstack.appendChild(label);
  onCleanup(() => label.remove());

  const input = label.querySelector(`#${id}`);
  input.addEventListener("input", onInput);

  if (checked) {
    input.click();
  }

  return input;
}

function addCompareOption(config, refs, onCleanup) {
  // This id is stamped onto a node cssbattle owns, so a leftover copy must be
  // cleared rather than removed — deleting it would tear out the target itself.
  document.getElementById("overlay-compare")?.removeAttribute("id");

  // Tag the overlay *before* addOption may click the checkbox: displayCompare
  // looks the element up by this id and silently no-ops without it.
  refs.target.id = "overlay-compare";

  // displayCompare toggles an inline opacity on this node, which belongs to
  // cssbattle. Restore whatever was there, or the leftover 0.7 makes the next
  // mount's toggle read as "already ghosted" and flip the wrong way.
  const opacity = refs.target.style.opacity;
  onCleanup(() => {
    refs.target.removeAttribute("id");
    refs.target.style.opacity = opacity;
  });

  addOption({
    hstack: refs.hstack,
    onCleanup,
    id: "output-compare-input",
    template: `
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
  `,
    onInput: (e) => displayCompare(e.target.checked),
    checked: config.defaultTargetOnOutput ?? false,
  });
}

function addGridOption(config, refs, onCleanup) {
  // Add grid overlay
  const overlayGrid = htmlToElement(`<div id="overlay-grid"></div>`);
  overlayGrid.style.opacity = "0";
  refs.targetContainer.insertAdjacentElement("afterbegin", overlayGrid);
  onCleanup(() => overlayGrid.remove());

  addOption({
    hstack: refs.hstack,
    onCleanup,
    id: "output-grid-input",
    template: `
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
  `,
    onInput: () => displayGrid(),
    checked: config.defaultGrid ?? false,
  });
}

function addOutlineOption(config, refs, onCleanup) {
  addOption({
    hstack: refs.hstack,
    onCleanup,
    id: "output-outline-input",
    template: `
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
  `,
    onInput: () => displayOutline(refs.targetContainer),
    checked: config.defaultOutline ?? false,
  });
}

function addBackgroundOption(config, refs, onCleanup) {
  addOption({
    hstack: refs.hstack,
    onCleanup,
    id: "output-background-input",
    template: `
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
  `,
    onInput: () => displayBackground(refs.targetContainer),
    checked: config.defaultBackground ?? false,
  });
}

function useX2Image(onCleanup) {
  return () => {
    const img = document.querySelector(
      '[class^="Preview_previewTargetImage__"]',
    );
    if (null === img) {
      return false;
    }

    chrome.storage.sync
      .get("x2Difference")
      .then((items) => applyX2Settings(img, items.x2Difference));

    function onStorageChange(changes) {
      if (undefined !== changes.x2Difference) {
        applyX2Settings(img, changes.x2Difference.newValue);
      }
    }
    chrome.storage.onChanged.addListener(onStorageChange);
    onCleanup(() => chrome.storage.onChanged.removeListener(onStorageChange));

    return true;
  };
}

function applyX2Settings(img, isApply) {
  if (isApply) {
    img.src = img.srcset;
  } else {
    img.src = img.src.replace(/@2x\.png/, ".png").replace(/%202x$/, "");
  }
}

function flagOutput(refs, onCleanup) {
  const observe = { attributes: true, childList: true };
  let flagging = false;
  const observer = new MutationObserver(flag);

  // flagOutputDOM stamps data-tagname onto the iframe's own nodes, which this
  // observer watches. Staying connected while stamping feeds it its own
  // mutations and spins.
  function flag() {
    if (flagging) {
      return;
    }
    flagging = true;
    observer.disconnect();
    try {
      flagOutputDOM(refs.iframeDoc);
    } finally {
      observer.observe(refs.iframeDoc, observe);
      flagging = false;
    }
  }

  observer.observe(refs.iframeDoc, observe);
  onCleanup(() => observer.disconnect());

  flag();
}

function flagOutputDOM(iframeDoc) {
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
