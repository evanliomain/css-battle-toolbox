import { describe, expect, it } from "vitest";
import {
  chooseLine,
  editable,
  linesAt,
  outputLines,
  sourceLines,
  valueAt,
  valueText,
} from "./border-image-handles";

/** A 200×100 border box, 10 out on the top, 20 out on the left. */
const LAYOUT = {
  area: { x: -20, y: -10, width: 220, height: 110 },
  image: { width: 220, height: 110 },
  outsets: [10, 0, 0, 20],
  widths: [5, 6, 7, 8],
  slices: [1, 2, 3, 4],
};

const byId = (lines) => Object.fromEntries(lines.map((l) => [l.id, l]));

const number = (value, unit = "") => ({ type: "number", value, unit });

const CTX = {
  zoom: 1,
  borders: [4, 0, 4, 0],
  image: { width: 220, height: 110 },
  area: { width: 200, height: 100 },
  box: {
    width: 200,
    height: 100,
    fontSize: 10,
    rootFontSize: 16,
    viewport: { width: 400, height: 300 },
    units: { lh: 20 },
  },
};

describe("outputLines", () => {
  const lines = byId(outputLines(LAYOUT));

  it("draws the outsets from the border box, outwards", () => {
    expect(lines["outset-0"]).toEqual({
      id: "outset-0",
      group: "outset",
      side: 0,
      axis: "y",
      origin: 0,
      grow: -1,
      at: -10,
      span: [-20, 200],
    });
    expect(lines["outset-1"]).toMatchObject({
      axis: "x",
      origin: 200,
      at: 200,
    });
    expect(lines["outset-2"]).toMatchObject({ origin: 100, grow: 1, at: 100 });
    expect(lines["outset-3"]).toMatchObject({
      origin: 0,
      grow: -1,
      at: -20,
      span: [-10, 100],
    });
  });

  it("draws the widths from the area, inwards", () => {
    expect(lines["width-0"]).toMatchObject({ origin: -10, grow: 1, at: -5 });
    expect(lines["width-1"]).toMatchObject({ origin: 200, grow: -1, at: 194 });
    expect(lines["width-2"]).toMatchObject({ origin: 100, grow: -1, at: 93 });
    expect(lines["width-3"]).toMatchObject({ origin: -20, grow: 1, at: -12 });
  });

  it("lists the outsets first, for the widths to go over them", () => {
    expect(outputLines(LAYOUT).map(({ group }) => group)).toEqual([
      ...Array(4).fill("outset"),
      ...Array(4).fill("width"),
    ]);
  });
});

describe("sourceLines", () => {
  it("draws the slices from the edges of the image, inwards", () => {
    expect(sourceLines(LAYOUT)).toEqual([
      expect.objectContaining({ id: "slice-0", at: 1, span: [0, 220] }),
      expect.objectContaining({ id: "slice-1", at: 218, span: [0, 110] }),
      expect.objectContaining({ id: "slice-2", at: 107, grow: -1 }),
      expect.objectContaining({ id: "slice-3", at: 4, grow: 1 }),
    ]);
  });
});

describe("linesAt", () => {
  const lines = sourceLines(LAYOUT);
  const ids = (point, tolerance = 3) =>
    linesAt(lines, point, tolerance).map(({ id }) => id);

  it("finds the lines near the pointer, the nearest first", () => {
    expect(ids({ x: 50, y: 2 })).toEqual(["slice-0"]);
    expect(ids({ x: 3.5, y: 2 })).toEqual(["slice-3", "slice-0"]);
    expect(ids({ x: 50, y: 50 })).toEqual([]);
  });

  it("finds them a little past their ends only", () => {
    expect(ids({ x: -3, y: 1 })).toEqual(["slice-0"]);
    expect(ids({ x: -4, y: 1 })).toEqual([]);
    expect(ids({ x: 223, y: 1 })).toEqual(["slice-0"]);
    expect(ids({ x: 224, y: 1 })).toEqual([]);
  });
});

describe("chooseLine", () => {
  const lines = byId(outputLines({ ...LAYOUT, widths: [0, 0, 0, 0] }));

  it("takes the line along the move", () => {
    const corner = [lines["width-0"], lines["width-3"]];

    expect(chooseLine(corner, { x: -2, y: 1 }).id).toBe("width-3");
    expect(chooseLine(corner, { x: 0, y: 1 }).id).toBe("width-0");
  });

  it("takes the one the move makes grow", () => {
    const top = [lines["width-0"], lines["outset-0"]];

    expect(chooseLine(top, { x: 0, y: 2 }).id).toBe("width-0");
    expect(chooseLine(top, { x: 0, y: -2 }).id).toBe("outset-0");
  });

  it("takes any line when none goes along the move", () => {
    expect(chooseLine([lines["width-0"]], { x: 5, y: 0 }).id).toBe("width-0");
  });
});

describe("valueAt", () => {
  it("reads the value under the pointer, never below 0", () => {
    const [top, right] = sourceLines(LAYOUT);

    expect(valueAt(top, { x: 0, y: 12 })).toBe(12);
    expect(valueAt(right, { x: 200, y: 0 })).toBe(20);
    expect(valueAt(right, { x: 230, y: 0 })).toBe(0);
  });
});

describe("valueText", () => {
  const text = (group, side, node, px, ctx = CTX, options) =>
    valueText(group, side, node, px, ctx, options);

  it("writes a slice as a number of pixels, or a percent of the image", () => {
    expect(text("slice", 0, number(5), 12.4)).toBe("12");
    expect(text("slice", 0, null, 12.6, { ...CTX, zoom: 2 })).toBe("6");
    expect(text("slice", 1, number(5, "%"), 55)).toBe("25%");
    expect(text("slice", 0, number(5, "%"), 55)).toBe("50%");
    expect(text("slice", 0, number(5, "%"), 56, CTX, { precision: 1 })).toBe(
      "50.9%",
    );
  });

  it("writes a width in border widths, while there is a border", () => {
    expect(text("width", 0, number(1), 10)).toBe("2.5");
    expect(text("width", 2, number(1), 10, CTX, { precision: 1 })).toBe("2.5");
    expect(text("width", 1, number(1), 10)).toBe("10px");
  });

  it("writes a percent of the area", () => {
    expect(text("width", 3, number(1, "%"), 50)).toBe("25%");
  });

  it("writes a length in its unit, before the zoom", () => {
    expect(text("width", 0, number(1, "em"), 25)).toBe("2.5em");
    expect(text("outset", 0, number(1, "lh"), 40, { ...CTX, zoom: 2 })).toBe(
      "1lh",
    );
    expect(text("outset", 0, number(1, "q"), 20)).toBe("21q");
  });

  it("writes pixels for auto or a value left out", () => {
    expect(text("width", 0, { type: "ident", name: "auto" }, 9)).toBe("9px");
    expect(text("outset", 0, null, -3)).toBe("0");
  });

  it("writes nothing it cannot convert", () => {
    expect(text("width", 0, number(1, "cqw"), 9)).toBeNull();
    expect(text("width", 0, { type: "function", name: "calc" }, 9)).toBeNull();
  });
});

describe("editable", () => {
  it("tells the values the tool rewrites", () => {
    expect(editable("slice", null, CTX)).toBe(true);
    expect(editable("slice", number(1), CTX)).toBe(true);
    expect(editable("slice", number(1, "%"), CTX)).toBe(true);
    expect(editable("slice", number(1, "px"), CTX)).toBe(false);
    expect(editable("width", number(1, "px"), CTX)).toBe(true);
    expect(editable("width", number(1, "cqw"), CTX)).toBe(false);
    expect(editable("outset", number(1, "%"), CTX)).toBe(false);
    expect(editable("width", { type: "ident", name: "auto" }, CTX)).toBe(true);
    expect(editable("slice", { type: "ident", name: "auto" }, CTX)).toBe(false);
    expect(editable("width", { type: "function", name: "min" }, CTX)).toBe(
      false,
    );
  });
});
