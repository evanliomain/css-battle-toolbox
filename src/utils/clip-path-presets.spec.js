import { describe, expect, it } from "vitest";
import { PRESET_GROUPS, PRESETS } from "./clip-path-presets";
import { layoutShape, parseClipPath } from "./clip-path-shape";

const box = {
  width: 100,
  height: 100,
  fontSize: 16,
  rootFontSize: 16,
  viewport: { width: 100, height: 100 },
};

describe("PRESETS", () => {
  it("are each a shape the tool can draw", () => {
    PRESETS.forEach(({ value }) => {
      expect(layoutShape(parseClipPath(value), box).path).not.toBeNull();
    });
  });

  it("stretch the regular polygons to the box", () => {
    expect(PRESETS.find(({ name }) => "Triangle" === name).value).toBe(
      "polygon(50% 0,100% 100%,0 100%)",
    );
    expect(PRESETS.find(({ name }) => "Rhombus" === name).value).toBe(
      "polygon(50% 0,100% 50%,50% 100%,0 50%)",
    );
  });

  it("go in rows: polygons, circles and rectangles, then paths", () => {
    const functions = PRESET_GROUPS.map(({ presets }) => [
      ...new Set(presets.map(({ value }) => value.split("(")[0])),
    ]);

    expect(functions).toEqual([
      ["polygon"],
      ["circle", "ellipse", "rect", "inset", "xywh"],
      ["shape"],
    ]);
  });

  it("keep the polygons simple", () => {
    expect(PRESET_GROUPS[0].presets.map(({ name }) => name)).toEqual([
      "Triangle",
      "Trapezoid",
      "Parallelogram",
      "Rhombus",
      "Pentagon",
      "Hexagon",
      "Heptagon",
      "Octagon",
      "Star",
      "Cross",
      "Arrow",
    ]);
  });

  it("have each a name of their own", () => {
    expect(new Set(PRESETS.map(({ name }) => name)).size).toBe(PRESETS.length);
  });
});
