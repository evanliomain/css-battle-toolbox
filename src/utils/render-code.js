import { HEIGHT, WIDTH } from "./pixel-match";

export const RENDER_CODE = "cbt:render-code";
export const HOLD_RENDERER = "cbt:hold-renderer";
export const RELEASE_RENDERER = "cbt:release-renderer";

/** Reused for every render, rather than one canvas each. */
let context = null;

/**
 * Renders the code as cssbattle's renderer does, and reads its pixels.
 *
 * The background worker renders it in a minimized window, through the
 * debugger protocol: nothing shows on the page, whatever is drawn over the
 * output, and the render is exact on any screen.
 *
 * @param {string} code
 * @returns {Promise<ImageData>}
 */
export async function renderCode(code) {
  const response = await chrome.runtime.sendMessage({
    type: RENDER_CODE,
    code,
  });
  if ("string" !== typeof response?.dataUrl) {
    throw new Error(response?.error ?? "The code could not be rendered");
  }
  const bitmap = await createImageBitmap(
    await (await fetch(response.dataUrl)).blob(),
  );
  context ??= new OffscreenCanvas(WIDTH, HEIGHT).getContext("2d", {
    willReadFrequently: true,
  });
  try {
    context.drawImage(bitmap, 0, 0);
  } finally {
    bitmap.close();
  }
  return context.getImageData(0, 0, WIDTH, HEIGHT);
}

/** Asks the background worker to get its renderer ready for this tab. */
export function holdRenderer() {
  return chrome.runtime.sendMessage({ type: HOLD_RENDERER });
}

/** Tells the background worker this tab no longer needs its renderer. */
export function releaseRenderer() {
  return chrome.runtime.sendMessage({ type: RELEASE_RENDERER });
}

/** Drops the reused canvas, for the tests. */
export function forgetCanvas() {
  context = null;
}
