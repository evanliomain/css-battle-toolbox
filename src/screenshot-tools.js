import "./screenshot-tools.css";
import { captureTab } from "./utils/capture-tab";
import { download, getFormattedDate } from "./utils/download";
import { htmlToElement } from "./utils/html-to-element";
import { mount } from "./utils/mount";
import { removeStale } from "./utils/remove-stale";
import { showSnackbar } from "./utils/snackbar";
import { targetId } from "./utils/spa-router";

const BUTTON_ID = "output-screenshot";

/** On <body> while the tab is captured, to keep hints and toasts out of it. */
const CAPTURING = "cbt-capturing";

mount("screenshot-tools", {
  selectors: {
    // The left end of the header, where output-tools drops the "Output"
    // title. Not the strip of checkboxes on the right: options-effect.css hides
    // the output tools by their position in it.
    header:
      ".container__item--output .item__header > :first-child:not(.header__extra-info)",
    targetContainer: ".target-container",
  },
  init({ header, targetContainer }, onCleanup) {
    removeStale(BUTTON_ID);

    const button = htmlToElement(template());
    header.insertAdjacentElement("afterbegin", button);
    onCleanup(() => button.remove());

    async function onClick() {
      // captureVisibleTab allows two calls a second, and a capture is not
      // worth two files anyway.
      button.disabled = true;
      try {
        await screenshot(targetContainer);
      } catch (error) {
        console.error("[cbt] screenshot-tools:", error);
        showSnackbar("Screenshot failed");
      } finally {
        button.disabled = false;
      }
    }
    button.addEventListener("click", onClick);
    onCleanup(() => button.removeEventListener("click", onClick));
  },
});

async function screenshot(targetContainer) {
  const { strScreenshotAction: action = "download" } =
    await chrome.storage.sync.get("strScreenshotAction");

  // #dom-tool belongs to dom-tools, which mounts on its own.
  const png = capture(
    visibleRect([targetContainer, document.getElementById("dom-tool")]),
  );

  if ("download" !== action) {
    // Handed the promise rather than the blob, so the write starts while the
    // click still counts as a user gesture.
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    showSnackbar("Screenshot copied to clipboard");
  }

  if ("copy" !== action) {
    const url = URL.createObjectURL(await png);
    try {
      await download(url, `${targetId()}-${getFormattedDate()}.png`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/**
 * The box around every element given, cut to the viewport: the capture holds
 * nothing past it.
 */
function visibleRect(elements) {
  const rects = elements
    .filter((element) => null !== element)
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => 0 < rect.width && 0 < rect.height);

  const left = Math.max(0, Math.min(...rects.map((rect) => rect.left)));
  const top = Math.max(0, Math.min(...rects.map((rect) => rect.top)));
  const right = Math.min(
    window.innerWidth,
    Math.max(...rects.map((rect) => rect.right)),
  );
  const bottom = Math.min(
    window.innerHeight,
    Math.max(...rects.map((rect) => rect.bottom)),
  );

  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** @returns {Promise<Blob>} The PNG of `rect`, taken from the tab. */
async function capture(rect) {
  if (!(0 < rect.width && 0 < rect.height)) {
    throw new Error("The output is out of view");
  }

  document.body.classList.add(CAPTURING);
  let dataUrl;
  try {
    await nextPaint();
    dataUrl = await captureTab();
  } finally {
    document.body.classList.remove(CAPTURING);
  }

  const shot = await createImageBitmap(await (await fetch(dataUrl)).blob());
  // The capture is in device pixels: this covers the pixel ratio and the zoom.
  const scale = shot.width / window.innerWidth;
  const width = Math.round(rect.width * scale);
  const height = Math.round(rect.height * scale);

  const canvas = new OffscreenCanvas(width, height);
  canvas
    .getContext("2d")
    .drawImage(
      shot,
      Math.round(rect.x * scale),
      Math.round(rect.y * scale),
      width,
      height,
      0,
      0,
      width,
      height,
    );
  shot.close();

  return canvas.convertToBlob({ type: "image/png" });
}

/** Resolves once what CAPTURING hides is off the screen. */
function nextPaint() {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
}

function template() {
  return `
    <button
      type="button"
      id="${BUTTON_ID}"
      class="button button--mini hint--bottom-right"
      aria-label="Screenshot the output"
      data-hint="Screenshot the output"
    >📷</button>`;
}
