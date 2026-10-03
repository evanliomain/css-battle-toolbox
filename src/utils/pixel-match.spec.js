import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HEIGHT, matchImages, WIDTH } from "./pixel-match";

class FakeImageData {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

/** An opaque image of one color, with an optional square of another. */
function image(color, square) {
  const img = new FakeImageData(WIDTH, HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const inSquare =
        undefined !== square &&
        x >= square.x &&
        x < square.x + square.size &&
        y >= square.y &&
        y < square.y + square.size;
      img.data.set(
        [...(inSquare ? square.color : color), 255],
        (y * WIDTH + x) * 4,
      );
    }
  }
  return img;
}

function pixel(img, x, y) {
  return [...img.data.slice((y * WIDTH + x) * 4, (y * WIDTH + x) * 4 + 4)];
}

describe("matchImages", () => {
  beforeEach(() => {
    vi.stubGlobal("ImageData", FakeImageData);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("matches identical images fully, with an empty diff", () => {
    const result = matchImages(image([255, 0, 0]), image([255, 0, 0]));

    expect(result.match).toBe(1);
    expect(result.diffPixels).toBe(0);
    expect(result.diff.data.every((value) => 0 === value)).toBe(true);
  });

  it("counts the wrong pixels of a misplaced square", () => {
    const target = image([255, 255, 255], {
      x: 10,
      y: 10,
      size: 10,
      color: [0, 0, 0],
    });
    const rendered = image([255, 255, 255], {
      x: 30,
      y: 10,
      size: 10,
      color: [0, 0, 0],
    });

    const result = matchImages(target, rendered);

    // The square missing at 10, and the one too many at 30.
    expect(result.diffPixels).toBe(200);
    expect(result.match).toBe(1 - 200 / 120000);
  });

  it("marks only the wrong pixels, on a transparent background", () => {
    const target = image([255, 255, 255], {
      x: 10,
      y: 10,
      size: 10,
      color: [0, 0, 0],
    });
    const rendered = image([255, 255, 255]);

    const { diff } = matchImages(target, rendered);

    expect(pixel(diff, 15, 15)).toEqual([255, 0, 0, 255]);
    expect(pixel(diff, 100, 100)).toEqual([0, 0, 0, 0]);
  });

  it("counts a color 2% off as wrong", () => {
    const result = matchImages(image([200, 100, 50]), image([205, 100, 50]));

    expect(result.diffPixels).toBe(WIDTH * HEIGHT);
    expect(result.match).toBe(0);
  });

  it("lets a difference of one level through", () => {
    const result = matchImages(image([200, 100, 50]), image([201, 100, 50]));

    expect(result.diffPixels).toBe(0);
  });
});
