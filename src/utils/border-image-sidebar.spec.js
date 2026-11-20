/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSidebar, SIDEBAR_ID } from "./border-image-sidebar";
import { layoutBorderImage } from "./border-image-geometry";
import { describePiece } from "./border-image-pieces";

const px = (value) => ({ value, unit: "px" });
const num = (value) => ({ value, unit: "" });
const four = (side) => [side, side, side, side];

/** What the page script tells, for a 200×100 box, slices and widths of 20. */
function model(extra = {}) {
  const repeat = ["stretch", "stretch"];
  const layout = layoutBorderImage({
    box: { width: 200, height: 100 },
    borders: [0, 0, 0, 0],
    slice: four(num(20)),
    fill: false,
    width: four(px(20)),
    outset: four(num(0)),
    repeat,
  });
  return {
    names: ["div"],
    index: 0,
    reason: "",
    onOutput: true,
    notices: [
      {
        title: "Widths rounded down to the pixel",
        text: "Chrome draws the border on whole pixels.",
      },
    ],
    opaque: false,
    repeat,
    fill: false,
    layout,
    stories: layout.pieces.map((piece) =>
      describePiece(piece, layout, repeat, false),
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

function pointer(
  type,
  target,
  { x = 0, y = 0, pointerId = 1, shiftKey, altKey } = {},
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    shiftKey,
    altKey,
  });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  target.dispatchEvent(event);
  return event;
}

describe("border-image-sidebar", () => {
  let ctm;
  let frames;
  let now;
  let send;
  let close;
  let sidebar;

  /** The commands sent so far. */
  const commands = () => send.mock.calls.map(([command]) => command);
  const q = (selector) => sidebar.element.querySelector(selector);
  const text = (selector) => q(selector).textContent;

  beforeEach(() => {
    frames = [];
    now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (callback) => frames.push(callback));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal(
      "DOMPoint",
      class {
        constructor(x, y) {
          this.x = x;
          this.y = y;
        }
        matrixTransform() {
          return { x: this.x, y: this.y };
        }
      },
    );
    ctm = { a: 2, b: 0, inverse: () => ({}) };
    window.SVGElement.prototype.getScreenCTM = () => ctm;
    send = vi.fn();
    close = vi.fn();
    sidebar = createSidebar({ send, close });
    document.body.append(sidebar.element);
    Object.defineProperty(q(".cbt-border-image__panel"), "clientWidth", {
      value: 480,
      configurable: true,
    });
  });

  afterEach(() => {
    sidebar.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  /** Runs the frames asked for so far. */
  function flush() {
    const queued = frames;
    frames = [];
    queued.forEach((callback) => callback(now));
  }

  describe("panel", () => {
    it("slides in on the right, as cssbattle's own, with nothing under it", () => {
      expect(sidebar.element.id).toBe(SIDEBAR_ID);
      expect(sidebar.element.className).toBe("sidebar-container");
      expect(q(".sidebar.sidebar--right .sidebar__close svg")).not.toBeNull();
      expect(q(".underlay")).toBeNull();
      expect(text(".header__title")).toBe("Border-image pieces");

      flush();

      expect(sidebar.element.className).toBe(
        "sidebar-container sidebar-container--visible",
      );
    });

    it("closes from its cross", () => {
      q(".sidebar__close path").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );

      expect(close).toHaveBeenCalledOnce();
      expect(send).not.toHaveBeenCalled();
    });

    it("goes for good", () => {
      sidebar.update(model());
      q("[data-play]").click();

      sidebar.destroy();
      window.dispatchEvent(new Event("resize"));

      expect(sidebar.element.isConnected).toBe(false);
      // Its opening, the pieces playing, and both again.
      expect(cancelAnimationFrame).toHaveBeenCalledTimes(3);
    });

    it("keeps the caret in the editor", () => {
      sidebar.update(model());
      const event = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
      });

      q("[data-play]").dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe("state", () => {
    it("draws nothing before it is told", () => {
      expect(q(".cbt-border-image__empty").hidden).toBe(true);
      expect(q(".cbt-border-image__content").hidden).toBe(true);

      window.dispatchEvent(new Event("resize"));
      expect(q(".cbt-border-image__content").hidden).toBe(true);
    });

    it("draws what the page script tells", () => {
      sidebar.update(model());

      expect(q(".cbt-border-image__empty").hidden).toBe(true);
      expect(q(".cbt-border-image__content").hidden).toBe(false);
      expect(text(".cbt-border-image__size")).toBe("div · 200 × 100");
      expect(q(".cbt-border-image__elements").children).toHaveLength(0);
      expect(text(".cbt-border-image__alone")).toBe("");
      // An icon by the title, the details in its tooltip.
      expect(q(".header__title").nextElementSibling).toBe(
        q(".cbt-border-image__notices"),
      );
      const icon = q(".cbt-border-image__notices-icon");
      expect(icon.getAttribute("aria-label")).toBe(
        "1 thing changes the result",
      );
      expect(
        document.getElementById(icon.getAttribute("aria-describedby")),
      ).toBe(q(".cbt-border-image__notices-pop"));
      expect(text(".cbt-border-image__notices-title")).toBe(
        "1 thing changes the result",
      );
      expect(text(".cbt-border-image__notice")).toBe(
        "Widths rounded down to the pixelChrome draws the border on whole pixels.",
      );
      // 440 wide.
      expect(q(".cbt-border-image__stage").getAttribute("style")).toBe(
        "width:440px;height:284px",
      );
      expect(q(".cbt-border-image__rows").children).toHaveLength(9);
      expect(text("[data-play]")).toBe("Play piece by piece");
      expect(text(".cbt-border-image__keys")).toBe(
        "Drag a red handle to move a cut, a green one the borderShift finerAlt one side only",
      );
    });

    it("draws again only what changed", () => {
      sidebar.update(model());
      const row = q(".cbt-border-image__rows").firstChild;

      sidebar.update(model({ notices: [] }));

      expect(q(".cbt-border-image__rows").firstChild).toBe(row);
      expect(text(".cbt-border-image__notices")).toBe("");
    });

    it("says why there is nothing to draw", () => {
      sidebar.update(model({ isolated: 2 }));
      sidebar.update({ reason: "pseudo-element", names: [] });

      expect(text(".cbt-border-image__empty")).toBe(
        "pseudo-element: nothing to draw.",
      );
      expect(q(".cbt-border-image__empty").hidden).toBe(false);
      expect(q(".cbt-border-image__content").hidden).toBe(true);
      expect(text(".cbt-border-image__size")).toBe("");
      expect(text(".cbt-border-image__alone")).toBe("");

      sidebar.update(model());
      expect(q(".cbt-border-image__empty").hidden).toBe(true);
    });

    it("tells the pieces too thin to see, with the rest", () => {
      const thin = model();
      thin.layout.pieces[0].source.height = 0.5;
      sidebar.update(thin);
      expect(text(".cbt-border-image__notices-title")).toBe(
        "2 things change the result",
      );
      expect(q(".cbt-border-image__notice:last-child span").textContent).toBe(
        "Piece 1 is under 2px in the image above: the thumbnails below are enlarged.",
      );

      thin.layout.pieces[2].source.width = 1;
      sidebar.update({ ...thin, notices: [] });
      expect(text(".cbt-border-image__notice span")).toBe(
        "Pieces 1, 3 are under 2px in the image above: the thumbnails below are enlarged.",
      );
    });

    it("tells the piece shown alone on the output", () => {
      sidebar.update(model({ isolated: 4 }));

      expect(text(".cbt-border-image__alone")).toBe("Piece 5 aloneShow all");
      q(".cbt-border-image__alone button").click();
      expect(commands()).toEqual([{ type: "isolate", zone: 4 }]);
    });

    it("follows the width of the panel", () => {
      sidebar.update(model());
      Object.defineProperty(q(".cbt-border-image__panel"), "clientWidth", {
        value: 100,
      });

      window.dispatchEvent(new Event("resize"));

      // 240 at least.
      expect(q(".cbt-border-image__stage").getAttribute("style")).toBe(
        "width:240px;height:284px",
      );
    });

    it("grows the figures to the height of the screen, then spreads them", () => {
      // A wide panel, 200 for the figures under the header.
      Object.defineProperty(q(".cbt-border-image__panel"), "clientWidth", {
        value: 1040,
      });
      Object.defineProperty(q(".sidebar__content"), "clientHeight", {
        value: 420,
      });
      Object.defineProperty(q(".item__header"), "offsetHeight", {
        value: 50,
      });
      sidebar.update(model());

      // The image 200 × 100 drawn 2 times larger, the element in the middle
      // of the right half.
      expect(q(".cbt-border-image__stage").getAttribute("style")).toBe(
        "width:1000px;height:284px",
      );
      expect(q(".cbt-border-image__figure:not([data-image])").style.left).toBe(
        "533px",
      );
    });

    it("puts the play button at the top, by the size", () => {
      sidebar.update(model());

      expect(q(".cbt-border-image__size").nextElementSibling).toBe(
        q(".cbt-border-image__player"),
      );
      expect(q(".cbt-border-image__player [data-play]")).not.toBeNull();
    });

    it("switches the pieces on the output, in the header", () => {
      sidebar.update(model());
      const toggle = q(".item__header [data-draw]");
      expect(toggle.getAttribute("aria-checked")).toBe("true");

      toggle.click();
      expect(send).toHaveBeenCalledWith({ type: "draw" });

      sidebar.update(model({ onOutput: false }));
      expect(toggle.getAttribute("aria-checked")).toBe("false");
    });
  });

  describe("commands", () => {
    it("switches the repeat, fill, and shows a piece alone", () => {
      sidebar.update(model());

      q('.cbt-border-image__row[data-zone="3"] [data-repeat]').click();
      q("[data-fill]").click();
      q('.cbt-border-image__row[data-zone="2"] [data-isolate]').click();
      q(".cbt-border-image__hint").click();

      expect(commands()).toEqual([
        { type: "repeat", axis: 1 },
        { type: "fill" },
        { type: "isolate", zone: 2 },
      ]);
    });

    it("shows a piece alone from the element", () => {
      sidebar.update(model());
      const [, element] = sidebar.element.querySelectorAll(
        ".cbt-border-image__figure",
      );

      element
        .querySelector('[data-zone="7"]')
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));

      expect(commands()).toEqual([{ type: "isolate", zone: 7 }]);
    });

    it("switches to another element", () => {
      sidebar.update(model({ names: ["html", "body"], index: 1 }));
      const buttons = [...q(".cbt-border-image__elements").children];

      expect(
        buttons.map((b) => [b.textContent, b.getAttribute("aria-pressed")]),
      ).toEqual([
        ["html", "false"],
        ["body", "true"],
      ]);
      expect(text(".cbt-border-image__size")).toBe("body · 200 × 100");
      buttons[0].click();

      expect(commands()).toEqual([{ type: "element", index: 0 }]);
    });

    it("lights the piece hovered on the output", () => {
      sidebar.update(model());
      const row = q('.cbt-border-image__row[data-zone="5"]');

      pointer("pointerover", row);
      pointer("pointerover", row);
      pointer("pointerover", q(".cbt-border-image__rows"));
      pointer("pointerover", row);
      sidebar.element.dispatchEvent(new MouseEvent("pointerleave"));

      expect(commands()).toEqual([
        { type: "hover", zone: 5 },
        { type: "hover", zone: -1 },
        { type: "hover", zone: 5 },
        { type: "hover", zone: -1 },
      ]);
    });

    it("drags a slice", () => {
      sidebar.update(model());
      const figures = q(".cbt-border-image__figures");
      figures.setPointerCapture = vi.fn();
      figures.releasePointerCapture = vi.fn();

      const down = pointer(
        "pointerdown",
        q('[data-image] .cbt-border-image__hit[data-line="slice-3"]'),
        { x: 20, y: 50 },
      );
      pointer("pointermove", figures, { x: 30, y: 50, pointerId: 2 });
      pointer("pointermove", figures, { x: 30, y: 50, shiftKey: true });
      pointer("pointerup", figures, { pointerId: 2 });
      pointer("pointerup", figures);

      expect(down.defaultPrevented).toBe(true);
      expect(figures.setPointerCapture).toHaveBeenCalledWith(1);
      expect(figures.releasePointerCapture).toHaveBeenCalledWith(1);
      expect(commands()).toEqual([
        {
          type: "down",
          where: "image",
          point: { x: 20, y: 50 },
          scale: 2,
          zone: null,
          line: "slice-3",
        },
        {
          type: "move",
          point: { x: 30, y: 50 },
          shiftKey: true,
          altKey: false,
        },
        { type: "up" },
      ]);
    });

    it("presses a piece of the image, not of the element", () => {
      sidebar.update(model());
      ctm = { a: 0, b: 0, inverse: () => ({}) };
      const [image, element] = sidebar.element.querySelectorAll(
        ".cbt-border-image__figure",
      );

      pointer("pointerdown", image.querySelector('[data-zone="4"]'), {
        x: 100,
        y: 50,
      });
      pointer("pointerdown", image.querySelector("svg"));
      pointer("pointerdown", element.querySelector('[data-zone="4"]'));
      pointer("pointerup", q(".cbt-border-image__figures"), { pointerId: 2 });

      expect(commands()).toEqual([
        {
          type: "down",
          where: "image",
          point: { x: 100, y: 50 },
          scale: 1,
          zone: 4,
        },
      ]);
    });

    it("drags a width of the element", () => {
      sidebar.update(model());
      const figures = q(".cbt-border-image__figures");

      pointer(
        "pointerdown",
        q('.cbt-border-image__guides [data-line="width-1"]'),
        { x: 150, y: 40 },
      );
      pointer("pointermove", figures, { x: 160, y: 40, altKey: true });
      pointer("pointerup", figures);

      expect(commands()).toEqual([
        {
          type: "down",
          where: "element",
          point: { x: 150, y: 40 },
          scale: 2,
          zone: null,
          line: "width-1",
        },
        {
          type: "move",
          point: { x: 160, y: 40 },
          shiftKey: false,
          altKey: true,
        },
        { type: "up" },
      ]);
    });
  });

  describe("piece by piece", () => {
    const button = () => q("[data-play]");

    it("plays the pieces to their place, one after the other", () => {
      sidebar.update(model());
      flush();

      button().click();
      flush();
      expect(text("[data-play]")).toBe("Pause · step 1 of 8");
      expect(button().getAttribute("aria-pressed")).toBe("true");
      expect(q(".cbt-border-image__flight")).not.toBeNull();

      // 900 for each of the 8 pieces.
      now = 1000 + 900 * 4.5;
      flush();
      expect(text("[data-play]")).toBe("Pause · step 5 of 8");

      now = 1000 + 7200;
      flush();
      expect(text("[data-play]")).toBe("Play piece by piece");
      expect(q(".cbt-border-image__flight")).toBeNull();
      expect(frames).toHaveLength(0);
    });

    it("pauses, and goes on from there", () => {
      sidebar.update(model());
      button().click();
      now = 1000 + 900 * 2.5;
      flush();

      button().click();
      expect(text("[data-play]")).toBe("Resume · step 3 of 8");
      expect(button().getAttribute("aria-pressed")).toBe("false");
      // A frame asked before the pause moves nothing.
      now = 4000;
      flush();
      expect(text("[data-play]")).toBe("Resume · step 3 of 8");

      now = 5000;
      button().click();
      flush();
      expect(text("[data-play]")).toBe("Pause · step 3 of 8");
    });

    it("stops once there is nothing to draw", () => {
      sidebar.update(model());
      button().click();

      sidebar.update({ reason: "x", names: [] });
      flush();

      expect(frames).toHaveLength(0);
    });
  });
});
