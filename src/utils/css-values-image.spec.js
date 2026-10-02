import { describe, expect, it } from "vitest";
import { propertyValuesAt } from "./css-property-values";
import { ANGLE, NUMBER } from "./css-values-grammar";

/** The labels offered after a declaration, `null` when not ours. */
const labelsAfter = (declaration) =>
  propertyValuesAt(`<p></p><style>p{${declaration}`)?.map(
    ({ label }) => label,
  ) ?? null;

const words = (text) => text.trim().split(/\s+/);

const N = NUMBER.map(({ label }) => label);
const A = ANGLE.map(({ label }) => label);
const GRADIENTS = words(`
  linear-gradient() repeating-linear-gradient()
  radial-gradient() repeating-radial-gradient()
  conic-gradient() repeating-conic-gradient()
`);
const POSITION = [...words("center top right bottom left"), ...N];
const SPACES = words(`
  srgb srgb-linear display-p3 a98-rgb prophoto-rgb rec2020 lab oklab
  xyz xyz-d50 xyz-d65 hsl hwb lch oklch
`);
const HUES = words("shorter longer increasing decreasing");
const EXTENTS = words(
  "closest-side closest-corner farthest-side farthest-corner",
);

describe("gradients", () => {
  describe("linear-gradient()", () => {
    it.each([
      ["", ["to", ...A, "in"]],
      ["45deg ", ["in"]],
      ["to ", words("top right bottom left")],
      ["to top ", ["left", "right", "in"]],
      ["to bottom ", ["left", "right", "in"]],
      ["to left ", ["top", "bottom", "in"]],
      ["to right ", ["top", "bottom", "in"]],
      ["to top left ", ["in"]],
      ["to top in srgb ", []],
      ["in ", SPACES],
      ["in srgb ", ["to", ...A]],
      ["in hsl ", HUES],
      ["in oklch longer ", ["hue"]],
      ["in oklch longer hue ", ["to", ...A]],
      ["in oklch longer hue to ", words("top right bottom left")],
      ["in oklch to ", words("top right bottom left")],
      ["45deg in lab ", []],
    ])("starts with %s", (args, labels) => {
      expect(labelsAfter(`background:linear-gradient(${args}`)).toEqual(labels);
      expect(
        labelsAfter(`background:repeating-linear-gradient(${args}`),
      ).toEqual(labels);
    });
  });

  describe("radial-gradient()", () => {
    it.each([
      ["", ["circle", "ellipse", ...EXTENTS, ...N, "at", "in"]],
      ["circle ", [...EXTENTS, ...N, "at", "in"]],
      ["ellipse ", [...EXTENTS, ...N, "at", "in"]],
      ["closest-side ", ["circle", "ellipse", "at", "in"]],
      ["farthest-corner circle ", ["at", "in"]],
      ["10px ", ["circle", "ellipse", ...N, "at", "in"]],
      ["10px 20px ", ["circle", "ellipse", "at", "in"]],
      ["circle 10px ", ["at", "in"]],
      ["ellipse 10px ", [...N, "at", "in"]],
      ["at ", POSITION],
      ["circle at left ", [...POSITION, "in"]],
      ["circle at left 1px top 2px ", ["in"]],
      ["circle at left 1px top ", [...POSITION, "in"]],
      ["in oklch longer at ", POSITION],
      ["in oklch longer at left 1px top ", POSITION],
      ["in oklch at ", POSITION],
      ["in lab ", ["circle", "ellipse", ...EXTENTS, ...N, "at"]],
      ["at center in ", SPACES],
    ])("starts with %s", (args, labels) => {
      expect(labelsAfter(`background:radial-gradient(${args}`)).toEqual(labels);
      expect(
        labelsAfter(`background:repeating-radial-gradient(${args}`),
      ).toEqual(labels);
    });
  });

  describe("conic-gradient()", () => {
    it.each([
      ["", ["from", "at", "in", "var()"]],
      ["from ", A],
      ["from 45deg ", ["at", "in"]],
      ["at ", POSITION],
      ["from 45deg at left ", [...POSITION, "in"]],
      ["from 45deg at left 1px top ", [...POSITION, "in"]],
      ["in hwb ", HUES],
      ["in srgb ", ["from", "at"]],
    ])("starts with %s", (args, labels) => {
      expect(labelsAfter(`background:conic-gradient(${args}`)).toEqual(labels);
      expect(
        labelsAfter(`background:repeating-conic-gradient(${args}`),
      ).toEqual(labels);
    });
  });

  it.each([
    ["linear-gradient(red,", ["var()"]],
    ["linear-gradient(red ", N],
    ["linear-gradient(#fff 10% ", N],
    ["linear-gradient(red 10% 20% ", []],
    ["linear-gradient(red green ", []],
    ["linear-gradient(red,10% ", []],
    ["linear-gradient(red,#fff ", N],
    ["radial-gradient(red ", N],
    ["conic-gradient(red ", A],
    ["conic-gradient(red,blue 10deg ", A],
    ["repeating-conic-gradient(red ", A],
  ])("offers the positions of a color stop in %s", (args, labels) => {
    expect(labelsAfter(`background:${args}`)).toEqual(labels);
  });

  it.each([
    ["a prefixed gradient", "background:-webkit-linear-gradient("],
    ["url()", "background:url("],
    ["a color", "background:rgb("],
  ])("offers nothing in %s", (_, declaration) => {
    expect(labelsAfter(declaration)).toEqual([]);
  });
});

describe("background", () => {
  const REPEATS = words("repeat-x repeat-y repeat space round no-repeat");
  const ATTACHMENTS = words("scroll fixed local");
  const BOXES = words("border-box padding-box content-box text");

  it("offers each component of a layer", () => {
    expect(labelsAfter("background:")).toEqual([
      ...GRADIENTS,
      "none",
      ...POSITION,
      ...REPEATS,
      ...ATTACHMENTS,
      ...BOXES,
    ]);
  });

  it.each([
    ["radial-gradient() ", [...POSITION, ...REPEATS, ...ATTACHMENTS, ...BOXES]],
    ["none ", [...POSITION, ...REPEATS, ...ATTACHMENTS, ...BOXES]],
    ["url() ", [...POSITION, ...REPEATS, ...ATTACHMENTS, ...BOXES]],
    [
      "var() ",
      [...GRADIENTS, "none", ...POSITION, ...REPEATS, ...ATTACHMENTS, ...BOXES],
    ],
    [
      "left 1px top ",
      [...GRADIENTS, "none", ...POSITION, ...REPEATS, ...ATTACHMENTS, ...BOXES],
    ],
    [
      "left 1px top 2px ",
      [...GRADIENTS, "none", ...REPEATS, ...ATTACHMENTS, ...BOXES],
    ],
    ["0 0/", ["auto", "cover", "contain", ...N]],
    [
      "0 0/50% ",
      [
        ...GRADIENTS,
        "none",
        "auto",
        ...N,
        ...REPEATS,
        ...ATTACHMENTS,
        ...BOXES,
      ],
    ],
    [
      "0 0/auto ",
      [
        ...GRADIENTS,
        "none",
        "auto",
        ...N,
        ...REPEATS,
        ...ATTACHMENTS,
        ...BOXES,
      ],
    ],
    [
      "0 0/cover ",
      [...GRADIENTS, "none", ...REPEATS, ...ATTACHMENTS, ...BOXES],
    ],
    [
      "0 0/1px 2px ",
      [...GRADIENTS, "none", ...REPEATS, ...ATTACHMENTS, ...BOXES],
    ],
    [
      "repeat ",
      [
        ...GRADIENTS,
        "none",
        ...POSITION,
        ...words("repeat space round no-repeat"),
        ...ATTACHMENTS,
        ...BOXES,
      ],
    ],
    [
      "repeat repeat ",
      [...GRADIENTS, "none", ...POSITION, ...ATTACHMENTS, ...BOXES],
    ],
    [
      "repeat-x ",
      [...GRADIENTS, "none", ...POSITION, ...ATTACHMENTS, ...BOXES],
    ],
    [
      "repeat-y ",
      [...GRADIENTS, "none", ...POSITION, ...ATTACHMENTS, ...BOXES],
    ],
    [
      "repeat space ",
      [...GRADIENTS, "none", ...POSITION, ...ATTACHMENTS, ...BOXES],
    ],
    ["space fixed ", [...GRADIENTS, "none", ...POSITION, ...BOXES]],
    [
      "local border-box ",
      [...GRADIENTS, "none", ...POSITION, ...REPEATS, ...BOXES],
    ],
    [
      "text content-box ",
      [...GRADIENTS, "none", ...POSITION, ...REPEATS, ...ATTACHMENTS],
    ],
  ])("offers after %s", (value, labels) => {
    expect(labelsAfter(`background:${value}`)).toEqual(labels);
  });

  it("starts each layer anew", () => {
    expect(labelsAfter("background:radial-gradient() fixed,")).toEqual(
      labelsAfter("background:"),
    );
  });

  it("offers the arguments of a gradient in any layer", () => {
    expect(labelsAfter("background:none,conic-gradient(")).toEqual([
      "from",
      "at",
      "in",
      "var()",
    ]);
  });
});

describe("mask", () => {
  it("offers each component of a mask layer", () => {
    expect(labelsAfter("mask:")).toEqual([
      ...GRADIENTS,
      "none",
      ...POSITION,
      ...words("repeat-x repeat-y repeat space round no-repeat"),
      ...words("add subtract intersect exclude"),
      ...words("alpha luminance match-source"),
      ...words(
        "border-box padding-box content-box fill-box stroke-box view-box no-clip",
      ),
    ]);
  });

  it("takes each component once", () => {
    expect(labelsAfter("mask:linear-gradient() no-repeat add alpha ")).toEqual([
      ...POSITION,
      ...words(
        "border-box padding-box content-box fill-box stroke-box view-box no-clip",
      ),
    ]);
  });

  it("offers the arguments of a gradient", () => {
    expect(labelsAfter("mask:linear-gradient(")).toEqual(["to", ...A, "in"]);
  });
});

describe("border-image", () => {
  const REPEATS = words("stretch repeat round space");

  it.each([
    ["", ["none", ...GRADIENTS, ...REPEATS, ...N]],
    ["none ", [...REPEATS, ...N]],
    ["radial-gradient() ", [...REPEATS, ...N]],
    ["30 ", [...GRADIENTS, ...REPEATS, "fill", ...N]],
    ["30 fill ", [...GRADIENTS, ...REPEATS]],
    ["fill 30 ", [...GRADIENTS, ...REPEATS, ...N]],
    ["fill ", [...GRADIENTS, ...REPEATS, ...N]],
    ["1 2 3 ", [...GRADIENTS, ...REPEATS, "fill", ...N]],
    ["1 2 3 4 ", [...GRADIENTS, ...REPEATS, "fill"]],
    ["30 stretch ", [...GRADIENTS, ...REPEATS]],
    ["30/", ["auto", ...N]],
    ["30/5px ", [...GRADIENTS, ...REPEATS, "auto", ...N]],
    ["30/auto ", [...GRADIENTS, ...REPEATS, "auto", ...N]],
    ["30/1 2 3 4 ", [...GRADIENTS, ...REPEATS]],
    ["30/5px round ", [...GRADIENTS, ...REPEATS]],
    ["30/5px/", N],
    ["30//", N],
    ["30/5px/1px ", [...GRADIENTS, ...REPEATS, ...N]],
    ["30/5px/auto ", [...GRADIENTS, ...REPEATS]],
    ["30/5px/1px/", []],
    ["30/5px/1px/1px ", [...GRADIENTS, ...REPEATS]],
    ["repeat stretch ", [...GRADIENTS, ...N]],
    ["repeat linear-gradient() ", N],
  ])("offers after %s", (value, labels) => {
    expect(labelsAfter(`border-image:${value}`)).toEqual(labels);
  });

  it("offers nothing in url()", () => {
    expect(labelsAfter("border-image:url(")).toEqual([]);
  });

  it("offers the arguments of a gradient", () => {
    expect(labelsAfter("border-image:30 conic-gradient(")).toEqual([
      "from",
      "at",
      "in",
      "var()",
    ]);
  });
});

describe("-webkit-box-reflect", () => {
  const REPEATS = words("stretch repeat round space");

  it.each([
    ["", words("above below left right")],
    ["below ", N],
    ["inherit ", []],
    ["inherit 5px ", []],
    ["below 5px ", [...GRADIENTS, ...REPEATS, ...N]],
    ["below 5px linear-gradient() ", [...REPEATS, ...N]],
    ["below 5px url() ", [...REPEATS, ...N]],
    ["below 5px stretch round ", [...GRADIENTS, ...N]],
    ["below 5px linear-gradient() 30 ", [...REPEATS, "fill", ...N]],
    ["below 5px linear-gradient() .5 ", [...REPEATS, "fill", ...N]],
    ["below 5px linear-gradient() x1 ", [...REPEATS, ...N]],
    ["below 5px linear-gradient() 30/", ["auto", ...N]],
    ["below 5px,", []],
  ])("offers after %s", (value, labels) => {
    expect(labelsAfter(`-webkit-box-reflect:${value}`)).toEqual(labels);
  });

  it("offers the arguments of a gradient", () => {
    expect(
      labelsAfter("-webkit-box-reflect:below 5px linear-gradient("),
    ).toEqual(["to", ...A, "in"]);
    expect(
      labelsAfter("-webkit-box-reflect:below 5px linear-gradient(red,"),
    ).toEqual(["var()"]);
  });

  it.each([
    ["url()", "below 5px url("],
    ["a gradient after a comma", "below 5px,linear-gradient("],
  ])("offers nothing in %s", (_, value) => {
    expect(labelsAfter(`-webkit-box-reflect:${value}`)).toEqual([]);
  });
});
