/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { DOM_COLOR } from "./dom-color";

/** The colour as the CSS parser reads it, or "" when it rejects it. */
function parsed(color) {
  const style = document.createElement("div").style;
  style.color = color;
  return style.color;
}

describe("the depth colours", () => {
  it("are all valid CSS colours", () => {
    for (const color of DOM_COLOR) {
      expect(parsed(color), color).not.toBe("");
    }
  });

  it("tell every level of a cycle apart", () => {
    expect(new Set(DOM_COLOR.map(parsed)).size).toBe(DOM_COLOR.length);
  });
});
