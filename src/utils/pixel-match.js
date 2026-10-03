import pixelmatch from "pixelmatch";

export const WIDTH = 400;
export const HEIGHT = 300;

/**
 * Fired on `document` with the result of `matchImages` as `detail`, each time
 * the match is measured again.
 */
export const MATCH_MEASURED = "cbt:match-measured";

// The threshold ClawBattle checked against cssbattle's own matches. The default
// 0.1 lets close colors through, which a solution cannot afford.
const THRESHOLD = 0.01;

/**
 * Compares the render with the target, pixel by pixel.
 *
 * @param {ImageData} target
 * @param {ImageData} rendered
 * @returns {{ match: number, diffPixels: number, diff: ImageData }} `diff`
 *   holds only the wrong pixels, in red, on a transparent background: it is
 *   drawn over the output.
 */
export function matchImages(target, rendered) {
  const diff = new ImageData(WIDTH, HEIGHT);
  const diffPixels = pixelmatch(
    target.data,
    rendered.data,
    diff.data,
    WIDTH,
    HEIGHT,
    { threshold: THRESHOLD, diffMask: true },
  );
  return { match: 1 - diffPixels / (WIDTH * HEIGHT), diffPixels, diff };
}
