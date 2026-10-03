import { HEIGHT, WIDTH } from "./pixel-match";

/** Only the current target is kept: a battle never needs two. */
let cache = null;

/**
 * The 1x URL of a target, also when the x2 option has swapped the image for
 * its `srcset`, which leaves a `%202x` behind.
 *
 * @param {string} src
 */
export function oneX(src) {
  return src.replace(/@2x\.png/, ".png").replace(/%202x$/, "");
}

/**
 * The pixels of the target, in 1x.
 *
 * Fetched, not loaded in an `Image`: drawn from a content script, an image of
 * the page taints the canvas as cross-origin, and its pixels can no longer be
 * read. A bitmap made from the fetched bytes never does.
 *
 * @param {string} src The `src` of the target image
 * @returns {Promise<ImageData>}
 */
export async function targetImageData(src) {
  const url = oneX(src);
  if (cache?.url === url) {
    return cache.data;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`The target could not be loaded: ${response.status}`);
  }
  const bitmap = await createImageBitmap(await response.blob());

  const context = new OffscreenCanvas(WIDTH, HEIGHT).getContext("2d", {
    willReadFrequently: true,
  });
  try {
    context.drawImage(bitmap, 0, 0, WIDTH, HEIGHT);
  } finally {
    bitmap.close();
  }
  const data = context.getImageData(0, 0, WIDTH, HEIGHT);
  cache = { url, data };
  return data;
}

/** Drops the cached target, for the tests. */
export function forgetTarget() {
  cache = null;
}
