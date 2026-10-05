import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./render-code", () => ({ renderCode: vi.fn() }));
vi.mock("./target-image", () => ({ targetImageData: vi.fn() }));

class FakeImageData {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

/** A 400×300 image: the given pixels, then the last one's color. */
function image(pixels) {
  const img = new FakeImageData(400, 300);
  for (let i = 0; i < 400 * 300; i++) {
    const [r, g, b] = pixels[Math.min(i, pixels.length - 1)];
    img.data.set([r, g, b, 255], i * 4);
  }
  return img;
}

function pixel(img, i) {
  return [...img.data.slice(i * 4, i * 4 + 4)];
}

describe("screen-colors", () => {
  let module;
  let renderCode;
  let targetImageData;

  beforeEach(async () => {
    vi.stubGlobal("ImageData", FakeImageData);
    module = await import("./screen-colors");
    ({ renderCode } = await import("./render-code"));
    ({ targetImageData } = await import("./target-image"));
    renderCode.mockReset();
    targetImageData.mockReset();
    module.forgetShownTarget();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("paletteOf", () => {
    it("lists each color once, in the order they appear", () => {
      const img = image([
        [255, 0, 0],
        [0, 0, 255],
        [255, 0, 0],
        [16, 32, 48],
      ]);

      expect(module.paletteOf(img)).toEqual([0xff0000, 0x0000ff, 0x102030]);
    });
  });

  describe("paletteCode", () => {
    it("draws a pixel per color, from the top left", () => {
      expect(module.paletteCode([0xff0000, 0x00000a])).toBe(
        '<style>body{margin:0}i{float:left;width:1px;height:1px}</style><i style="background:#ff0000"></i><i style="background:#00000a"></i>',
      );
    });
  });

  describe("recolor", () => {
    it("swaps each color for the one its palette pixel came back with", () => {
      const target = image([
        [255, 0, 0],
        [0, 0, 255],
        [255, 0, 0],
      ]);
      // The red came back a bit off, the blue as it was.
      const shown = image([
        [250, 10, 5],
        [0, 0, 255],
      ]);

      const result = module.recolor(target, [0xff0000, 0x0000ff], shown);

      expect(pixel(result, 0)).toEqual([250, 10, 5, 255]);
      expect(pixel(result, 1)).toEqual([0, 0, 255, 255]);
      expect(pixel(result, 2)).toEqual([250, 10, 5, 255]);
      expect(pixel(result, 119999)).toEqual([250, 10, 5, 255]);
    });

    it("reads a palette pixel past the first row", () => {
      const colors = Array.from({ length: 401 }, (_, i) => i);
      const target = image([[0, 1, 144]]);
      const shownPixels = colors.map(() => [0, 0, 0]);
      shownPixels[400] = [9, 9, 9];

      const result = module.recolor(target, colors, image(shownPixels));

      // 0x000190 is color 400, on the second row of the palette.
      expect(pixel(result, 0)).toEqual([9, 9, 9, 255]);
    });
  });

  describe("targetAsShown", () => {
    it("renders the palette of the target, and gives the target in its colors", async () => {
      targetImageData.mockResolvedValue(
        image([
          [255, 0, 0],
          [0, 0, 255],
        ]),
      );
      renderCode.mockResolvedValue(
        image([
          [250, 10, 5],
          [1, 2, 250],
        ]),
      );

      const result = await module.targetAsShown("/targets/1.png");

      expect(targetImageData).toHaveBeenCalledWith("/targets/1.png");
      expect(renderCode).toHaveBeenCalledWith(
        module.paletteCode([0xff0000, 0x0000ff]),
      );
      expect(pixel(result, 0)).toEqual([250, 10, 5, 255]);
      expect(pixel(result, 1)).toEqual([1, 2, 250, 255]);
    });

    it("renders the palette once per target", async () => {
      targetImageData.mockResolvedValue(image([[1, 2, 3]]));
      renderCode.mockResolvedValue(image([[1, 2, 3]]));

      const first = await module.targetAsShown("/targets/1.png");
      const second = await module.targetAsShown("/targets/1.png");
      await module.targetAsShown("/targets/2.png");

      expect(second).toBe(first);
      expect(renderCode).toHaveBeenCalledTimes(2);
    });

    it("keeps nothing when the palette cannot be rendered", async () => {
      targetImageData.mockResolvedValue(image([[1, 2, 3]]));
      renderCode.mockRejectedValueOnce(new Error("refused"));

      await expect(module.targetAsShown("/targets/1.png")).rejects.toThrow(
        "refused",
      );

      renderCode.mockResolvedValue(image([[1, 2, 3]]));
      await module.targetAsShown("/targets/1.png");
      expect(renderCode).toHaveBeenCalledTimes(2);
    });
  });
});
