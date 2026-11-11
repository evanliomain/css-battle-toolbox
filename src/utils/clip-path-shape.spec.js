import { describe, expect, it } from "vitest";
import { layoutShape, parseClipPath, shortSides } from "./clip-path-shape";

const box = {
  width: 200,
  height: 100,
  fontSize: 10,
  rootFontSize: 16,
  viewport: { width: 400, height: 300 },
};

function layout(value) {
  return layoutShape(parseClipPath(value), box);
}

/** Where each handle stands, rounded. */
function handles(value) {
  return Object.fromEntries(
    layout(value).handles.map(({ id, x, y }) => [
      id,
      [Math.round(x), Math.round(y)],
    ]),
  );
}

function handle(value, id) {
  return layout(value).handles.find((h) => h.id === id);
}

/** Applies changes of a value's text. */
function apply(text, changes) {
  return [...changes]
    .sort((a, b) => b.from - a.from)
    .reduce(
      (out, { from, to = from, insert }) =>
        out.slice(0, from) + insert + out.slice(to),
      text,
    );
}

/** The value once a handle is dragged to a point. */
function drag(value, id, point, options) {
  return apply(value, handle(value, id).write(point, options));
}

/** The value once a new point is added with the command `add`. */
function addWith(add, value, id, point) {
  const added = layoutShape(parseClipPath(value), box, { add }).handles.find(
    (h) => h.id === id,
  );
  return apply(value, added.write(point));
}

describe("parseClipPath", () => {
  it("finds the shape among the values", () => {
    const { shape } = parseClipPath(" border-box circle(10px)");

    expect(shape).toMatchObject({ name: "circle", from: 12, to: 24 });
  });

  it("finds no shape in none", () => {
    expect(parseClipPath("none").shape).toBeNull();
  });

  it("reads an unclosed shape up to the end", () => {
    expect(parseClipPath("polygon(1px 2px").shape).toMatchObject({
      close: 15,
      to: 15,
    });
  });

  it("skips comments", () => {
    expect(handles("polygon(1px/* a */2px,3px 4px,5px 6px)").v0).toEqual([
      1, 2,
    ]);
  });

  it("keeps a stray parenthesis and comma at the root", () => {
    const { nodes } = parseClipPath("),#");

    expect(nodes.map(({ type }) => type)).toEqual(["other", "comma", "other"]);
  });
});

describe("layoutShape", () => {
  it("has nothing to draw without a shape", () => {
    expect(layout("none")).toEqual({ path: null, handles: [], lines: [] });
  });

  describe("polygon()", () => {
    const value = "polygon(50% 0,100% 100%,0 100%)";

    it("draws its points", () => {
      expect(layout(value).path).toBe("M 100 0 L 200 100 L 0 100 Z");
      expect(handles(value)).toMatchObject({
        v0: [100, 0],
        v1: [200, 100],
        v2: [0, 100],
      });
    });

    it("moves a point, keeping the units", () => {
      expect(drag(value, "v0", { x: 20, y: 30 })).toBe(
        "polygon(10% 30%,100% 100%,0 100%)",
      );
    });

    it("gives a 0 the unit of the shape", () => {
      expect(drag(value, "v2", { x: 20, y: 100 })).toBe(
        "polygon(50% 0,100% 100%,10% 100%)",
      );
    });

    it("gives a 0 the unit the drag started with", () => {
      expect(
        drag(
          "polygon(0 0,1px 1px,2px 2px)",
          "v0",
          { x: 20, y: 10 },
          {
            units: { x: "%", y: "%" },
          },
        ),
      ).toBe("polygon(10% 10%,1px 1px,2px 2px)");
    });

    it("fine tunes to a decimal", () => {
      expect(drag(value, "v0", { x: 20.3, y: 0 }, { precision: 1 })).toBe(
        "polygon(10.2% 0,100% 100%,0 100%)",
      );
    });

    it("keeps a golfed value valid", () => {
      expect(drag("polygon(50%0,1px 1px,2px 2px)", "v0", { x: 5, y: 0 })).toBe(
        "polygon(3%0,1px 1px,2px 2px)",
      );
      expect(drag("polygon(50%0%,1px 1px,2px 2px)", "v0", { x: 0, y: 0 })).toBe(
        "polygon(0 0,1px 1px,2px 2px)",
      );
    });

    it("leaves a point in calc() where it is", () => {
      const v = "polygon(calc(1px) 5px,1px 1px,2px 2px)";

      expect(handles(v).v0).toBeUndefined();
      expect(layout(v).path).toBeNull();
    });

    it("moves only the free coordinate of a point", () => {
      const v = "polygon(10px 5foo,1px 1px,2px 2px)";

      expect(handle(v, "v0")).toBeUndefined();
      expect(
        drag("polygon(10px left,1px 1px,2px 2px)", "v1", { x: 3, y: 4 }),
      ).toBe("polygon(10px left,3px 4px,2px 2px)");
    });

    it("skips the fill rule and round", () => {
      expect(handles("polygon(evenodd round 2px,1px 2px,3px 4px)")).toEqual({
        v0: [1, 2],
        v1: [3, 4],
        m0: [2, 3],
      });
    });

    it("adds a point in the middle of each side", () => {
      expect(handles(value)).toMatchObject({
        m0: [150, 50],
        m1: [100, 100],
        m2: [50, 50],
      });
      expect(drag(value, "m1", { x: 100, y: 80 })).toBe(
        "polygon(50% 0,100% 100%,50% 80%,0 100%)",
      );
      expect(handle(value, "m1").next).toBe("v2");
    });

    it("adds a point with the spacing of the code", () => {
      expect(drag("polygon(0 0, 2px 0, 2px 2px)", "m0", { x: 1, y: 0 })).toBe(
        "polygon(0 0, 1px 0, 2px 0, 2px 2px)",
      );
    });

    it("removes a point and its comma", () => {
      const square = "polygon(0 0,1px 0,1px 1px,0 1px)";
      const remove = (id) => apply(square, handle(square, id).remove());

      expect(remove("v0")).toBe("polygon(1px 0,1px 1px,0 1px)");
      expect(remove("v2")).toBe("polygon(0 0,1px 0,0 1px)");
    });

    it("keeps a triangle", () => {
      expect(handle(value, "v0").remove).toBeNull();
    });

    it("has a single side between two points", () => {
      expect(Object.keys(handles("polygon(0 0,2px 2px)"))).toEqual([
        "v0",
        "v1",
        "m0",
      ]);
    });

    it("has no outline without a point", () => {
      expect(layout("polygon()").path).toBe("");
    });
  });

  describe("circle()", () => {
    it("draws its center and its radius", () => {
      expect(handles("circle(10px at 20px 30px)")).toEqual({
        c: [20, 30],
        r: [30, 30],
      });
      expect(layout("circle(10px at 20px 30px)").path).toBe(
        "M 10 30 A 10 10 0 1 0 30 30 A 10 10 0 1 0 10 30 Z",
      );
    });

    it("measures a percentage radius against the diagonal", () => {
      expect(handles("circle(10%)").r[0]).toBe(100 + 16);
    });

    it("is centered and reaches the closest side by default", () => {
      expect(handles("circle()")).toEqual({ c: [100, 50], r: [150, 50] });
      expect(handles("circle(closest-side)").r).toEqual([150, 50]);
      expect(handles("circle(farthest-side)").r).toEqual([200, 50]);
    });

    it("reads the position keywords", () => {
      expect(handles("circle(at top)").c).toEqual([100, 0]);
      expect(handles("circle(at right)").c).toEqual([200, 50]);
      expect(handles("circle(at top left)").c).toEqual([0, 0]);
      expect(handles("circle(at 10px bottom)").c).toEqual([10, 100]);
    });

    it("moves the center", () => {
      expect(drag("circle(10px at center)", "c", { x: 50, y: 25 })).toBe(
        "circle(10px at 50px 25px)",
      );
    });

    it("adds the center", () => {
      expect(drag("circle(10%)", "c", { x: 50, y: 25 })).toBe(
        "circle(10% at 25% 25%)",
      );
      expect(drag("circle()", "c", { x: 50, y: 25 })).toBe(
        "circle(at 25% 25%)",
      );
    });

    it("leaves a position of 3 values where it is", () => {
      const v = "circle(at right 1px top 2px)";

      expect(handle(v, "c").free).toEqual({ x: false, y: false });
      expect(handle(v, "c").write({ x: 0, y: 0 })).toEqual([]);
    });

    it("leaves an unknown keyword where it is", () => {
      expect(handle("circle(at foo)", "c")).toBeUndefined();
    });

    it("resizes the radius", () => {
      expect(drag("circle(10px at 20px 30px)", "r", { x: 20, y: 70 })).toBe(
        "circle(40px at 20px 30px)",
      );
      expect(drag("circle(closest-side)", "r", { x: 130, y: 50 })).toBe(
        "circle(19%)",
      );
    });

    it("adds the radius", () => {
      expect(drag("circle()", "r", { x: 130, y: 50 })).toBe("circle(19%)");
      expect(drag("circle(at 0 0)", "r", { x: 30, y: 0 })).toBe(
        "circle(19% at 0 0)",
      );
    });
  });

  describe("ellipse()", () => {
    const value = "ellipse(20px 10px at 50px 50px)";

    it("draws its center and its radii", () => {
      expect(handles(value)).toEqual({
        c: [50, 50],
        rx: [70, 50],
        ry: [50, 60],
      });
      expect(handle(value, "rx").free).toEqual({ x: true, y: false });
      expect(handle(value, "ry").free).toEqual({ x: false, y: true });
    });

    it("resizes a radius", () => {
      expect(drag(value, "rx", { x: 10, y: 0 })).toBe(
        "ellipse(40px 10px at 50px 50px)",
      );
      expect(drag(value, "ry", { x: 0, y: 80 })).toBe(
        "ellipse(20px 30px at 50px 50px)",
      );
    });

    it("reaches the sides by default", () => {
      expect(handles("ellipse()")).toEqual({
        c: [100, 50],
        rx: [200, 50],
        ry: [100, 100],
      });
      expect(
        handles("ellipse(farthest-side farthest-side at 50px 20px)"),
      ).toMatchObject({ rx: [200, 20], ry: [50, 100] });
    });

    it("writes both radii when they were left out", () => {
      expect(drag("ellipse()", "rx", { x: 120, y: 0 })).toBe(
        "ellipse(10% 50%)",
      );
      expect(drag("ellipse(at center)", "ry", { x: 0, y: 70 })).toBe(
        "ellipse(50% 20% at center)",
      );
    });

    it("completes a single radius", () => {
      expect(drag("ellipse(5px at center)", "rx", { x: 120, y: 0 })).toBe(
        "ellipse(20px 50px at center)",
      );
    });
  });

  describe("inset()", () => {
    it("draws its sides", () => {
      const value = "inset(10px 20px 30px 40px)";

      expect(handles(value)).toEqual({
        t: [110, 10],
        r: [180, 40],
        b: [110, 70],
        l: [40, 40],
      });
      expect(layout(value).path).toBe("M 40 10 L 180 10 L 180 70 L 40 70 Z");
    });

    it("moves a side", () => {
      const value = "inset(10px 20px 30px 40px)";

      expect(drag(value, "t", { x: 0, y: 5 })).toBe(
        "inset(5px 20px 30px 40px)",
      );
      expect(drag(value, "r", { x: 150, y: 0 })).toBe(
        "inset(10px 50px 30px 40px)",
      );
      expect(drag(value, "b", { x: 0, y: 50 })).toBe(
        "inset(10px 20px 50px 40px)",
      );
      expect(drag(value, "l", { x: 0, y: 0 })).toBe("inset(10px 20px 30px 0)");
    });

    it("writes the sides shared by a shorthand apart", () => {
      expect(drag("inset(10%)", "t", { x: 0, y: 0 })).toBe("inset(0 10% 10%)");
      expect(drag("inset(10% 5%)", "l", { x: 0, y: 0 })).toBe(
        "inset(10% 5% 10% 0)",
      );
    });

    it("parts a value from the one glued before it", () => {
      expect(drag("inset(1px2px 3px 4px)", "r", { x: 195, y: 0 })).toBe(
        "inset(1px 5px 3px 4px)",
      );
    });

    it("shortens the sides back", () => {
      expect(drag("inset(10% 20% 0)", "b", { x: 0, y: 90 })).toBe(
        "inset(10% 20%)",
      );
    });

    it("adds the sides when there are none", () => {
      expect(drag("inset()", "t", { x: 0, y: 10 })).toBe("inset(10% 0 0)");
      expect(drag("inset(round 5px)", "t", { x: 0, y: 10 })).toBe(
        "inset(10px 0 0 round 5px)",
      );
    });

    it("keeps round", () => {
      expect(drag("inset(1px round 5px)", "t", { x: 0, y: 2 })).toBe(
        "inset(2px 1px 1px round 5px)",
      );
    });

    it("moves nothing with more than 4 sides", () => {
      const value = "inset(1px 1px 1px 1px 1px)";

      expect(handle(value, "t").free).toEqual({ x: false, y: false });
      expect(handle(value, "t").write({ x: 0, y: 0 })).toEqual([]);
    });
  });

  describe("shortSides", () => {
    it.each([
      [["1", "2", "3", "4"], "1 2 3 4"],
      [["1", "2", "3", "2"], "1 2 3"],
      [["1", "2", "1", "2"], "1 2"],
      [["1", "1", "1", "1"], "1"],
      [["1", "1", "2", "1"], "1 1 2"],
    ])("writes %j as %s", (sides, text) => {
      expect(shortSides(sides)).toBe(text);
    });
  });

  describe("rect()", () => {
    const value = "rect(10px 150px 90px auto)";

    it("draws its sides from the top and the left", () => {
      expect(handles(value)).toEqual({
        t: [75, 10],
        r: [150, 50],
        b: [75, 90],
        l: [0, 50],
      });
      expect(handles("rect(auto auto auto auto)")).toMatchObject({
        r: [200, 50],
        b: [100, 100],
      });
    });

    it("moves a side, auto too", () => {
      expect(drag(value, "r", { x: 100, y: 0 })).toBe(
        "rect(10px 100px 90px auto)",
      );
      expect(drag(value, "l", { x: 20, y: 0 })).toBe(
        "rect(10px 150px 90px 20px)",
      );
      expect(drag(value, "t", { x: 0, y: 20 })).toBe(
        "rect(20px 150px 90px auto)",
      );
    });

    it("leaves an unknown keyword where it is", () => {
      expect(handles("rect(foo 1px 1px 1px)").t).toBeUndefined();
    });

    it("stands on the edges of the box while its sides are not written", () => {
      expect(handles("rect()")).toEqual({
        t: [100, 0],
        r: [200, 50],
        b: [100, 100],
        l: [0, 50],
      });
    });

    it("writes its 4 sides once one is moved", () => {
      expect(drag("rect()", "r", { x: 150, y: 0 })).toBe("rect(0 75% 100% 0)");
      expect(drag("rect(10px 50%", "b", { x: 0, y: 80 })).toBe(
        "rect(10px 50% 80px 0",
      );
      expect(drag("rect(round 5px)", "t", { x: 0, y: 10 })).toBe(
        "rect(10px 100% 100% 0 round 5px)",
      );
    });

    it("needs at most 4 sides", () => {
      expect(layout("rect(1px 2px 3px 4px 5px)").handles).toEqual([]);
    });
  });

  describe("xywh()", () => {
    const value = "xywh(10px 20px 100px 50px round 2px)";

    it("draws its corners", () => {
      expect(handles(value)).toEqual({ tl: [10, 20], br: [110, 70] });
      expect(layout(value).path).toBe("M 10 20 L 110 20 L 110 70 L 10 70 Z");
    });

    it("moves the top left corner, the other one staying", () => {
      expect(drag(value, "tl", { x: 30, y: 10 })).toBe(
        "xywh(30px 10px 80px 60px round 2px)",
      );
      expect(drag(value, "tl", { x: 200, y: 100 })).toBe(
        "xywh(200px 100px 0 0 round 2px)",
      );
    });

    it("moves the bottom right corner", () => {
      expect(drag(value, "br", { x: 60, y: 40 })).toBe(
        "xywh(10px 20px 50px 20px round 2px)",
      );
      expect(drag(value, "br", { x: 0, y: 0 })).toBe(
        "xywh(10px 20px 0 0 round 2px)",
      );
    });

    it("leaves a size in calc() as it is", () => {
      expect(
        drag("xywh(10px 20px calc(1px) 50px)", "tl", { x: 30, y: 10 }),
      ).toBe("xywh(30px 10px calc(1px) 60px)");
    });

    it("covers the box while its values are not written", () => {
      expect(handles("xywh()")).toEqual({ tl: [0, 0], br: [200, 100] });
    });

    it("writes its 4 values once a corner is moved", () => {
      expect(drag("xywh()", "br", { x: 100, y: 50 })).toBe("xywh(0 0 50% 50%)");
      expect(drag("xywh(10px 20px", "tl", { x: 30, y: 10 })).toBe(
        "xywh(30px 10px 180px 110px",
      );
    });

    it("needs at most 4 values", () => {
      expect(layout("xywh(1px 2px 3px 4px 5px)").handles).toEqual([]);
    });
  });

  describe("shape()", () => {
    it("draws its points", () => {
      const value =
        "shape(evenodd from 0 0, line to 100% 0, line by 0 50%, hline to center, vline by 10px, hline by -10px, vline to top, close)";

      expect(handles(value)).toEqual({
        from: [0, 0],
        p0: [200, 0],
        p1: [200, 50],
        p2: [100, 50],
        p3: [100, 60],
        p4: [90, 60],
        p5: [90, 0],
        m0: [100, 0],
        m1: [200, 25],
        m2: [150, 50],
        m3: [100, 55],
        m4: [95, 60],
        m5: [90, 30],
        m6: [45, 0],
      });
      expect(layout(value).path).toBe(
        "M 0 0 L 200 0 L 200 50 L 100 50 L 100 60 L 90 60 L 90 0 Z",
      );
    });

    it("moves the start", () => {
      expect(drag("shape(from 0 0,close)", "from", { x: 20, y: 10 })).toBe(
        "shape(from 10% 10%,close)",
      );
    });

    it("moves an absolute point", () => {
      expect(
        drag("shape(from 0 0,line to 10px 10px)", "p0", { x: 20, y: 30 }),
      ).toBe("shape(from 0 0,line to 20px 30px)");
    });

    it("moves a relative point from the previous one", () => {
      expect(
        drag("shape(from 10px 10px,line by 5px 5px)", "p0", { x: 20, y: 30 }),
      ).toBe("shape(from 10px 10px,line by 10px 20px)");
    });

    it("keeps the next relative point where it is", () => {
      expect(
        drag("shape(from 0 0,line to 10px 10px,line by 10px 0)", "p0", {
          x: 20,
          y: 30,
        }),
      ).toBe("shape(from 0 0,line to 20px 30px,line by 0 -20px)");
      expect(
        drag("shape(from 0 0,line by 10px 10px)", "from", { x: 4, y: 2 }),
      ).toBe("shape(from 4px 2px,line by 6px 8px)");
      expect(
        drag("shape(from 0 0,line to 10px 10px,hline by 10px)", "p0", {
          x: 5,
          y: 10,
        }),
      ).toBe("shape(from 0 0,line to 5px 10px,hline by 15px)");
    });

    it("keeps the next relative point where it is, once rounded", () => {
      expect(
        drag("shape(from 0 0,line to 10% 10%,line by 10% 0)", "p0", {
          x: 41.2,
          y: 30,
        }),
      ).toBe("shape(from 0 0,line to 21% 30%,line by -1% -20%)");
    });

    it("keeps the next point where it is from a start it cannot move", () => {
      const value = "shape(from right 10px top,line by 10px 0)";

      expect(handle(value, "from").free).toEqual({ x: false, y: false });
      expect(drag(value, "from", { x: 0, y: 0 })).toBe(value);
    });

    it("keeps the next curve where it is", () => {
      expect(
        drag(
          "shape(from 0 0,line to 10px 0,curve by 10px 0 with 5px 5px)",
          "p0",
          { x: 0, y: 10 },
        ),
      ).toBe(
        "shape(from 0 0,line to 0 10px,curve by 20px -10px with 15px -5px)",
      );
      expect(
        drag(
          "shape(from 0 0,line to 10px 0,curve by 10px 0 with 1px 1px from end / 2px 2px from origin)",
          "p0",
          { x: 0, y: 10 },
        ),
      ).toBe(
        "shape(from 0 0,line to 0 10px,curve by 20px -10px with 1px 1px from end / 2px 2px from origin)",
      );
    });

    it("adds a point in the middle of a line", () => {
      const value = "shape(from 0 0,line to 100px 0,close)";

      expect(handle(value, "m0").next).toBe("p0");
      expect(drag(value, "m0", { x: 50, y: 20 })).toBe(
        "shape(from 0 0,line to 50px 20px,line to 100px 0,close)",
      );
      expect(
        drag("shape(from 0 0, line by 100px 0)", "m0", { x: 50, y: 20 }),
      ).toBe("shape(from 0 0, line by 50px 20px, line by 50px -20px)");
    });

    it("adds a point in the middle of a horizontal or vertical line", () => {
      expect(
        drag("shape(from 0 0,hline to 100px)", "m0", { x: 50, y: 20 }),
      ).toBe("shape(from 0 0,line to 50px 20px,line to 100px 0)");
      expect(
        drag("shape(from 0 0,vline by 100px)", "m0", { x: 20, y: 50 }),
      ).toBe("shape(from 0 0,line by 20px 50px,line by -20px 50px)");
    });

    it("adds a point on the way back to the start", () => {
      const value = "shape(from 0 0,line to 100px 0,line to 100px 100px,close)";

      expect(handles(value).m2).toEqual([50, 50]);
      expect(drag(value, "m2", { x: 40, y: 60 })).toBe(
        "shape(from 0 0,line to 100px 0,line to 100px 100px,line to 40px 60px,close)",
      );
    });

    it("adds a point with the command picked", () => {
      const add = (kind) =>
        addWith(kind, "shape(from 0 0,line to 100px 0)", "m0", {
          x: 50,
          y: 20,
        });

      expect(add("line")).toBe(
        "shape(from 0 0,line to 50px 20px,line to 100px 0)",
      );
      expect(add("hline")).toBe(
        "shape(from 0 0,hline to 50px,line to 100px 0)",
      );
      expect(add("vline")).toBe(
        "shape(from 0 0,vline to 20px,line to 100px 0)",
      );
      expect(add("curve")).toBe(
        "shape(from 0 0,curve to 50px 20px with 25px 10px,line to 100px 0)",
      );
      expect(add("cubic")).toBe(
        "shape(from 0 0,curve to 50px 20px with 17px 7px / 33px 13px,line to 100px 0)",
      );
      expect(add("smooth")).toBe(
        "shape(from 0 0,smooth to 50px 20px,line to 100px 0)",
      );
      expect(add("arc")).toBe(
        "shape(from 0 0,arc to 50px 20px of 27px,line to 100px 0)",
      );
    });

    it("adds a relative point before a relative command", () => {
      expect(
        addWith("hline", "shape(from 0 0,line by 100px 0)", "m0", {
          x: 50,
          y: 20,
        }),
      ).toBe("shape(from 0 0,hline by 50px,line by 50px 0)");
      expect(
        addWith("curve", "shape(from 0 0,line by 100px 0)", "m0", {
          x: 50,
          y: 20,
        }),
      ).toBe(
        "shape(from 0 0,curve by 50px 20px with 25px 10px,line by 50px -20px)",
      );
    });

    it("keeps a horizontal line cut along its axis", () => {
      expect(
        addWith("hline", "shape(from 0 0,hline by 100px)", "m0", {
          x: 50,
          y: 20,
        }),
      ).toBe("shape(from 0 0,hline by 50px,hline by 50px)");
      expect(
        addWith("vline", "shape(from 0 0,hline to 100px)", "m0", {
          x: 50,
          y: 20,
        }),
      ).toBe("shape(from 0 0,vline to 20px,line to 100px 0)");
    });

    it("adds an absolute point on the way back to the start", () => {
      expect(
        addWith(
          "curve",
          "shape(from 0 0,line by 100px 0,line by 0 100px,close)",
          "m2",
          { x: 40, y: 60 },
        ),
      ).toBe(
        "shape(from 0 0,line by 100px 0,line by 0 100px,curve to 40px 60px with 70px 80px,close)",
      );
    });

    it("cuts a curve in 2 with a curve, drawing the same", () => {
      const value = "shape(from 0 0,curve to 100px 0 with 50px 100px)";

      expect(handles(value).m0).toEqual([50, 50]);
      expect(addWith("curve", value, "m0", { x: 50, y: 50 })).toBe(
        "shape(from 0 0,curve to 50px 50px with 25px 50px,curve to 100px 0 with 75px 50px)",
      );
      expect(
        addWith(
          "cubic",
          "shape(from 0 0, curve by 80px 0 with 0 80px / 80px 80px)",
          "m0",
          { x: 40, y: 60 },
        ),
      ).toBe(
        "shape(from 0 0, curve by 40px 60px with 0 40px / 20px 60px, curve by 40px -60px with 20px 0 / 40px -20px)",
      );
    });

    it("adds another command before a curve", () => {
      expect(
        drag("shape(from 0 0,curve to 100px 0 with 50px 100px)", "m0", {
          x: 50,
          y: 50,
        }),
      ).toBe(
        "shape(from 0 0,line to 50px 50px,curve to 100px 0 with 50px 100px)",
      );
      expect(
        drag("shape(from 0 0,curve to 100px 0)", "m0", { x: 50, y: 20 }),
      ).toBe("shape(from 0 0,line to 50px 20px,curve to 100px 0)");
    });

    it("adds a point before a smooth curve or an arc", () => {
      expect(
        drag("shape(from 0 0,smooth to 100px 0)", "m0", { x: 50, y: 20 }),
      ).toBe("shape(from 0 0,line to 50px 20px,smooth to 100px 0)");
      expect(
        drag("shape(from 0 0,arc by 100px 0 of 50px)", "m0", { x: 50, y: 20 }),
      ).toBe("shape(from 0 0,line by 50px 20px,arc by 50px -20px of 50px)");
    });

    it("adds no point on a segment of no length", () => {
      expect(handle("shape(from 0 0,line to 0 0)", "m0")).toBeUndefined();
      expect(handle("shape(from 0 0,close)", "m0")).toBeUndefined();
    });

    it("removes a point, with 3 left", () => {
      const value =
        "shape(from 0 0,line to 10px 0,line to 10px 10px,line to 0 10px,close)";

      expect(apply(value, handle(value, "p1").remove())).toBe(
        "shape(from 0 0,line to 10px 0,line to 0 10px,close)",
      );
      expect(
        handle("shape(from 0 0,line to 10px 0,line to 10px 10px)", "p0").remove,
      ).toBeNull();
    });

    it("removes a point, the next relative one staying where it is", () => {
      const value =
        "shape(from 0 0,line to 10px 0,line by 0 10px,line by -10px 0)";

      expect(apply(value, handle(value, "p0").remove())).toBe(
        "shape(from 0 0,line by 10px 10px,line by -10px 0)",
      );
    });

    it("moves a line along its axis", () => {
      const value = "shape(from 10px 10px,hline by 5px,vline to 50px)";

      expect(handle(value, "p0").free).toEqual({ x: true, y: false });
      expect(drag(value, "p0", { x: 50, y: 0 })).toBe(
        "shape(from 10px 10px,hline by 40px,vline to 50px)",
      );
      expect(drag(value, "p1", { x: 0, y: 70 })).toBe(
        "shape(from 10px 10px,hline by 5px,vline to 70px)",
      );
    });

    it("leaves a line without its length where it is", () => {
      const value = "shape(from 0 0,hline to)";

      expect(handle(value, "p0")).toBeUndefined();
    });

    it("leaves a relative point without its 2 values where it is", () => {
      const value = "shape(from 0 0,line by 5px 5px 5px)";

      expect(handle(value, "p0").free).toEqual({ x: false, y: false });
      expect(handle(value, "p0").write({ x: 0, y: 0 })).toEqual([]);
    });

    it("draws the curves and their control points", () => {
      const value =
        "shape(from 0 0,curve to 100px 0 with 50px 50px,curve to 200px 0 with 120px 10px / 180px 10px,smooth to 200px 100px with 20px 20px from end,smooth by -10px 0)";

      expect(layout(value).path).toBe(
        "M 0 0 Q 50 50 100 0 C 120 10 180 10 200 0 S 220 120 200 100 T 190 100",
      );
      expect(handles(value)).toMatchObject({
        "c0.0": [50, 50],
        "c1.0": [120, 10],
        "c1.1": [180, 10],
        "c2.0": [220, 120],
      });
      expect(layout(value).lines).toEqual([
        [
          { x: 50, y: 50 },
          { x: 0, y: 0 },
        ],
        [
          { x: 50, y: 50 },
          { x: 100, y: 0 },
        ],
        [
          { x: 120, y: 10 },
          { x: 100, y: 0 },
        ],
        [
          { x: 180, y: 10 },
          { x: 200, y: 0 },
        ],
        [
          { x: 220, y: 120 },
          { x: 200, y: 100 },
        ],
      ]);
    });

    it("draws a curve without control point as a line", () => {
      expect(layout("shape(from 0 0,curve to 10px 0)").path).toBe(
        "M 0 0 L 10 0",
      );
    });

    it("anchors a control point where it says", () => {
      const control = (anchor) =>
        handles(
          `shape(from 0 0,move to 10px 10px,curve by 100px 0 with 5px 5px ${anchor})`,
        )["c1.0"];

      expect(control("")).toEqual([15, 15]);
      expect(control("from start")).toEqual([15, 15]);
      expect(control("from end")).toEqual([115, 15]);
      expect(control("from origin")).toEqual([5, 5]);
    });

    it("moves a control point", () => {
      expect(
        drag("shape(from 0 0,curve to 10px 0 with 5px 5px)", "c0.0", {
          x: 7,
          y: 8,
        }),
      ).toBe("shape(from 0 0,curve to 10px 0 with 7px 8px)");
      expect(
        drag("shape(from 5px 5px,curve by 10px 0 with 5px 5px)", "c0.0", {
          x: 7,
          y: 8,
        }),
      ).toBe("shape(from 5px 5px,curve by 10px 0 with 2px 3px)");
    });

    it("draws the arcs", () => {
      expect(
        layout(
          "shape(from 0 0,arc to 10px 0 of 5px,arc by 0 10px of 5px 2px cw large rotate 0.25turn,arc to 0 0)",
        ).path,
      ).toBe("M 0 0 A 5 5 0 0 0 10 0 A 5 2 90 1 1 10 10 A 0 0 0 0 0 0 0");
    });

    it("leaves an arc rotated by an unknown angle out", () => {
      expect(
        layout("shape(from 0 0,arc to 10px 0 of 5px rotate 1foo)").path,
      ).toBeNull();
    });

    it("loses track after an unknown command", () => {
      const value =
        "shape(from 0 0,foo to 1px 1px,line by 1px 1px,line 1px 1px,1px,jump to 1px 1px,line to 2px 2px)";

      expect(handles(value)).toEqual({ from: [0, 0], p5: [2, 2] });
      expect(layout(value).path).toBeNull();
    });

    it("needs a start", () => {
      expect(layout("shape(evenodd)").handles).toEqual([]);
      expect(handle("shape(from,close)", "from").free).toEqual({
        x: false,
        y: false,
      });
    });
  });
});
