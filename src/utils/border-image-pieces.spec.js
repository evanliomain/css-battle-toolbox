import { describe, expect, it } from "vitest";
import { layoutBorderImage } from "./border-image-geometry";
import { describePiece, notices, size } from "./border-image-pieces";

const px = (value) => ({ value, unit: "px" });
const pct = (value) => ({ value, unit: "%" });
const num = (value) => ({ value, unit: "" });
const four = (side) => [side, side, side, side];

/** A 200×100 box, without border. */
function layout(input = {}) {
  return layoutBorderImage({
    box: { width: 200, height: 100 },
    borders: [0, 0, 0, 0],
    slice: four(num(20)),
    fill: false,
    width: four(px(20)),
    outset: four(num(0)),
    repeat: ["stretch", "stretch"],
    ...input,
  });
}

/** What happens to each piece. */
function stories(input = {}) {
  const result = layout(input);
  const { repeat = ["stretch", "stretch"], fill = false } = input;
  return result.pieces.map((piece) =>
    describePiece(piece, result, repeat, fill),
  );
}

describe("size", () => {
  it("writes a size to the tenth", () => {
    expect(size({ width: 12.345, height: 0.04 })).toBe("12.3×0");
    expect(size({ width: -19.8, height: 5 })).toBe("0×5");
  });
});

describe("describePiece", () => {
  it("names the pieces, the corners and edges kept as is", () => {
    const [corner, top, , left, middle] = stories();

    expect(corner).toEqual({
      zone: 0,
      name: "Top-left corner",
      behavior: "Kept as is",
      sizes: "20×20 → 20×20",
      warning: "",
      count: 1,
    });
    expect(top).toMatchObject({ name: "Top edge", behavior: "Kept as is" });
    expect(left.name).toBe("Left edge");
    expect(middle).toMatchObject({
      name: "Middle",
      behavior: "",
      warning: "Hidden: needs fill",
      count: 0,
    });
  });

  it("tells how a corner is resized", () => {
    expect(stories({ width: four(px(10)) })[0].behavior).toBe("Shrunk to 50%");
    expect(stories({ width: four(px(40)) })[0].behavior).toBe("Grown to 200%");
    expect(
      stories({ width: [px(10), px(20), px(10), px(5)] })[0].behavior,
    ).toBe("Shrunk: 25% wide, 50% tall");
    expect(
      stories({ width: [px(10), px(30), px(10), px(30)] })[0].behavior,
    ).toBe("Resized: 150% wide, 50% tall");
  });

  it("tells how far an edge is stretched along", () => {
    // 140 long in the image, 160 around the element.
    expect(stories({ slice: four(num(30)) })[1].behavior).toBe(
      "Stretched along, to 114%",
    );
    // 160 long in the image, 120 around the element.
    expect(stories({ width: four(px(40)) })[1].behavior).toBe(
      "Squeezed along, to 75%",
    );
  });

  it("fills the middle", () => {
    expect(stories({ fill: true })[4]).toMatchObject({
      behavior: "Filled: stretched to the room left",
      warning: "",
    });
  });

  it("counts the tiles of an edge", () => {
    const [, top, , left] = stories({
      width: four(px(10)),
      repeat: ["repeat", "round"],
    });

    // Top: 180 long, tiles of 160 × 0.5.
    expect(top).toMatchObject({
      behavior: "2.3 tiles, cut at both ends",
      count: 3,
    });
    // Left: 80 long, tiles of 30: 3, squeezed.
    expect(left).toMatchObject({
      behavior: "3 tiles, squeezed along",
      count: 3,
    });
    // Left: 80 long, tiles of 30.
    expect(
      stories({ width: four(px(10)), repeat: ["stretch", "repeat"] })[3]
        .behavior,
    ).toBe("2.7 tiles, cut at both ends");
  });

  it("tells a rounded tile stretched, or kept", () => {
    // Top: 180 long, tiles of 80: 2, stretched.
    expect(
      stories({ width: four(px(10)), repeat: ["round", "round"] })[1].behavior,
    ).toBe("2 tiles, stretched along");
    // Top: 160 long, a tile of 160.
    expect(stories({ repeat: ["round", "round"] })[1].behavior).toBe(
      "1 tile, kept along",
    );
  });

  it("says when no tile fits", () => {
    expect(
      stories({ width: four(px(40)), repeat: ["space", "space"] })[1],
    ).toMatchObject({
      behavior: "",
      warning: "Not shown: no room for a single tile",
      count: 0,
    });
    expect(
      stories({ width: four(px(5)), repeat: ["space", "space"] })[3].behavior,
    ).toBe("6 tiles, spaced out");
    expect(
      stories({
        slice: four(num(20)),
        width: [px(30), px(10), px(30), px(10)],
        repeat: ["space", "space"],
      })[3].behavior,
    ).toBe("1 tile, spaced out");
  });

  it("warns of tiles too thin to tell", () => {
    expect(
      stories({
        slice: [pct(50), num(20), num(49), num(20)],
        repeat: ["space", "space"],
      })[3],
    ).toMatchObject({ warning: "Tiles only 1px long", count: 60 });
  });

  it("warns of too many tiles", () => {
    expect(
      stories({
        slice: [pct(50), num(20), num(49.9), num(20)],
        width: four(px(1)),
        repeat: ["round", "round"],
      })[3],
    ).toMatchObject({
      behavior: "",
      warning: "Not shown: too many tiles to draw",
      count: 0,
    });
  });

  it("tells why a piece is missing", () => {
    expect(stories({ slice: [num(0), ...four(num(20)).slice(1)] })[1]).toEqual(
      expect.objectContaining({
        warning: "Not shown: the top slice is 0",
        count: 0,
      }),
    );
    expect(stories({ width: [px(20), px(0), px(20), px(20)] })[2].warning).toBe(
      "Not shown: the right width is 0",
    );
    expect(stories({ slice: four(pct(50)) })[1].warning).toBe(
      "Not shown: the slices overlap, nothing is left",
    );
    expect(
      stories({ width: [px(20), px(100), px(20), px(100)] })[1].warning,
    ).toBe("Not shown: no room left on the element");
    expect(stories({ slice: four(pct(50)), fill: true })[4].warning).toBe(
      "Not shown: the slices overlap, nothing is left",
    );
  });
});

describe("notices", () => {
  it("lists what to beware of, and why", () => {
    expect(notices(layout(), { opaque: false })).toEqual([]);
    expect(
      notices(
        layout({
          width: [num(1), px(150), px(20.5), px(150)],
        }),
        { opaque: true },
      ),
    ).toEqual([
      {
        title: "No border to count",
        text: "A width without unit is a multiple of border-width, which is 0 here.",
      },
      {
        title: "Widths shrunk to fit the element",
        text: "Opposite widths are larger than the element together: each one is scaled by 0.67.",
      },
      {
        title: "Widths rounded down to the pixel",
        text: "Chrome draws the border on whole pixels.",
      },
      {
        title: "Read only: var() in the value",
        text: "The panel cannot rewrite a value it cannot read.",
      },
    ]);
  });
});
