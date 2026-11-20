import { describe, expect, it } from "vitest";
import {
  borderImageValueAt,
  parseBorderImage,
  repeatOf,
  sideNode,
  splice,
  toggleFill,
  writeRepeat,
  writeSide,
} from "./border-image-value";

/** The value around `|`, the caret. */
function at(code) {
  const pos = code.indexOf("|");
  return borderImageValueAt(code.replace("|", ""), pos);
}

/** The text of some nodes. */
function texts(text, nodes) {
  return nodes.map(({ from, to }) => text.slice(from, to));
}

/** Each group of a value, as text. */
function read(text) {
  const parsed = parseBorderImage(text);
  const group = (g) => (g ? texts(text, g.values) : null);
  return {
    source: parsed.source && text.slice(parsed.source.from, parsed.source.to),
    slice: group(parsed.slice),
    fill: null !== parsed.fill,
    width: group(parsed.width),
    outset: group(parsed.outset),
    repeat: texts(text, parsed.repeat),
    opaque: parsed.opaque,
  };
}

/** The value once the changes are made. */
function apply(text, changes) {
  return [...changes]
    .sort((a, b) => b.from - a.from)
    .reduce(
      (out, { from, to, insert }) =>
        out.slice(0, from) + insert + out.slice(to),
      text,
    );
}

const G = "conic-gradient(red)";

describe("borderImageValueAt", () => {
  it("finds the value of a border-image", () => {
    expect(at("<style>p{border-image:red 1|0/2px;color:red}")).toEqual({
      property: "border-image",
      from: 22,
      to: 32,
      text: "red 10/2px",
    });
  });

  it("leaves the other properties", () => {
    expect(at("<style>p{border-image-slice:1|0}")).toBeNull();
    expect(at("<style>p{clip-path:circle(|)}")).toBeNull();
  });
});

describe("parseBorderImage", () => {
  it("reads the shorthand, glued", () => {
    expect(read(`${G}1 2%3 fill/0 9q auto/4px+5 space`)).toEqual({
      source: G,
      slice: ["1", "2%", "3"],
      fill: true,
      width: ["0", "9q", "auto"],
      outset: ["4px", "+5"],
      repeat: ["space"],
      opaque: false,
    });
  });

  it("reads the source written after the rest", () => {
    expect(read(`50%/0%45%52%${G}`)).toMatchObject({
      source: G,
      slice: ["50%"],
      width: ["0%", "45%", "52%"],
      outset: null,
    });
  });

  it("reads the repeat first, and fill before the slice", () => {
    expect(read(`space+41+58 ${G} fill 1e3`)).toMatchObject({
      repeat: ["space"],
      slice: ["+41", "+58"],
      source: G,
    });
    expect(read("fill 1e3")).toMatchObject({ slice: ["1e3"], fill: true });
  });

  it("reads an empty width before the outset", () => {
    expect(read(`${G}.1%//3ex`)).toMatchObject({
      slice: [".1%"],
      width: [],
      outset: ["3ex"],
    });
  });

  it("stops a group at 4 values", () => {
    expect(read("1/1 2 3 4 5")).toMatchObject({ width: ["1", "2", "3", "4"] });
  });

  it("keeps auto among the widths only", () => {
    expect(read("1//auto")).toMatchObject({ outset: [] });
  });

  it("reads the math functions as numbers", () => {
    expect(read(`${G}1/min(50%,9em)`)).toMatchObject({
      source: G,
      width: ["min(50%,9em)"],
    });
  });

  it("takes none for the source", () => {
    expect(read("none 1")).toMatchObject({ source: "none", slice: ["1"] });
  });

  it("knows nothing for sure with a var()", () => {
    expect(read("var(--a)1/9q")).toMatchObject({
      opaque: true,
      source: null,
      slice: ["1"],
    });
  });

  it("reads an empty value", () => {
    expect(read("")).toEqual({
      source: null,
      slice: null,
      fill: false,
      width: null,
      outset: null,
      repeat: [],
      opaque: false,
    });
  });

  it("keeps the first source and the first slice", () => {
    expect(read(`${G}1 linear-gradient(red)2`)).toMatchObject({
      source: G,
      slice: ["1"],
    });
  });
});

describe("sideNode", () => {
  const text = "1 2 3 4";
  const sides = (values) =>
    [0, 1, 2, 3].map((side) => {
      const node = sideNode(parseBorderImage(values).slice, side);
      return values.slice(node.from, node.to);
    });

  it("takes the sides as margin does", () => {
    expect(sides("1")).toEqual(["1", "1", "1", "1"]);
    expect(sides("1 2")).toEqual(["1", "2", "1", "2"]);
    expect(sides("1 2 3")).toEqual(["1", "2", "3", "2"]);
    expect(sides(text)).toEqual(["1", "2", "3", "4"]);
  });

  it("has none for a group left out", () => {
    expect(sideNode(null, 0)).toBeNull();
    expect(sideNode(parseBorderImage("1//2").width, 0)).toBeNull();
  });
});

describe("writeSide", () => {
  const write = (text, group, side, insert, options) =>
    apply(
      text,
      writeSide(parseBorderImage(text), group, side, insert, options),
    );

  it("rewrites the value the side takes", () => {
    expect(write(`${G}10 20/5px`, "slice", 3, "30")).toBe(`${G}10 30/5px`);
    expect(write(`${G}10/5px`, "width", 2, "9q")).toBe(`${G}10/9q`);
  });

  it("keeps it glued where it can", () => {
    expect(write(`${G}50%34`, "slice", 0, "40%")).toBe(`${G}40%34`);
    expect(write(`${G}50%34`, "slice", 1, "3%")).toBe(`${G}50%3%`);
  });

  it("splits the sides apart", () => {
    expect(write(`${G}10/5px`, "width", 0, "9px", { split: true })).toBe(
      `${G}10/9px 5px 5px`,
    );
    expect(write(`${G}10 20`, "slice", 1, "10", { split: true })).toBe(
      `${G}10 10 10 20`,
    );
    expect(write(`${G}10 10 10 20`, "slice", 3, "10", { split: true })).toBe(
      `${G}10`,
    );
  });

  it("adds the slice", () => {
    expect(write(G, "slice", 0, "30")).toBe(`${G}30`);
    expect(write(`${G}  `, "slice", 0, "30", { split: true })).toBe(
      `${G}30 100% 100%  `,
    );
    expect(write("space", "slice", 0, "30")).toBe("space 30");
  });

  it("adds the width after the slice", () => {
    expect(write(`${G}30 fill space`, "width", 0, "9px")).toBe(
      `${G}30 fill/9px space`,
    );
    expect(write(`${G}30 space`, "width", 1, "9px", { split: true })).toBe(
      `${G}30/1 9px 1 1 space`,
    );
  });

  it("fills an empty width", () => {
    expect(write(`${G}30//2px`, "width", 0, "9px")).toBe(`${G}30/9px/2px`);
  });

  it("adds the outset", () => {
    expect(write(`${G}30`, "outset", 0, "9px")).toBe(`${G}30//9px`);
    expect(write(`${G}30/5px`, "outset", 0, "9px")).toBe(`${G}30/5px/9px`);
    expect(write(`${G}30//`, "outset", 0, "9px")).toBe(`${G}30//9px`);
    expect(write(`fill 30 ${G}`, "outset", 0, "9px")).toBe(`fill 30//9px ${G}`);
  });

  it("adds the slice with the width or the outset", () => {
    expect(write(G, "width", 0, "9px")).toBe(`${G}100%/9px`);
    expect(write(G, "outset", 0, "9px")).toBe(`${G}100%//9px`);
  });
});

describe("toggleFill", () => {
  const toggle = (text) => apply(text, toggleFill(parseBorderImage(text)));

  it("adds fill after the slice", () => {
    expect(toggle(`${G}99%/9q`)).toBe(`${G}99%fill/9q`);
    expect(toggle(`${G}1/9q`)).toBe(`${G}1 fill/9q`);
    expect(toggle(G)).toBe(`${G}100%fill`);
  });

  it("takes fill off, with a space next to it", () => {
    expect(toggle(`${G}1 fill/9q`)).toBe(`${G}1/9q`);
    expect(toggle(`${G}fill 1`)).toBe(`${G}1`);
    expect(toggle(`${G}99%fill/9q`)).toBe(`${G}99%/9q`);
  });

  it("leaves a space where the neighbors would stick", () => {
    expect(toggle(`space fill 1`)).toBe("space 1");
    expect(toggle(`space\tfill\t1`)).toBe("space\t1");
    expect(toggle(`space fill+1`)).toBe("space +1");
  });
});

describe("writeRepeat", () => {
  const set = (text, axis, keyword) =>
    apply(text, writeRepeat(parseBorderImage(text), axis, keyword));

  it("adds a single keyword for both axes", () => {
    expect(set(`${G}1`, 0, "stretch")).toBe(`${G}1`);
    expect(set(`${G}1/9q`, 1, "space")).toBe(`${G}1/9q stretch space`);
  });

  it("writes both axes the shortest way", () => {
    expect(set(`${G}1 round space`, 1, "round")).toBe(`${G}1 round`);
    expect(set(`${G}1 round`, 0, "space")).toBe(`${G}1 space round`);
  });

  it("takes stretch off", () => {
    expect(set(`${G}1 round`, 0, "stretch")).toBe(`${G}1 stretch round`);
    expect(set(`${G}1 round stretch`, 0, "stretch")).toBe(`${G}1`);
    expect(set(`round stretch 1`, 0, "stretch")).toBe("1");
  });
});

describe("repeatOf", () => {
  it("reads the repeat of each axis", () => {
    expect(repeatOf(parseBorderImage("1"))).toEqual(["stretch", "stretch"]);
    expect(repeatOf(parseBorderImage("space 1"))).toEqual(["space", "space"]);
    expect(repeatOf(parseBorderImage("1 round space"))).toEqual([
      "round",
      "space",
    ]);
  });
});

describe("splice", () => {
  it("adds spaces where the text would stick", () => {
    expect(splice("1 2", 0, 1, "3")).toEqual({ from: 0, to: 1, insert: "3" });
    expect(splice("a1", 1, 2, "fill")).toEqual({
      from: 1,
      to: 2,
      insert: " fill",
    });
    expect(splice("10b", 0, 2, "fill")).toEqual({
      from: 0,
      to: 2,
      insert: "fill ",
    });
    expect(splice("1%b", 1, 2, "%")).toEqual({ from: 1, to: 2, insert: "%" });
  });
});
