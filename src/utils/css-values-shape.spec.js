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
const SHAPES = words(`
  circle() ellipse() inset() path() polygon() rect() shape() xywh()
`);
const BOXES = words(`
  border-box padding-box content-box margin-box fill-box stroke-box view-box
`);
const COORD_BOXES = BOXES.filter((box) => "margin-box" !== box);
const POSITIONS = words("center top right bottom left");
const POSITION = [...POSITIONS, ...N];
const COMMANDS = words("move line hline vline curve smooth arc close");
const ARC = words("of cw ccw large small rotate");

describe("clip-path", () => {
  it("offers the shapes, none and the boxes, never url()", () => {
    expect(labelsAfter("clip-path:")).toEqual([...SHAPES, "none", ...BOXES]);
  });

  it.each([
    ["a shape", "clip-path:circle() ", BOXES],
    ["a box", "clip-path:content-box ", SHAPES],
    ["a shape and a box", "clip-path:circle() border-box ", []],
    ["none", "clip-path:none ", []],
    ["an url() typed by hand", "clip-path:url() ", []],
    ["a comma", "clip-path:circle(),", []],
    ["a shape after a comma", "clip-path:circle(),circle(", []],
    ["url()", "clip-path:url(", []],
  ])("offers what goes with %s", (_, declaration, labels) => {
    expect(labelsAfter(declaration)).toEqual(labels);
  });

  describe("inset(), xywh() and rect()", () => {
    it.each([
      ["inset(", N],
      ["inset(1px ", ["round", ...N]],
      ["inset(1px 2px 3px ", ["round", ...N]],
      ["inset(1px 2px 3px 4px ", ["round"]],
      ["inset(1px 2px 3px 4px 5px ", []],
      ["inset(1px round ", N],
      ["inset(1px round 1px 2px 3px ", N],
      ["inset(1px round 1px 2px 3px 4px ", []],
      ["inset(1px round 1px/", N],
      ["inset(1px round 1px/1px 2px 3px 4px ", []],
      ["inset(1px round 1px 2px 3px 4px/1px ", N],
      ["inset(1px round 1px/1px/", []],
      ["inset(1px,", []],
      ["xywh(1px 2px 3px ", N],
      ["xywh(1px 2px 3px 4px ", ["round"]],
      ["rect(", ["auto", ...N]],
      ["rect(1px,", []],
      ["rect(auto 1px 2px ", ["auto", ...N]],
      ["rect(auto 1px 2px 3px ", ["round"]],
      ["rect(1px 2px 3px 4px round ", N],
    ])("offers after %s", (args, labels) => {
      expect(labelsAfter(`clip-path:${args}`)).toEqual(labels);
    });
  });

  describe("circle() and ellipse()", () => {
    it.each([
      ["circle(", ["closest-side", "farthest-side", ...N, "at"]],
      ["circle(10px ", ["at"]],
      ["circle(10px 20px ", []],
      ["circle(at ", POSITION],
      ["circle(10px at left ", POSITION],
      ["circle(at left 10px top ", POSITION],
      ["circle(at left 10px top 20px ", []],
      ["circle(10px,", []],
      ["ellipse(", ["closest-side", "farthest-side", ...N, "at"]],
      // Chromium wants no radius or both.
      ["ellipse(10px ", ["closest-side", "farthest-side", ...N]],
      ["ellipse(10px closest-side ", ["at"]],
      ["ellipse(1px 2px 3px ", []],
      ["ellipse(1px 2px at ", POSITION],
    ])("offers after %s", (args, labels) => {
      expect(labelsAfter(`clip-path:${args}`)).toEqual(labels);
    });
  });

  describe("polygon() and path()", () => {
    it.each([
      ["polygon(", ["nonzero", "evenodd", "round", ...N]],
      ["polygon(evenodd ", ["round"]],
      ["polygon(nonzero ", ["round"]],
      ["polygon(round ", N],
      ["polygon(evenodd round ", N],
      ["polygon(evenodd round 5px ", []],
      ["polygon(0 ", N],
      ["polygon(0 0 ", []],
      ["polygon(left ", []],
      ["polygon(0 0,", N],
      ["polygon(0 0,1px ", N],
      ["polygon(0 0,1px 2px ", []],
      ["path(", ["nonzero", "evenodd"]],
      ["path(evenodd ", []],
      ["path(evenodd,", []],
      ['path("M0 0") ', BOXES],
    ])("offers after %s", (args, labels) => {
      expect(labelsAfter(`clip-path:${args}`)).toEqual(labels);
    });
  });

  describe("shape()", () => {
    it.each([
      ["shape(", ["nonzero", "evenodd", "from"]],
      ["shape(evenodd ", ["from"]],
      ["shape(10px ", []],
      ["shape(evenodd 10px ", []],
      ["shape(from ", POSITION],
      ["shape(nonzero from left 10px ", POSITION],
      ["shape(from left 1px top 2px ", []],
    ])("starts with %s", (args, labels) => {
      expect(labelsAfter(`clip-path:${args}`)).toEqual(labels);
    });

    it.each([
      ["", COMMANDS],
      ["move ", ["to", "by"]],
      ["move to ", POSITION],
      ["line to right 1px bottom 2px ", []],
      ["line by ", N],
      ["line by 1px ", N],
      ["line by 1px 2px ", []],
      ["line at ", []],
      ["jump ", []],
      ["close ", []],
      ["hline ", ["to", "by"]],
      ["hline to ", ["left", "center", "right", "x-start", "x-end", ...N]],
      ["hline to 10px ", []],
      ["hline by ", N],
      ["hline by 10px ", []],
      ["vline to ", ["top", "center", "bottom", "y-start", "y-end", ...N]],
      ["vline to 10px ", []],
      ["vline by ", N],
    ])("follows a command with %s", (command, labels) => {
      expect(labelsAfter(`clip-path:shape(from 0 0,${command}`)).toEqual(
        labels,
      );
    });

    it.each([
      ["curve to ", POSITION],
      ["curve to 1px ", [...POSITION, "with"]],
      ["curve to 1px 2px 3px 4px ", ["with"]],
      ["curve by 1px ", N],
      ["curve at 1px 2px ", []],
      ["curve by 1px 2px ", ["with"]],
      ["curve to 1px 2px with ", POSITION],
      ["curve to 1px 2px with 3px 4px ", [...POSITION, "from"]],
      ["curve to 1px with left top right 1px ", []],
      ["curve to 1px with 3px from end ", []],
      ["curve by 1px 2px with ", N],
      ["curve by 1px 2px with 3px ", N],
      ["curve by 1px 2px with 3px 4px ", ["from"]],
      ["curve by 1px 2px with 3px 4px 5px ", []],
      ["curve by 1px 2px with 3px 4px from ", ["start", "end", "origin"]],
      ["curve by 1px 2px with 3px 4px from end ", []],
      ["curve by 1px 2px with 3px 4px from end/", N],
      ["curve by 1px 2px with 3px 4px/5px 6px ", ["from"]],
      ["smooth to 1px ", [...POSITION, "with"]],
      ["smooth to 1px with 2px 3px from ", ["start", "end", "origin"]],
    ])("draws a %s", (command, labels) => {
      expect(labelsAfter(`clip-path:shape(from 0 0,${command}`)).toEqual(
        labels,
      );
    });

    it.each([
      ["arc to ", POSITION],
      ["arc by 1px ", N],
      ["arc by 1px 2px ", ARC],
      ["arc to 1px ", [...POSITION, ...ARC]],
      ["arc to 1px of ", N],
      ["arc to 1px of 5px ", [...N, "cw", "ccw", "large", "small", "rotate"]],
      ["arc to 1px of 5px 6px ", ["cw", "ccw", "large", "small", "rotate"]],
      ["arc to 1px of 5px cw ", ["large", "small", "rotate"]],
      ["arc to 1px cw ", ["of", "large", "small", "rotate"]],
      ["arc to 1px ccw ", ["of", "large", "small", "rotate"]],
      ["arc to 1px large ", ["of", "cw", "ccw", "rotate"]],
      ["arc to 1px small ", ["of", "cw", "ccw", "rotate"]],
      ["arc to 1px rotate ", A],
      ["arc to 1px rotate 9deg ", ["of", "cw", "ccw", "large", "small"]],
      ["arc to 1px of 5px cw large rotate 9deg ", []],
    ])("draws an %s", (command, labels) => {
      expect(labelsAfter(`clip-path:shape(from 0 0,${command}`)).toEqual(
        labels,
      );
    });
  });
});

describe("offset", () => {
  const PATHS = ["ray()", ...SHAPES];

  it("offers a position, then a path and a box", () => {
    expect(labelsAfter("offset:")).toEqual([
      ...PATHS,
      "none",
      "auto",
      "normal",
      ...POSITION,
      ...COORD_BOXES,
    ]);
  });

  it.each([
    ["left ", [...PATHS, ...POSITION, ...COORD_BOXES]],
    ["left 1px top 2px ", [...PATHS, ...COORD_BOXES]],
    ["auto ", [...PATHS, ...COORD_BOXES]],
    ["normal ", [...PATHS, ...COORD_BOXES]],
    ["border-box ", PATHS],
    ["ray() ", [...COORD_BOXES, "auto", "reverse", ...A]],
    ["var() ray() ", [...COORD_BOXES, "auto", "reverse", ...A]],
    ["circle() fill-box ", ["auto", "reverse", ...A]],
    ["view-box circle() ", ["auto", "reverse", ...A]],
    ["none ", ["auto", "reverse", ...A]],
    ["ray() 10px ", [...COORD_BOXES, "auto", "reverse", ...A]],
    ["ray() 10px 20deg ", [...COORD_BOXES, "auto", "reverse"]],
    ["ray() reverse ", [...COORD_BOXES, ...A]],
    ["ray() reverse 1px ", [...COORD_BOXES, ...A]],
    ["left 1px ray() 2px ", [...COORD_BOXES, "auto", "reverse", ...A]],
    ["ray() auto ", [...COORD_BOXES, ...A]],
    ["ray()/", ["auto", ...POSITION]],
    ["ray()/left ", POSITION],
    ["ray()/left 1px top 2px ", []],
    ["ray()/auto ", []],
    ["ray(),", []],
  ])("offers after %s", (value, labels) => {
    expect(labelsAfter(`offset:${value}`)).toEqual(labels);
  });

  it.each([
    [
      "ray(",
      words(`
        closest-side closest-corner farthest-side farthest-corner sides
        contain at
      `).concat(A),
    ],
    [
      "ray(45deg ",
      words(
        "closest-side closest-corner farthest-side farthest-corner sides contain at",
      ),
    ],
    ["ray(sides ", ["contain", "at", ...A]],
    ["ray(closest-corner ", ["contain", "at", ...A]],
    [
      "ray(contain ",
      [
        ...words(
          "closest-side closest-corner farthest-side farthest-corner sides",
        ),
        "at",
        ...A,
      ],
    ],
    ["ray(at ", POSITION],
    ["ray(45deg at left 1px top ", POSITION],
    ["ray(45deg at left 1px top 2px ", []],
    ["ray(45deg,", []],
  ])("offers in %s", (args, labels) => {
    expect(labelsAfter(`offset:${args}`)).toEqual(labels);
  });

  it.each([
    ["circle(", ["closest-side", "farthest-side", ...N, "at"]],
    ["polygon(", ["nonzero", "evenodd", "round", ...N]],
    // Only its string there.
    ["path(", []],
    ["url(", []],
  ])("follows the rules of clip-path in %s", (args, labels) => {
    expect(labelsAfter(`offset:${args}`)).toEqual(labels);
  });
});
