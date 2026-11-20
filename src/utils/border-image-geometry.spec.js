import { describe, expect, it } from "vitest";
import {
  layoutBorderImage,
  MAX_TILES,
  parseSides,
  tile,
} from "./border-image-geometry";

const px = (value) => ({ value, unit: "px" });
const pct = (value) => ({ value, unit: "%" });
const num = (value) => ({ value, unit: "" });
const AUTO = { value: 0, unit: "auto", auto: true };
const four = (side) => [side, side, side, side];

/** A 200×100 box, without border, `stretch`. */
function layout(input = {}) {
  return layoutBorderImage({
    box: { width: 200, height: 100 },
    borders: [0, 0, 0, 0],
    slice: four(pct(100)),
    fill: false,
    width: four(num(1)),
    outset: four(num(0)),
    repeat: ["stretch", "stretch"],
    ...input,
  });
}

const drawn = (result) =>
  result.pieces.filter((piece) => piece.drawn).map(({ zone }) => zone);

describe("parseSides", () => {
  it("reads 1 to 4 sides, as margin does", () => {
    expect(parseSides("10").sides).toEqual(four(num(10)));
    expect(parseSides("10 20%").sides).toEqual([
      num(10),
      pct(20),
      num(10),
      pct(20),
    ]);
    expect(parseSides("1 2 3").sides).toEqual([num(1), num(2), num(3), num(2)]);
    expect(parseSides("1 2px 3 4.5e1PX").sides).toEqual([
      num(1),
      px(2),
      num(3),
      px(45),
    ]);
  });

  it("reads fill and auto", () => {
    expect(parseSides("10 fill")).toEqual({ sides: four(num(10)), fill: true });
    expect(parseSides(" auto ").sides).toEqual(four(AUTO));
  });

  it("takes what it cannot read for 0", () => {
    expect(parseSides("calc(1px)").sides).toEqual(four(num(0)));
    expect(parseSides("").sides).toEqual(four(num(0)));
  });
});

describe("layoutBorderImage", () => {
  it("cuts the image as large as the border box", () => {
    const result = layout({ slice: four(pct(25)), width: four(px(10)) });

    expect(result.area).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    expect(result.image).toEqual({ width: 200, height: 100 });
    expect(result.slices).toEqual([25, 50, 25, 50]);
    expect(result.widths).toEqual([10, 10, 10, 10]);
    expect(result.factor).toBe(1);
    expect(drawn(result)).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
    expect(result.pieces[1]).toMatchObject({
      zone: 1,
      kind: "edge",
      axis: "x",
      source: { x: 50, y: 0, width: 100, height: 25 },
      target: { x: 10, y: 0, width: 180, height: 10 },
      tiles: [{ start: 0, size: 180 }],
    });
    expect(result.pieces[4]).toMatchObject({ kind: "middle", drawn: false });
    expect(result.pieces[8]).toMatchObject({
      kind: "corner",
      source: { x: 150, y: 75, width: 50, height: 25 },
      target: { x: 190, y: 90, width: 10, height: 10 },
    });
  });

  it("grows the area with the outsets, in pixels or border widths", () => {
    const result = layout({
      borders: [2, 2, 2, 2],
      zoom: 2,
      outset: [px(5), num(3), num(0), px(-1)],
      width: four(px(1)),
      slice: four(num(10)),
    });

    expect(result.outsets).toEqual([10, 6, 0, 0]);
    expect(result.area).toEqual({ x: 0, y: -10, width: 206, height: 110 });
    expect(result.image).toEqual({ width: 206, height: 110 });
    // Numbers grow with the zoom, as pixels of the image.
    expect(result.slices).toEqual([20, 20, 20, 20]);
    expect(result.widths).toEqual([2, 2, 2, 2]);
  });

  it("clamps the slices to the image, and paints the corners only", () => {
    const result = layout({
      slice: [num(999), pct(50), num(0), pct(50)],
      width: four(px(10)),
    });

    expect(result.slices).toEqual([100, 100, 0, 100]);
    expect(result.warnings.overlap).toEqual({ x: true, y: true });
    // Without a bottom slice, the bottom corners go with it.
    expect(drawn(result)).toEqual([0, 2]);
  });

  it("fills the middle", () => {
    const result = layout({ slice: four(pct(10)), fill: true });

    expect(drawn(result)).toContain(4);
    expect(layout({ slice: four(pct(50)), fill: true }).pieces[4].drawn).toBe(
      false,
    );
  });

  it("takes the widths in border widths, percents of the area, or slices", () => {
    const result = layout({
      borders: [4, 0, 4, 0],
      slice: four(num(7)),
      width: [num(2), pct(10), AUTO, num(3)],
    });

    expect(result.widths).toEqual([8, 20, 7, 0]);
    expect(result.warnings.unbordered).toBe(true);
    expect(drawn(result)).toEqual([1, 2, 5, 7, 8]);
    expect(layout({ borders: [1, 1, 1, 1] }).warnings.unbordered).toBe(false);
  });

  it("shrinks the widths that overlap, all by the same factor", () => {
    const result = layout({ width: [pct(80), pct(60), pct(40), pct(0)] });

    expect(result.factor).toBeCloseTo(100 / 120);
    const shrunk = layout({ width: [px(80), px(150), px(40), px(150)] });
    expect(shrunk.factor).toBeCloseTo(2 / 3);
    expect(shrunk.widths).toEqual([53, 100, 26, 100]);
    expect(shrunk.warnings.shrunk).toBe(true);
    expect(layout({ width: four(px(10)) }).warnings.shrunk).toBe(false);
  });

  it("rounds the widths down, but where they meet", () => {
    const result = layout({ width: [px(7.9), px(99.6), px(2.5), px(100.4)] });

    expect(result.widths).toEqual([7, 100, 2, 100]);
    expect(result.warnings.floored).toBe(true);
    expect(layout({ width: four(px(10)) }).warnings.floored).toBe(false);
  });

  it("never goes below zero", () => {
    expect(layout({ width: four(px(-5)) }).widths).toEqual([0, 0, 0, 0]);
    expect(layout({ slice: four(num(-5)) }).slices).toEqual([0, 0, 0, 0]);
  });

  it("tiles the edges along each axis", () => {
    const result = layout({
      slice: four(num(20)),
      width: four(px(20)),
      repeat: ["round", "space"],
    });

    // Top: 160 long, tiles of 160 in the image.
    expect(result.pieces[1].tiles).toEqual([{ start: 0, size: 160 }]);
    // Left: 60 long, tiles of 60.
    expect(result.pieces[3]).toMatchObject({
      axis: "y",
      tiles: [{ start: 0, size: 60 }],
    });
    expect(result.warnings.noTile).toBe(false);
  });

  it("warns when no tile fits", () => {
    const result = layout({
      slice: four(num(20)),
      width: four(px(40)),
      repeat: ["space", "space"],
    });

    // Top: 120 long, tiles of 160 × 2.
    expect(result.pieces[1].tiles).toEqual([]);
    expect(result.warnings.noTile).toBe(true);
  });

  it("tiles nothing on an edge not drawn", () => {
    const result = layout({ slice: four(num(0)), repeat: ["space", "space"] });

    expect(result.pieces[1]).toMatchObject({ drawn: false, tiles: [] });
    expect(result.warnings.noTile).toBe(false);
  });
});

describe("tile", () => {
  it("stretches a single tile", () => {
    expect(tile("stretch", 100, 30)).toEqual([{ start: 0, size: 100 }]);
    expect(tile("space", 100, 0)).toEqual([{ start: 0, size: 100 }]);
  });

  it("rounds to a whole number of tiles, one at least", () => {
    expect(tile("round", 100, 30)).toEqual([
      { start: 0, size: 100 / 3 },
      { start: 100 / 3, size: 100 / 3 },
      { start: 200 / 3, size: 100 / 3 },
    ]);
    expect(tile("round", 10, 30)).toEqual([{ start: 0, size: 10 }]);
  });

  it("spaces whole tiles, or none", () => {
    expect(tile("space", 100, 30)).toEqual([
      { start: 2.5, size: 30 },
      { start: 35, size: 30 },
      { start: 67.5, size: 30 },
    ]);
    expect(tile("space", 20, 30)).toEqual([]);
  });

  it("repeats tiles from the middle, cut at both ends", () => {
    expect(tile("repeat", 100, 30)).toEqual([
      { start: -25, size: 30 },
      { start: 5, size: 30 },
      { start: 35, size: 30 },
      { start: 65, size: 30 },
      { start: 95, size: 30 },
    ]);
  });

  it("leaves out too many tiles", () => {
    const length = (MAX_TILES + 1) * 2;

    expect(tile("round", length, 2)).toBeNull();
    expect(tile("space", length, 2)).toBeNull();
    expect(tile("repeat", length, 2)).toBeNull();
    expect(tile("repeat", MAX_TILES * 2, 2)).toHaveLength(MAX_TILES + 1);
  });
});
