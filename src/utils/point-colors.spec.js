import { describe, expect, it } from "vitest";
import { COLOR_COUNT, POINT_COLORS } from "./point-colors";

const hueOf = (color) => Number(/^hsl\((\d+)/.exec(color)[1]);

describe("POINT_COLORS", () => {
  it("has 30 colors, all different", () => {
    expect(COLOR_COUNT).toBe(30);
    expect(POINT_COLORS).toHaveLength(30);
    expect(new Set(POINT_COLORS).size).toBe(30);
  });

  it("starts from red", () => {
    expect(POINT_COLORS[0]).toBe("hsl(0 90% 64%)");
  });

  it("keeps two following points far apart on the wheel", () => {
    POINT_COLORS.slice(1).forEach((color, i) => {
      const turn = Math.abs(hueOf(color) - hueOf(POINT_COLORS[i]));
      expect(Math.min(turn, 360 - turn)).toBeGreaterThan(90);
    });
  });

  it("spreads the hues over the whole wheel", () => {
    const hues = [...new Set(POINT_COLORS.map(hueOf))].sort((a, b) => a - b);
    const gaps = hues.map((hue, i) => (hues[i + 1] ?? hues[0] + 360) - hue);

    expect(Math.max(...gaps)).toBeLessThanOrEqual(20);
  });
});
