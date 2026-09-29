/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { REPLACE_ALL_ICON } from "./replace-all-icon";

describe("REPLACE_ALL_ICON", () => {
  it("is a single, well-formed SVG", () => {
    const doc = new DOMParser().parseFromString(
      REPLACE_ALL_ICON,
      "image/svg+xml",
    );

    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.documentElement.tagName).toBe("svg");
    expect(doc.documentElement.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(doc.querySelectorAll("path").length).toBeGreaterThan(0);
  });

  it("is sized to sit inside a toolbar button", () => {
    expect(REPLACE_ALL_ICON).toContain("width: 15px");
  });
});
