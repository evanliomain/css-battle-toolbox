import { HEIGHT, WIDTH } from "./pixel-match";
import { renderCode } from "./render-code";
import { targetImageData } from "./target-image";

/** Only the current target is kept: a battle never needs two. */
let cache = null;

/**
 * The target with each of its colors as the hidden tab draws it.
 *
 * Chrome draws a page in the color space of the screen its window is on, and
 * the render comes back in it: on a wide gamut screen, a saturated color of
 * the code no longer reads as the same color of the target. So the colors of
 * the target are drawn there too, each in a pixel of its own, and the target
 * is compared in the colors they come back with.
 *
 * Done once per target, on the first measure.
 *
 * @param {string} src The `src` of the target image
 * @returns {Promise<ImageData>}
 */
export async function targetAsShown(src) {
  if (cache?.src === src) {
    return cache.data;
  }
  const target = await targetImageData(src);
  const colors = paletteOf(target);
  const shown = await renderCode(paletteCode(colors));
  const data = recolor(target, colors, shown);
  cache = { src, data };
  return data;
}

/**
 * The colors of an image, each once, in the order they first appear.
 *
 * @param {ImageData} image
 * @returns {number[]} As 0xRRGGBB
 */
export function paletteOf(image) {
  const colors = new Set();
  for (let offset = 0; offset < image.data.length; offset += 4) {
    colors.add(rgb(image.data, offset));
  }
  return [...colors];
}

/**
 * A page with a pixel per color, from the top left, a row of 400 after the
 * other. A target has a few dozen colors, nowhere near the 120,000 it holds.
 *
 * @param {number[]} colors
 */
export function paletteCode(colors) {
  const cells = colors
    .map((color) => `<i style="background:#${hex(color)}"></i>`)
    .join("");
  return `<style>body{margin:0}i{float:left;width:1px;height:1px}</style>${cells}`;
}

/**
 * The image with each color swapped for the one its palette pixel came back
 * with.
 *
 * @param {ImageData} image
 * @param {number[]} colors The palette, as `paletteCode` laid it out
 * @param {ImageData} shown The render of that palette
 */
export function recolor(image, colors, shown) {
  const byColor = new Map(colors.map((color, i) => [color, i * 4]));
  const result = new ImageData(WIDTH, HEIGHT);
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const from = byColor.get(rgb(image.data, offset));
    result.data[offset] = shown.data[from];
    result.data[offset + 1] = shown.data[from + 1];
    result.data[offset + 2] = shown.data[from + 2];
    result.data[offset + 3] = 255;
  }
  return result;
}

function rgb(data, offset) {
  return (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2];
}

function hex(color) {
  return color.toString(16).padStart(6, "0");
}

/** Drops the cached target, for the tests. */
export function forgetShownTarget() {
  cache = null;
}
