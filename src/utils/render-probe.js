import { captureTab } from "./capture-tab";
import { HEIGHT, WIDTH } from "./pixel-match";

/**
 * What cssbattle writes before the code in its output iframe (its Preview
 * component). It changes the layout, so the render has to have it too.
 */
export const PREFIX = "<style>body{overflow:hidden}</style>";

export const PROBE_ID = "cbt-probe";

/**
 * A swatch of 40% blue over white, shot along with the render. Blended in
 * sRGB, as cssbattle's renderer does, it gives exactly this color. A screen
 * that Chrome blends otherwise (a wide gamut or HDR display) gives a lighter
 * one, and every semi-transparent color of the render is off with it.
 */
const SWATCH_SRGB = [153, 153, 255];
const SWATCH_SIZE = 4;

/**
 * The background of the iframe element, as match-tools.css sets it. The
 * document inside paints an opaque backdrop over it, so this color only shows
 * where the document is not painted yet.
 */
const UNPAINTED = [1, 2, 3];

/** Points that must all be painted: the corners and the middle. */
const PAINT_CHECKS = [
  [0, 0],
  [WIDTH - 1, 0],
  [0, HEIGHT - 1],
  [WIDTH - 1, HEIGHT - 1],
  [WIDTH / 2, HEIGHT / 2],
];

/** Captures of a probe not painted yet, before giving up. */
const MAX_ATTEMPTS = 5;

/**
 * Renders code the way cssbattle scores it, and reads the pixels back.
 *
 * The code goes in an iframe of our own rather than cssbattle's output, which
 * our overlays (target, grid, outlines, diff) may cover. The iframe is drawn at
 * one device pixel per CSS pixel, as the 400×300 headless render of
 * cssbattle, whatever the screen density or the zoom.
 *
 * One probe serves every render: its document is replaced each time.
 */
export function createProbe() {
  const probe = document.createElement("div");
  probe.id = PROBE_ID;
  probe.setAttribute("aria-hidden", "true");
  probe.innerHTML = `
    <iframe sandbox="allow-same-origin" scrolling="no" tabindex="-1"></iframe>
    <div class="cbt-probe-swatch"><div></div></div>`;
  document.body.append(probe);
  const frame = probe.querySelector("iframe");
  const swatch = probe.querySelector(".cbt-probe-swatch");

  // Reused for every read, rather than one canvas per render.
  const context = new OffscreenCanvas(WIDTH, HEIGHT).getContext("2d", {
    willReadFrequently: true,
  });

  return {
    /**
     * @param {string} code
     * @param {Element} anchor Where to put the probe while it is shot: the
     *   output, so the flash shows the same thing at the same place.
     * @returns {Promise<{ image: ImageData, sRGB: boolean } | null>} null when
     *   the probe would not be fully in view, and so not in the capture.
     * @throws when the probe is still not painted after a few captures.
     */
    async render(code, anchor) {
      const density = window.devicePixelRatio;
      const box = placement(anchor.getBoundingClientRect(), density);
      if (null === box) {
        return null;
      }
      probe.style.left = `${box.left}px`;
      probe.style.top = `${box.top}px`;
      // Each CSS pixel of the code on one device pixel.
      frame.style.zoom = String(1 / density);
      swatch.style.zoom = String(1 / density);

      write(frame, PREFIX + code);
      probe.classList.add("is-shown");
      try {
        // Painted with the page, so two frames are enough; shot again all the
        // same should the capture come too early.
        for (let attempt = 1; ; attempt++) {
          await nextPaint();
          const shot = await createImageBitmap(
            await (await fetch(await captureTab())).blob(),
          );
          let result;
          try {
            result = read(context, shot, box);
          } finally {
            shot.close();
          }
          if (null !== result) {
            return result;
          }
          if (MAX_ATTEMPTS === attempt) {
            throw new Error("The probe was never painted");
          }
        }
      } finally {
        probe.classList.remove("is-shown");
      }
    },

    destroy() {
      probe.remove();
    },
  };
}

/**
 * The top left corner of the probe on the device pixel grid, or null when the
 * probe and its swatch would not fit in the viewport.
 */
function placement(rect, density) {
  const left = Math.round(rect.left * density) / density;
  const top = Math.round(rect.top * density) / density;
  const right = left + (WIDTH + SWATCH_SIZE) / density;
  const bottom = top + HEIGHT / density;
  if (
    left < 0 ||
    top < 0 ||
    right > window.innerWidth ||
    bottom > window.innerHeight
  ) {
    return null;
  }
  return { left, top };
}

/**
 * Puts the code in the iframe the way cssbattle does: written in a same-origin
 * iframe, which the page paints along with itself. No doctype, so quirks mode,
 * which cssbattle code relies on (`margin:10 20`, colors without `#`). The
 * sandbox keeps any script of the code from running.
 */
function write(frame, html) {
  const document = frame.contentDocument;
  document.open();
  document.write(html);
  document.close();
}

/** Resolves once what was just shown is on the screen. */
function nextPaint() {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
}

function read(context, shot, box) {
  // The capture is in device pixels.
  const scale = shot.width / window.innerWidth;
  const x = Math.round(box.left * scale);
  const y = Math.round(box.top * scale);

  // The capture is opaque: each draw covers what the canvas held before.
  context.drawImage(shot, x, y, WIDTH, HEIGHT, 0, 0, WIDTH, HEIGHT);
  const image = context.getImageData(0, 0, WIDTH, HEIGHT);
  if (!isPainted(image)) {
    return null;
  }

  // The middle of the swatch, right of the render.
  const middle = SWATCH_SIZE / 2;
  context.drawImage(shot, x + WIDTH + middle, y + middle, 1, 1, 0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  const sRGB = [r, g, b].every(
    (value, i) => Math.abs(value - SWATCH_SRGB[i]) <= 1,
  );

  return { image, sRGB };
}

function isPainted(image) {
  return PAINT_CHECKS.every(([x, y]) => {
    const offset = (y * WIDTH + x) * 4;
    return !UNPAINTED.every((value, i) => image.data[offset + i] === value);
  });
}
