import { describe, expect, it } from "vitest";
import { propertyValuesAt } from "./css-property-values";
import { NUMBER } from "./css-values-grammar";

/** The labels offered after a declaration, `null` when not ours. */
const labelsAfter = (declaration) =>
  propertyValuesAt(`<p></p><style>p{${declaration}`)?.map(
    ({ label }) => label,
  ) ?? null;

const words = (text) => text.trim().split(/\s+/);

const N = NUMBER.map(({ label }) => label);
const SYSTEM = words("caption icon menu message-box small-caption status-bar");
const STYLES = words("italic oblique");
const WEIGHTS = words("bold bolder lighter");
const STRETCHES = words(`
  ultra-condensed extra-condensed condensed semi-condensed
  semi-expanded expanded extra-expanded ultra-expanded
`);
const SIZES = words(`
  xx-small x-small small medium large x-large xx-large xxx-large
  larger smaller
`);
const FAMILIES = words(`
  serif sans-serif monospace cursive fantasy system-ui math
`);

describe("font", () => {
  it("offers a system font, or what comes before the size, and the size", () => {
    expect(labelsAfter("font:")).toEqual([
      ...SYSTEM,
      "normal",
      ...STYLES,
      "small-caps",
      ...WEIGHTS,
      ...STRETCHES,
      ...SIZES,
      ...N,
    ]);
  });

  it.each([
    ["italic ", ["normal", "small-caps", ...WEIGHTS, ...STRETCHES]],
    ["small-caps ", ["normal", ...STYLES, ...WEIGHTS, ...STRETCHES]],
    ["lighter ", ["normal", ...STYLES, "small-caps", ...STRETCHES]],
    ["700 ", ["normal", ...STYLES, "small-caps", ...STRETCHES]],
    ["+700 ", ["normal", ...STYLES, "small-caps", ...STRETCHES]],
    ["1 ", ["normal", ...STYLES, "small-caps", ...STRETCHES]],
    ["10.5 ", ["normal", ...STYLES, "small-caps", ...STRETCHES]],
    [".55 ", ["normal", ...STYLES, "small-caps", ...STRETCHES]],
    ["condensed ", ["normal", ...STYLES, "small-caps", ...WEIGHTS]],
    ["normal ", ["normal", ...STYLES, "small-caps", ...WEIGHTS, ...STRETCHES]],
    ["italic small-caps bold condensed ", []],
  ])("offers before the size, after %s", (value, before) => {
    expect(labelsAfter(`font:${value}`)).toEqual([...before, ...SIZES, ...N]);
  });

  it.each([
    ["0 ", FAMILIES],
    ["5% ", FAMILIES],
    ["1Q ", FAMILIES],
    ["calc() ", FAMILIES],
    ["large ", FAMILIES],
    ["bold 9px ", FAMILIES],
    ["5%/", ["normal", ...N]],
    ["5%/0 ", FAMILIES],
    ["5%/0 a ", []],
    ["5% a ", []],
    ["5% a,", FAMILIES],
    ["5% a,serif ", []],
    ["caption ", []],
  ])("offers after %s", (value, labels) => {
    expect(labelsAfter(`font:${value}`)).toEqual(labels);
  });
});
