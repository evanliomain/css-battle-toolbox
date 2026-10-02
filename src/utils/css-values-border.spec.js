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
const WIDTHS = [...words("thin medium thick"), ...N];
const STYLES = words(`
  none hidden dotted dashed solid double groove ridge inset outset
`);
const OUTLINE_STYLES = words(`
  auto none dotted dashed solid double groove ridge inset outset
`);

describe("borders", () => {
  it.each([
    ["", [...STYLES, ...WIDTHS]],
    ["solid ", WIDTHS],
    ["2px ", [...STYLES, "var()"]],
    ["thick ", [...STYLES, "var()"]],
    ["#fff ", [...STYLES, ...WIDTHS]],
    ["2px solid ", ["var()"]],
    ["2px solid #fff ", []],
  ])("offers after border:%s", (value, labels) => {
    expect(labelsAfter(`border:${value}`)).toEqual(labels);
  });

  it.each(
    words(`
      border-top border-right border-bottom border-left
      border-block border-block-start border-block-end
      border-inline border-inline-start border-inline-end
    `),
  )("offers the same in %s", (property) => {
    expect(labelsAfter(`${property}:`)).toEqual([...STYLES, ...WIDTHS]);
  });

  it.each([
    ["outline:", [...OUTLINE_STYLES, ...WIDTHS]],
    ["outline:auto ", WIDTHS],
    ["outline:1px ", [...OUTLINE_STYLES, "var()"]],
    ["outline-style:", OUTLINE_STYLES],
    ["outline-style:auto ", []],
    ["outline-width:", WIDTHS],
    ["outline-width:1px ", []],
    ["outline-color:", ["var()"]],
    ["outline-color:red ", []],
  ])("offers the outline after %s", (declaration, labels) => {
    expect(labelsAfter(declaration)).toEqual(labels);
  });

  it.each([
    ["border-width", 4],
    ["border-block-width", 2],
    ["border-inline-width", 2],
    ["border-top-width", 1],
    ["border-inline-end-width", 1],
  ])("offers the widths of %s, %i at most", (property, max) => {
    expect(labelsAfter(`${property}:${"1px ".repeat(max - 1)}`)).toEqual(
      WIDTHS,
    );
    expect(labelsAfter(`${property}:${"1px ".repeat(max)}`)).toEqual([]);
  });

  it.each([
    ["border-style", 4],
    ["border-block-style", 2],
    ["border-inline-style", 2],
    ["border-right-style", 1],
    ["border-block-start-style", 1],
  ])("offers the styles of %s, %i at most", (property, max) => {
    expect(labelsAfter(`${property}:${"solid ".repeat(max - 1)}`)).toEqual(
      STYLES,
    );
    expect(labelsAfter(`${property}:${"solid ".repeat(max)}`)).toEqual([]);
  });

  it.each([
    ["border-color", 4],
    ["border-block-color", 2],
    ["border-inline-color", 2],
    ["border-left-color", 1],
    ["border-inline-start-color", 1],
  ])("leaves the colors of %s to the target, %i at most", (property, max) => {
    expect(labelsAfter(`${property}:${"red ".repeat(max - 1)}`)).toEqual([
      "var()",
    ]);
    expect(labelsAfter(`${property}:${"red ".repeat(max)}`)).toEqual([]);
  });

  it.each([
    ["", WIDTHS],
    ["1px ", ["var()"]],
    ["thin ", ["var()"]],
    ["red ", WIDTHS],
    ["1px red ", []],
  ])("offers after -webkit-text-stroke:%s", (value, labels) => {
    expect(labelsAfter(`-webkit-text-stroke:${value}`)).toEqual(labels);
  });
});
