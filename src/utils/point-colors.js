/**
 * The colors of the points of the clip-path tool, their values in the code
 * taking the same.
 */

/** How many colors before they come round again. */
export const COLOR_COUNT = 30;

/**
 * Turning by the golden angle from one point to the next keeps two following
 * points far apart, and the 30 hues spread over the whole wheel.
 */
const GOLDEN_ANGLE = 137.508;

/**
 * Light enough to read on the dark editor, the blues and purples included, and
 * told apart by their lightness too.
 */
const LIGHTNESS = [64, 80, 72];

/** @type {string[]} */
export const POINT_COLORS = Array.from({ length: COLOR_COUNT }, (_, i) => {
  const hue = Math.round((i * GOLDEN_ANGLE) % 360);
  return `hsl(${hue} 90% ${LIGHTNESS[i % LIGHTNESS.length]}%)`;
});
