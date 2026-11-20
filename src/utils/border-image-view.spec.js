/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { layoutBorderImage } from "./border-image-geometry";
import { describePiece } from "./border-image-pieces";
import {
  cloneHtml,
  cropHtml,
  COLORS,
  edgeSvg,
  escape,
  duration,
  figureScale,
  figuresHtml,
  fit,
  imageHtml,
  landing,
  numberSvg,
  pieceClass,
  piecesHtml,
  playHtml,
  playOrder,
  rectSvg,
  stepAt,
} from "./border-image-view";
import { POINT_COLORS } from "./point-colors";

const px = (value) => ({ value, unit: "px" });
const num = (value) => ({ value, unit: "" });
const four = (side) => [side, side, side, side];

/** What the page script sends, for a 200×100 box, slices and widths of 20. */
function model(input = {}, extra = {}) {
  const repeat = input.repeat ?? ["stretch", "stretch"];
  const fill = input.fill ?? false;
  const layout = layoutBorderImage({
    box: { width: 200, height: 100 },
    borders: [0, 0, 0, 0],
    slice: four(num(20)),
    fill,
    width: four(px(20)),
    outset: four(num(0)),
    repeat,
    ...input,
  });
  return {
    names: ["div"],
    index: 0,
    reason: "",
    notices: [],
    opaque: false,
    repeat,
    fill,
    layout,
    stories: layout.pieces.map((piece) =>
      describePiece(piece, layout, repeat, fill),
    ),
    locked: [],
    hovered: -1,
    isolated: -1,
    dragged: "",
    zoom: 1,
    look: "--cbt-source:red",
    clone: "width:200px",
    written: {
      slice: ["20", "20", "20", "20"],
      width: ["20px", "20px", "20px", "20px"],
      outset: ["0", "0", "0", "0"],
    },
    ...extra,
  };
}

/** Some markup, parsed. */
function parse(html) {
  const holder = document.createElement("div");
  holder.innerHTML = html;
  return holder;
}

describe("escape", () => {
  it("escapes what ends an attribute", () => {
    expect(escape(`a&"b"<c`)).toBe("a&amp;&quot;b&quot;&lt;c");
    expect(escape(5)).toBe("5");
  });
});

describe("pieceClass", () => {
  const piece = { zone: 2, drawn: false, kind: "corner" };

  it("tells a piece drawn or not, hovered, alone", () => {
    expect(pieceClass({ ...piece, drawn: true })).toBe(
      "cbt-border-image__piece cbt-border-image__piece--corner",
    );
    expect(pieceClass(piece, { hovered: 2, isolated: 2 }, "x")).toBe(
      "x x--corner x--empty x--hovered x--isolated",
    );
  });
});

describe("rectSvg", () => {
  it("draws no negative size", () => {
    expect(rectSvg({ x: 1, y: 2, width: -3, height: 4.12345 }, `a="b"`)).toBe(
      `<rect x="1" y="2" width="0" height="4.123" a="b"/>`,
    );
  });
});

describe("numberSvg", () => {
  it("numbers a piece with room for it, at the size of the page", () => {
    const rect = { x: 0, y: 0, width: 28, height: 14 };

    expect(numberSvg({ zone: 4, drawn: true }, rect)).toBe(
      `<text class="cbt-border-image__number" x="14" y="7" font-size="11">5</text>`,
    );
    expect(numberSvg({ zone: 4, drawn: false }, rect, 0.5)).toContain(
      `class="cbt-border-image__number cbt-border-image__number--empty" x="14" y="7" font-size="5.5"`,
    );
    expect(numberSvg({ zone: 4, drawn: true }, rect, 2)).toBe("");
  });
});

describe("edgeSvg", () => {
  const line = (group, axis, side = 0) => ({
    id: `${group}-${side}`,
    group,
    side,
    axis,
    at: 10,
    span: [0, 100],
  });
  const at = (point) => point;

  it("draws a line, its hit area, and a dot for a width", () => {
    const { line: l, handle } = edgeSvg(line("width", "y"), {
      locked: false,
      active: false,
      handleAt: at,
    });

    expect(l).toBe(
      `<g class="cbt-border-image__edge cbt-border-image__edge--width cbt-border-image__edge--ns" data-edge="width-0" style="--cbt-line: ${COLORS.width}"><line class="cbt-border-image__line" x1="0" y1="10" x2="100" y2="10"/><line class="cbt-border-image__hit" data-line="width-0" x1="0" y1="10" x2="100" y2="10"><title>width top</title></line></g>`,
    );
    expect(handle).toContain(
      `<circle class="cbt-border-image__handle" data-line="width-0" cx="50" cy="10" r="4"/>`,
    );
  });

  it("puts a slice's handle on the edge, an outset's aside", () => {
    expect(
      edgeSvg(line("slice", "x", 3), {
        locked: true,
        active: true,
        handleAt: at,
        unit: 0.5,
      }).handle,
    ).toBe(
      `<g class="cbt-border-image__edge cbt-border-image__edge--slice cbt-border-image__edge--locked cbt-border-image__edge--active cbt-border-image__edge--ew" style="--cbt-line: ${POINT_COLORS[0]}"><circle class="cbt-border-image__handle" data-line="slice-3" cx="10" cy="0" r="2"/></g>`,
    );
    expect(
      edgeSvg(line("outset", "y", 2), {
        locked: false,
        active: false,
        handleAt: ({ x, y }) => ({ x: x + 1, y }),
      }).handle,
    ).toContain(
      `<rect class="cbt-border-image__handle" data-line="outset-2" x="22.5" y="6.5" width="7" height="7" transform="rotate(45 26 10)"/>`,
    );
  });
});

describe("fit", () => {
  it("scales to fit, up to a limit", () => {
    expect(
      fit({ width: 200, height: 100 }, { width: 100, height: 100, scale: 4 }),
    ).toBe(0.5);
    expect(
      fit({ width: 10, height: 10 }, { width: 100, height: 100, scale: 4 }),
    ).toBe(4);
    expect(
      fit({ width: 0, height: 0 }, { width: 100, height: 100, scale: 4 }),
    ).toBe(4);
  });
});

describe("imageHtml", () => {
  it("paints the image as large as the render, then scales it", () => {
    const image = parse(
      imageHtml(
        model({}, { zoom: 2, look: `--cbt-source:url("a")` }),
        0.5,
        ";opacity:0.3",
      ),
    ).firstChild;

    expect(image.getAttribute("style")).toBe(
      `width:100px;height:50px;zoom:2;transform:scale(0.5);--cbt-source:url("a");opacity:0.3`,
    );
  });
});

describe("cloneHtml", () => {
  it("clips a copy of the element to a piece, and shows a rect of it", () => {
    const html = cloneHtml(
      model({ outset: four(px(5)) }, { zoom: 2, clone: `font-family:"A"` }),
      { x: -5, y: -5, width: 25, height: 25 },
      { x: -5, y: -5, width: 25, height: 25 },
      2,
    );
    const frame = parse(html).firstChild;

    expect(frame.getAttribute("style")).toBe("width:50px;height:50px");
    expect(frame.firstChild.getAttribute("style")).toBe("left:10px;top:10px");
    // As large as the element, then scaled: the render cuts it as its own.
    expect(frame.firstChild.firstChild.getAttribute("style")).toBe(
      `font-family:"A";zoom:2;transform:scale(2);clip-path:inset(-2.5px 90px 40px -2.5px)`,
    );
  });
});

describe("landing", () => {
  it("lands a corner or a stretched edge on its place", () => {
    const { pieces } = model().layout;

    expect(landing(pieces[0])).toEqual({
      rect: pieces[0].target,
      index: -1,
      rects: [],
    });
    expect(landing(pieces[1])).toEqual({
      rect: pieces[1].target,
      index: 0,
      rects: [pieces[1].target],
    });
  });

  it("lands a tiled edge on a whole tile, the middle one", () => {
    const { pieces } = model({
      width: four(px(10)),
      repeat: ["space", "repeat"],
    }).layout;

    // Top: 2 tiles of 80 spaced on 180, the second from 93.3.
    const top = landing(pieces[1]);
    expect(top.rect).toEqual({
      x: 103.33333333333334,
      y: 0,
      width: 80,
      height: 10,
    });
    expect([top.index, top.rects.length]).toEqual([1, 2]);
    // Left: tiles of 30 from -5 on 80, the only whole one from 25.
    const side = landing(pieces[3]);
    expect(side.rect).toEqual({ x: 0, y: 35, width: 10, height: 30 });
    expect([side.index, side.rects.length]).toEqual([1, 3]);
  });

  it("lands on a tile cut, or on its place without any", () => {
    const piece = {
      target: { x: 0, y: 0, width: 10, height: 10 },
      axis: "x",
    };

    expect(
      landing({ ...piece, tiles: [{ start: -2, size: 14 }] }).rect,
    ).toEqual({ x: -2, y: 0, width: 14, height: 10 });
    expect(landing({ ...piece, tiles: [] }).rect).toEqual(piece.target);
    expect(landing({ ...piece, tiles: null }).index).toBe(-1);
  });
});

describe("cropHtml", () => {
  it("shows a rect of the image, scaled up as it takes", () => {
    const frame = parse(
      cropHtml(model(), { x: 10, y: 1, width: 2, height: 0.5 }, 20),
    ).firstChild;

    expect(frame.getAttribute("style")).toBe("width:40px;height:10px");
    expect(frame.firstChild.getAttribute("style")).toBe(
      "left:-200px;top:-20px",
    );
    expect(
      frame.querySelector(".cbt-border-image__image").style.transform,
    ).toBe("scale(20)");
  });
});

describe("playing", () => {
  it("takes the corners, then the edges, then the middle", () => {
    expect(playOrder(model())).toEqual([0, 2, 6, 8, 1, 7, 3, 5]);
    expect(playOrder(model({ fill: true })).at(-1)).toBe(4);
    expect(duration(model())).toBe(7200);
    // Nothing drawn: still some time, not to divide by 0.
    expect(duration(model({ width: four(px(0)) }))).toBe(900);
  });

  it("tells the piece on its way", () => {
    expect(stepAt(model(), 0)).toEqual({ rank: 0, count: 8, zone: 0 });
    expect(stepAt(model(), 0.5)).toEqual({ rank: 4, count: 8, zone: 1 });
    expect(stepAt(model(), 1)).toEqual({ rank: 7, count: 8, zone: 5 });
    expect(stepAt(model({ width: four(px(0)) }), 0.5)).toEqual({
      rank: 0,
      count: 0,
      zone: -1,
    });
  });
});

describe("playHtml", () => {
  // The element 24 right of the image, at the scale of the render.
  const play = (m, t) => playHtml(m, t, 1, 224);
  const movers = (html) =>
    [...parse(html).querySelectorAll(".cbt-border-image__mover")].map((m) =>
      m.getAttribute("style"),
    );
  const taken = (html) =>
    [...parse(html).querySelectorAll(".cbt-border-image__taken")].map((m) =>
      m.getAttribute("style"),
    );
  /** When a piece of the order is a share of its way. */
  const at = (rank, local, count = 8) => (rank + local) / count;

  it("moves nothing before it starts", () => {
    expect(play(model(), 0)).toBe("");
  });

  it("takes each piece from the image in its turn", () => {
    const html = play(model(), at(0, 0.5));

    expect(taken(html)).toEqual(["left:0px;top:0px;width:20px;height:20px"]);
    expect(movers(html)).toHaveLength(1);
    const cut = parse(html).querySelector(
      ".cbt-border-image__mover .cbt-border-image__image",
    );
    expect(cut.getAttribute("style")).toContain(
      "clip-path:inset(0px 180px 80px 0px)",
    );
  });

  it("ends with the element as the render paints it, right of the image", () => {
    const html = play(model(), 1);

    expect(taken(html)).toHaveLength(8);
    expect(movers(html)).toEqual([
      "left:224px;top:0px;opacity:1",
      "left:404px;top:0px;opacity:1",
      "left:224px;top:80px;opacity:1",
      "left:404px;top:80px;opacity:1",
      "left:244px;top:0px;opacity:1",
      "left:244px;top:80px;opacity:1",
      "left:224px;top:20px;opacity:1",
      "left:404px;top:20px;opacity:1",
    ]);
    expect(
      parse(html).querySelectorAll(".cbt-border-image__clone"),
    ).toHaveLength(8);
  });

  it("moves a corner to its size there", () => {
    const html = play(
      model({ width: four(px(10)), fill: true }),
      at(0, 0.5, 9),
    );

    // Halfway, eased: from 20×20 in the image towards 10×10.
    expect(movers(html)).toEqual([
      "transform:translate(165.926px,0px) scale(0.63,0.63);opacity:1",
    ]);
  });

  it("lands a tiled edge as a single tile, then slides copies of it", () => {
    const tiled = model({ width: four(px(10)), repeat: ["space", "space"] });
    const clips = (t) =>
      [
        ...parse(play(tiled, t)).querySelectorAll(".cbt-border-image__clip"),
      ].map((clip) => [
        clip.getAttribute("style"),
        [...clip.children].map((copy) => copy.getAttribute("style")),
      ]);

    // Still on its way: no copy yet.
    expect(clips(at(4, 0.4))).toEqual([]);
    // The top edge landed on its second tile: a copy slides to the first,
    // cut at the ends of the edge.
    expect(clips(at(4, 0.5))).toEqual([
      [
        "left:234px;top:0px;width:180px;height:10px",
        ["transform:translate(80.361px,0px) scale(0.5,0.5);opacity:1"],
      ],
    ]);
    expect(clips(at(4, 5 / 6))[0][1]).toEqual([
      "transform:translate(1.81px,0px) scale(0.5,0.5);opacity:1",
    ]);
    // The left edge, spaced: a single copy.
    expect(clips(at(6, 5 / 6))[0][1]).toHaveLength(1);
    // Faded into the element.
    expect(clips(1)).toEqual([]);
  });

  it("slides the copies one after the other, the nearest first", () => {
    const repeated = model({
      width: four(px(10)),
      repeat: ["space", "repeat"],
    });
    const copies = (t) =>
      parse(play(repeated, t)).querySelector(".cbt-border-image__clip").children
        .length;

    // The left edge lands on its middle tile, of three.
    expect(copies(at(6, 7 / 12))).toBe(1);
    expect(copies(at(6, 5 / 6))).toBe(2);
  });

  it("fades a corner into the element once landed", () => {
    const styles = movers(play(model({ width: four(px(10)) }), at(0, 5 / 6)));

    expect(styles).toEqual([
      "transform:translate(224px,0px) scale(0.5,0.5);opacity:0.741",
      "left:224px;top:0px;opacity:0.259",
    ]);
  });

  it("fades an edge of too many tiles into the element", () => {
    const html = play(
      model({
        // Tiles of 1 on the top edge: 198 of them.
        slice: [num(20), num(90), num(20), num(90)],
        width: four(px(1)),
        repeat: ["repeat", "repeat"],
      }),
      at(4, 0.6),
    );

    expect(
      parse(html).querySelectorAll(".cbt-border-image__clip"),
    ).toHaveLength(0);
  });
});

describe("figureScale", () => {
  it("fits both figures side by side, up to a height and a limit", () => {
    // 142 for each figure, out of 440.
    expect(figureScale(model(), 440)).toBe(0.71);
    expect(
      figureScale(model({ box: { width: 20, height: 300 } }), 440),
    ).toBeCloseTo(0.667, 3);
    expect(figureScale(model({ box: { width: 10, height: 10 } }), 440)).toBe(4);
    // Taller, with the room.
    expect(
      figureScale(model({ box: { width: 200, height: 300 } }), 440, 600),
    ).toBeCloseTo(0.71, 3);
  });
});

describe("figuresHtml", () => {
  const figures = (m, t = 1) => parse(figuresHtml(m, t, 440));
  const chips = (holder, figure = 0) =>
    [
      ...holder
        .querySelectorAll(".cbt-border-image__figure")
        [figure].querySelectorAll(".cbt-border-image__chip"),
    ].map((chip) => [
      chip.className.match(/--(\w+) .*--(\w+)$/).slice(1),
      chip.textContent,
    ]);

  it("draws the image, then the element, side by side", () => {
    const holder = figures(model());
    const [image, element] = holder.querySelectorAll(
      ".cbt-border-image__figure",
    );

    // Each 40 + 142 + 16 wide, the arrow 44 between, in the middle of 200.
    expect(holder.firstChild.getAttribute("style")).toBe(
      "width:440px;height:284px",
    );
    expect(image.dataset.image).toBe("");
    expect(image.getAttribute("style")).toBe(
      "left:0px;top:64.5px;width:198px;height:155px",
    );
    expect(element.getAttribute("style")).toBe(
      "left:242px;top:64.5px;width:198px;height:155px",
    );
    expect(
      [...holder.querySelectorAll("figcaption")].map((c) => c.textContent),
    ).toEqual(["image", "element"]);
    // In pixels of the render, the margin around included.
    expect(image.querySelector("svg").getAttribute("viewBox")).toBe(
      "-56.338 -56.338 278.873 218.31",
    );
    expect(image.querySelectorAll("[data-zone]")).toHaveLength(9);
    expect(element.querySelectorAll("[data-zone][data-isolate]")).toHaveLength(
      9,
    );
    expect(element.querySelector(".cbt-border-image__clone")).not.toBeNull();
    expect(holder.querySelector(".cbt-border-image__flight")).toBeNull();
    expect(
      holder.querySelector(".cbt-border-image__arrow").getAttribute("class"),
    ).toBe("cbt-border-image__arrow");
  });

  it("spreads the figures over the width the height leaves", () => {
    // 50 tall at most: 100 wide, each in the middle of its half of 640.
    const holder = parse(figuresHtml(model(), 1, 640, 50));
    const [image, element] = holder.querySelectorAll(
      ".cbt-border-image__figure",
    );

    expect(holder.firstChild.getAttribute("style")).toBe(
      "width:640px;height:134px",
    );
    expect(image.style.left).toBe("71px");
    expect(element.getAttribute("style")).toBe(
      "left:413px;top:0px;width:156px;height:134px",
    );
    // The arrow halfway.
    expect(holder.querySelector(".cbt-border-image__arrow").style.left).toBe(
      "310px",
    );
  });

  it("writes the values by their lines, as written and in pixels", () => {
    const holder = figures(model());

    // From the top left: the top line, the left, the bottom, the right.
    expect(chips(holder)).toEqual([
      [["slice", "y"], "2020px"],
      [["slice", "x"], "2020px"],
      [["slice", "y"], "2020px"],
      [["slice", "x"], "2020px"],
    ]);
    // A width written in pixels, written once.
    expect(chips(holder, 1)).toEqual([
      [["width", "y"], "20px"],
      [["width", "x"], "20px"],
      [["width", "y"], "20px"],
      [["width", "x"], "20px"],
    ]);
    expect(
      [...holder.querySelectorAll("[class^=cbt-border-image__dim]")].map(
        (dim) => dim.textContent,
      ),
    ).toEqual(["200", "100"]);
  });

  it("slides a value past the one before, too near", () => {
    const holder = figures(model({ slice: four(num(90)) }));
    const across = [
      ...holder.querySelectorAll(".cbt-border-image__chip--x"),
    ].map((chip) => chip.style.left);

    // The lines at 90 and 110, 14 apart: the second chip 44 past the first.
    expect(across.slice(0, 2)).toEqual(["103.9px", "147.9px"]);
  });

  it("puts the handles of the lines out of the image, and of the element", () => {
    const holder = figures(
      model({}, { locked: ["slice-1"], dragged: "slice-0" }),
    );
    const handles = (figure) =>
      [
        ...holder.querySelectorAll(`${figure} circle.cbt-border-image__handle`),
      ].map((handle) => [
        handle.dataset.line,
        handle.getAttribute("cx"),
        handle.getAttribute("cy"),
      ]);

    // 8 pixels of the panel out, the top and bottom left, the others above.
    expect(handles("[data-image]")).toEqual([
      ["slice-0", "-11.268", "20"],
      ["slice-1", "180", "-11.268"],
      ["slice-2", "-11.268", "80"],
      ["slice-3", "20", "-11.268"],
    ]);
    // The widths of 20 lie where the slices of 20 are.
    expect(handles(".cbt-border-image__guides")).toEqual([
      ["width-0", "-11.268", "20"],
      ["width-1", "180", "-11.268"],
      ["width-2", "-11.268", "80"],
      ["width-3", "20", "-11.268"],
    ]);
    expect(holder.querySelector(".cbt-border-image__edge--active")).not.toBe(
      null,
    );
    expect(holder.querySelector(".cbt-border-image__edge--locked")).not.toBe(
      null,
    );
  });

  it("marks the piece hovered, and the piece alone", () => {
    const holder = figures(model({}, { hovered: 1, isolated: 3 }));

    expect(
      holder.querySelectorAll(".cbt-border-image__piece--hovered"),
    ).toHaveLength(2);
    expect(
      holder.querySelectorAll(".cbt-border-image__piece--isolated"),
    ).toHaveLength(2);
  });

  it("draws the border box and the outsets past it", () => {
    const holder = figures(
      model(
        { outset: [px(10), px(0), px(0), px(0)] },
        {
          written: {
            slice: ["20", "20", "20", "20"],
            width: ["20px", "20px", "20px", "20px"],
            outset: ["10px", "0", "0", "0"],
          },
        },
      ),
    );

    expect(holder.querySelector(".cbt-border-image__box")).not.toBeNull();
    expect(chips(holder, 1).map(([[group]]) => group)).toContain("outset");
    // The 4 widths and the top outset, each with its handle out of the area.
    const guides = holder.querySelector(".cbt-border-image__guides");
    expect(guides.querySelectorAll(".cbt-border-image__line")).toHaveLength(5);
    expect(
      [...guides.querySelectorAll("[data-line].cbt-border-image__handle")].map(
        (handle) => handle.dataset.line,
      ),
    ).toEqual(["outset-0", "width-0", "width-1", "width-2", "width-3"]);
    // The top outset's diamond, on the top of the area it grows.
    expect(
      guides
        .querySelector('rect[data-line="outset-0"]')
        .getAttribute("transform"),
    ).toBe("rotate(45 -11.268 -10)");
  });

  it("plays the pieces from the one to the other", () => {
    const holder = figures(model(), 0.5);

    expect(holder.querySelector(".cbt-border-image__at--ghost")).not.toBe(null);
    expect(
      holder.querySelector(".cbt-border-image__arrow--playing"),
    ).not.toBeNull();
    const flight = holder.querySelector(".cbt-border-image__flight");
    expect(flight.getAttribute("style")).toBe("left:40px;top:104.5px");
    // Halfway: the corners, and nothing of the top edge yet.
    expect(flight.querySelectorAll(".cbt-border-image__taken")).toHaveLength(4);
  });
});

describe("piecesHtml", () => {
  const rows = (m, t = 1) => [
    ...parse(piecesHtml(m, t)).querySelectorAll(".cbt-border-image__row"),
  ];

  it("tells each piece, cut then landed, and what happens to it", () => {
    const [corner, top, , , middle] = rows(model());

    expect(corner.dataset.zone).toBe("0");
    expect(corner.querySelector(".cbt-border-image__badge").textContent).toBe(
      "1",
    );
    expect(corner.querySelector(".cbt-border-image__about").textContent).toBe(
      "Top-left cornerKept as is20×20 → 20×20",
    );
    expect(
      corner.querySelectorAll(
        ".cbt-border-image__thumb .cbt-border-image__frame",
      ),
    ).toHaveLength(2);
    expect(top.querySelector("[data-repeat]").textContent).toBe("stretch");
    expect(top.querySelector("[data-repeat]").dataset.repeat).toBe("0");
    // Not drawn: no thumbnail around the element, and why.
    expect(
      middle.querySelector(".cbt-border-image__thumb--landed").innerHTML,
    ).toBe('<span class="cbt-border-image__missing"></span>');
    expect(
      middle.querySelector(".cbt-border-image__what--warning").textContent,
    ).toBe("Hidden: needs fill");
    expect(middle.querySelector("[data-fill]").textContent).toBe("+ fill");
  });

  it("switches the repeat of an axis, and fill", () => {
    const [, , , left, middle] = rows(model({ fill: true }));

    expect(left.querySelector("[data-repeat]").dataset.repeat).toBe("1");
    const fill = middle.querySelector("[data-fill]");
    expect(fill.textContent).toBe("− fill");
    expect(fill.getAttribute("aria-pressed")).toBe("true");
  });

  it("locks its buttons in a var()", () => {
    const buttons = rows(model({}, { opaque: true })).flatMap((row) => [
      ...row.querySelectorAll("[data-repeat], [data-fill]"),
    ]);

    expect(buttons).toHaveLength(5);
    expect(buttons.every((button) => button.disabled)).toBe(true);
  });

  it("lights the piece hovered, and the eye of the piece alone", () => {
    const all = rows(model({}, { hovered: 2, isolated: 6 }));

    expect(all[2].className).toContain("cbt-border-image__row--lit");
    expect(
      all.map((row) =>
        row.querySelector("[data-isolate]").getAttribute("aria-pressed"),
      ),
    ).toEqual([
      "false",
      "false",
      "false",
      "false",
      "false",
      "false",
      "true",
      "false",
      "false",
    ]);
    expect(all[6].querySelector("[data-isolate]").dataset.isolate).toBe("6");
  });

  it("marks where the tiles of an edge meet", () => {
    const [, top, , left] = rows(
      model({ width: four(px(10)), repeat: ["round", "round"] }),
    );

    expect(top.querySelectorAll(".cbt-border-image__seam--x")).toHaveLength(1);
    expect(left.querySelectorAll(".cbt-border-image__seam--y")).toHaveLength(2);
    // Too many to mark.
    const [, many] = rows(
      model({ width: four(px(1)), repeat: ["round", "round"] }),
    );
    expect(many.querySelectorAll(".cbt-border-image__seam")).toHaveLength(0);
  });

  it("enlarges a piece too thin to see at the scale of its place", () => {
    const [corner] = rows(model({ slice: four(num(0.5)) }));
    const [cut, landed] = corner.querySelectorAll(".cbt-border-image__frame");

    expect(cut.getAttribute("style")).toBe("width:40px;height:40px");
    expect(landed.getAttribute("style")).toBe("width:40px;height:40px");
  });

  it("cuts nothing where the slices overlap", () => {
    const [, top] = rows(model({ slice: four(num(150)) }));

    expect(top.querySelector(".cbt-border-image__thumb--cut").innerHTML).toBe(
      '<span class="cbt-border-image__missing"></span>',
    );
  });

  it("follows the pieces as they play", () => {
    // The fifth piece, the top edge, on its way.
    const all = rows(model(), 0.55);

    expect(
      all.map(
        (row) => row.querySelector(".cbt-border-image__badge").textContent,
      ),
    ).toEqual(["✓", "2", "✓", "4", "5", "6", "✓", "8", "✓"]);
    expect(all[1].className).toContain("--lit");
    expect(
      all[1].querySelector(".cbt-border-image__badge").className,
    ).toContain("--now");
    expect(
      all[0].querySelector(".cbt-border-image__badge").className,
    ).toContain("--done");
    expect(all[3].className).toContain("--later");
    // Never drawn: neither done nor later.
    expect(all[4].className).toBe("cbt-border-image__row");
  });
});
