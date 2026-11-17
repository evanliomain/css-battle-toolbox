/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POINT_COLORS } from "./utils/point-colors";

/**
 * Just enough of CodeMirror for the page script: the classes it reaches
 * through the view, an update listener facet, and transactions that change
 * the code and the caret.
 */
function createView(doc, head = 0) {
  class StateEffect {
    static appendConfig = { of: (extension) => ({ append: extension }) };
  }
  class EditorView {
    static updateListener = { of: (listener) => ({ listener }) };
    static scrollIntoView() {
      return new StateEffect();
    }
    listeners = [];
    doc = doc;
    head = head;
    log = [];
    focus = vi.fn();
    viewport = { from: 0, to: Infinity };
    /**
     * The editor's text, as a single text node: drawn again once the code
     * changes, as CodeMirror does.
     */
    domAtPos(pos) {
      const content = document.querySelector(".cm-content");
      if (content.textContent !== this.doc) {
        content.textContent = this.doc;
      }
      return { node: content.firstChild, offset: pos };
    }
    /** The same document until the code changes, as CodeMirror's. */
    text = { code: doc, toString: () => doc };
    get state() {
      if (this.text.code !== this.doc) {
        const code = this.doc;
        this.text = { code, toString: () => code };
      }
      return {
        doc: this.text,
        selection: { main: { head: this.head } },
        facet: () => this.listeners,
      };
    }
    dispatch(spec) {
      this.log.push(spec);
      if (spec.effects) {
        this.listeners.push(spec.effects.append.listener);
      }
      [spec.changes ?? []]
        .flat()
        .sort((a, b) => b.from - a.from)
        .forEach(({ from, to = from, insert }) => {
          this.doc = this.doc.slice(0, from) + insert + this.doc.slice(to);
          if (this.head >= to) {
            this.head += insert.length - (to - from);
          }
        });
      if (spec.selection) {
        this.head = spec.selection.anchor;
      }
      this.listeners.forEach((listener) => listener({ view: this }));
    }
  }
  return new EditorView();
}

/** Moves the caret to `|` in the code. */
function setCode(view, code) {
  view.dispatch({
    changes: { from: 0, to: view.doc.length, insert: code.replace("|", "") },
    selection: { anchor: code.indexOf("|") },
  });
}

/** The clip-path value in the code. */
function value(view) {
  return /clip-path:([^;}"]*)/.exec(view.doc)[1];
}

let frames;

/** Runs the frames asked for so far, as the browser would. */
function flush() {
  const queued = frames;
  frames = [];
  queued.forEach((callback) => callback());
}

function renderPage(view, { render = "<div></div>" } = {}) {
  document.body.innerHTML = `
    <div class="cm-content"></div>
    <div class="container__item--output"><div class="item__content"><div class="anchor"></div></div></div>
    <div class="target-container"><iframe></iframe></div>`;
  document.querySelector(".cm-content").cmView = { rootView: { view } };
  const iframe = document.querySelector("iframe");
  Object.defineProperty(iframe, "clientWidth", { value: 400 });
  Object.defineProperty(iframe, "clientHeight", { value: 300 });
  const renderWin = iframe.contentWindow;
  iframe.contentDocument.body.innerHTML = render;
  // jsdom lays nothing out: every element is 200×100 at 10,20.
  vi.spyOn(renderWin.Element.prototype, "getClientRects").mockReturnValue([{}]);
  vi.spyOn(
    renderWin.Element.prototype,
    "getBoundingClientRect",
  ).mockReturnValue({ x: 10, y: 20, width: 200, height: 100 });
  return iframe;
}

function overlay() {
  return document.getElementById("cbt-clip-path");
}

function bar() {
  return document.getElementById("cbt-clip-path-bar");
}

function status() {
  return bar().querySelector(".cbt-clip-path__status").textContent;
}

function handleIds() {
  return [...document.querySelectorAll("[data-handle]")].map(
    (h) => h.dataset.handle,
  );
}

/** Fires a pointer event on a handle, or on the overlay. */
function pointer(
  type,
  id,
  { x = 0, y = 0, pointerId = 1, shiftKey, timeStamp } = {},
) {
  const target = id
    ? document.querySelector(`[data-handle="${id}"]`)
    : overlay();
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    shiftKey,
  });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  if (undefined !== timeStamp) {
    Object.defineProperty(event, "timeStamp", { value: timeStamp });
  }
  target.dispatchEvent(event);
  return event;
}

const RULE = (value) =>
  `<div></div><style>div{width:200px;clip-path:${value}}</style>`;

describe("clip-path-page", () => {
  let documentListeners;

  beforeEach(() => {
    vi.resetModules();
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (callback) => frames.push(callback));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    // The overlay's group sits at the client's origin: client = local.
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
    window.SVGElement.prototype.getScreenCTM = () => ({ inverse: () => ({}) });
    vi.spyOn(console, "debug").mockImplementation(() => {});
    documentListeners = vi.spyOn(document, "addEventListener");
  });

  afterEach(() => {
    // The document outlives the module: unbind the previous load's listeners.
    documentListeners.mock.calls.forEach(([type, handler]) =>
      document.removeEventListener(type, handler),
    );
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    document.body.className = "";
    window.history.replaceState({}, "", "/play/123");
  });

  /** Loads the page script on a page whose code is `code`. */
  async function load(code, options) {
    const view = createView("");
    renderPage(view, options);
    await import("./clip-path-page.js");
    setCode(view, code);
    flush();
    return view;
  }

  describe("attach", () => {
    it("waits for an editor to be there", async () => {
      await import("./clip-path-page.js");

      expect(console.debug).toHaveBeenCalledWith(
        "[cbt] clip-path tool: no CodeMirror view found",
      );
    });

    it("follows the editor of the next battle", async () => {
      const first = await load(RULE("polygon(|0 0,1px 1px,2px 2px)"));
      document.dispatchEvent(new CustomEvent("cbt-clip-path-detach"));
      expect(overlay()).toBeNull();

      const next = createView("");
      renderPage(next);
      document.dispatchEvent(new CustomEvent("cbt-clip-path-attach"));
      setCode(next, RULE("circle(|)"));
      setCode(first, RULE("polygon(|0 0,1px 1px,2px 2px)"));
      flush();

      expect(handleIds()).toEqual(["c", "r"]);
    });
  });

  describe("drawing", () => {
    it("draws the shape over the element", async () => {
      await load(RULE("polygon(50% |0,100% 100%,0 100%)"));

      expect(document.body.lastChild).toBe(overlay());
      expect(handleIds()).toEqual(["v0", "v1", "v2", "m0", "m1", "m2"]);
      expect(overlay().querySelector("g").getAttribute("transform")).toBe(
        "translate(10 20) translate(0 0)",
      );
      expect(overlay().querySelector("path").getAttribute("d")).toBe(
        "M 100 0 L 200 100 L 0 100 Z",
      );
      expect(overlay().querySelector("svg").getAttribute("width")).toBe("400");
      // In pixels of the render, out of the group: round whatever the scale.
      expect(overlay().querySelector("g [data-handle]")).toBeNull();
      const v0 = document.querySelector('[data-handle="v0"]');
      expect([v0.getAttribute("cx"), v0.getAttribute("cy")]).toEqual([
        "110",
        "20",
      ]);
    });

    it("draws the points in units only the render knows", async () => {
      const view = createView("");
      const iframe = renderPage(view);
      const renderWin = iframe.contentWindow;
      const own = renderWin.getComputedStyle;
      // jsdom computes no length: 1lh is 18px on the probe.
      vi.spyOn(renderWin, "getComputedStyle").mockImplementation((el) =>
        "CBT-PROBE" === el.tagName
          ? {
              // Live, as a computed style is.
              get marginLeft() {
                return `${parseFloat(el.style.marginLeft) * 18}px`;
              },
            }
          : own(el),
      );
      await import("./clip-path-page.js");
      setCode(view, RULE("polygon(0 |2lh,100% 0,1lh 100%)"));
      flush();

      expect(handleIds()).toEqual(["v0", "v1", "v2", "m0", "m1", "m2"]);
      expect(overlay().querySelector("path").getAttribute("d")).toBe(
        "M 0 36 L 200 0 L 18 100 Z",
      );
    });

    it("shows the ready-made shapes below the output", async () => {
      await load(RULE("polygon(|)"));

      expect(document.querySelector(".anchor").nextElementSibling).toBe(bar());
      expect(status()).toBe(
        "polygon() · nothing to drag yet, pick a shape below",
      );
      expect(bar().querySelectorAll("[data-preset]").length).toBeGreaterThan(
        10,
      );
      expect(
        [...bar().querySelectorAll(".cbt-clip-path__presets")].map((row) =>
          row.getAttribute("aria-label"),
        ),
      ).toEqual(["Polygons", "Circles and rectangles", "Paths"]);
    });

    it("asks for a shape in an empty value", async () => {
      await load(RULE("|"));

      expect(status()).toBe("Pick a shape");
      expect(handleIds()).toEqual([]);
    });

    it("draws on the whole output when the element is not found", async () => {
      await load(RULE("circle(|)"), { render: "" });

      expect(status()).toBe(
        "circle() · element not found, drawn on the whole output",
      );
      expect(overlay().querySelector("g").getAttribute("transform")).toBe(
        "translate(0 0) translate(0 0)",
      );
      expect(overlay().querySelector("rect").getAttribute("width")).toBe("400");
    });

    it("draws on the whole output outside of any rule", async () => {
      await load("<style>@media (x){clip-path:circle(|)}</style>");

      expect(status()).toContain("element not found");
    });

    it("draws in the reference box written", async () => {
      await load(RULE("circle(|) content-box"));

      expect(overlay().querySelector("rect").getAttribute("width")).toBe("200");
    });

    it("tells the handles apart by how they move", async () => {
      await load(RULE("inset(|1px)"));

      expect(
        document.querySelector('[data-handle="t"]').getAttribute("class"),
      ).toContain("cbt-clip-path__handle--ns");
      expect(
        document.querySelector('[data-handle="r"]').getAttribute("class"),
      ).toContain("cbt-clip-path__handle--ew");

      const view = createView("");
      renderPage(view);
      document.dispatchEvent(new CustomEvent("cbt-clip-path-attach"));
      setCode(view, RULE("circle(at right 1px top |2px)"));
      flush();
      expect(
        document.querySelector('[data-handle="c"]').getAttribute("class"),
      ).toContain("cbt-clip-path__handle--locked");
    });

    it("ties the control points", async () => {
      await load(RULE("shape(from 0 0,curve to |10px 0 with 5px 5px)"));

      expect(overlay().querySelectorAll("line")).toHaveLength(2);
    });

    it("follows the render on every frame", async () => {
      await load(RULE("circle(|)"));
      const svg = overlay().innerHTML;

      flush();

      expect(frames).toHaveLength(1);
      expect(overlay().innerHTML).toBe(svg);
    });

    it("comes back when the page drops it", async () => {
      await load(RULE("circle(|)"));
      overlay().remove();
      bar().remove();

      flush();

      expect(overlay()).not.toBeNull();
      expect(bar()).not.toBeNull();
    });

    it("stands over the render, out of its panel", async () => {
      await load(RULE("circle(|)"));
      const container = document.querySelector(".target-container");
      vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
        left: 60,
        top: 110,
      });

      flush();

      expect(container.contains(overlay())).toBe(false);
      expect(overlay().style.translate).toBe("60px 110px");
    });

    it("follows the new render container", async () => {
      await load(RULE("circle(|)"));
      const container = document.querySelector(".target-container");
      const next = container.cloneNode(true);
      container.replaceWith(next);
      Object.defineProperty(next.querySelector("iframe"), "clientWidth", {
        value: 400,
      });
      vi.spyOn(next, "getBoundingClientRect").mockReturnValue({
        left: 5,
        top: 7,
      });

      flush();

      expect(overlay().style.translate).toBe("5px 7px");
    });

    it("goes away when the caret leaves the value", async () => {
      const view = await load(RULE("circle(|)"));

      view.dispatch({ selection: { anchor: 0 } });
      flush();

      expect(overlay()).toBeNull();
      expect(bar()).toBeNull();
      expect(frames).toHaveLength(0);
    });

    it("draws nothing once the option is off", async () => {
      document.body.classList.add("hideClipPath");

      await load(RULE("circle(|)"));

      expect(overlay()).toBeNull();
    });

    it("draws nothing outside a battle", async () => {
      window.history.replaceState({}, "", "/");

      await load(RULE("circle(|)"));

      expect(overlay()).toBeNull();
    });

    it("draws nothing without the render", async () => {
      const view = await load(RULE("circle(|)"));
      document.querySelector("iframe").remove();

      view.dispatch({});
      flush();

      expect(overlay()).toBeNull();
    });

    it("asks for a single frame at a time", async () => {
      const view = await load(RULE("circle(|)"));

      view.dispatch({});
      view.dispatch({});

      expect(frames).toHaveLength(1);
    });
  });

  describe("dragging", () => {
    it("moves a point", async () => {
      const view = await load(RULE("polygon(50% 0,100% 100%,0 |100%)"));

      pointer("pointerdown", "v0", { x: 100, y: 0 });
      pointer("pointermove", null, { x: 20, y: 30 });

      expect(value(view)).toBe("polygon(10% 30%,100% 100%,0 100%)");
      // Joined into a single undo: no user event.
      expect(view.log.at(-1).userEvent).toBeUndefined();
    });

    it("fine tunes with Shift", async () => {
      const view = await load(RULE("polygon(50% 0,100% 100%,0 |100%)"));

      pointer("pointerdown", "v0");
      pointer("pointermove", null, { x: 20.3, y: 0, shiftKey: true });

      expect(value(view)).toBe("polygon(10.2% 0,100% 100%,0 100%)");
    });

    it("keeps the unit of the drag's start through 0", async () => {
      const view = await load(RULE("polygon(10px 0,1% 1%,2% |2%)"));

      pointer("pointerdown", "v0");
      pointer("pointermove", null, { x: 0, y: 0 });
      pointer("pointermove", null, { x: 20, y: 0 });

      expect(value(view)).toBe("polygon(20px 0,1% 1%,2% 2%)");
    });

    it("writes nothing when nothing moves", async () => {
      const view = await load(RULE("polygon(10px 0,1% 1%,2% |2%)"));
      const count = view.log.length;

      pointer("pointerdown", "v0");
      pointer("pointermove", null, { x: 10, y: 0 });

      expect(view.log).toHaveLength(count);
    });

    it("stops on release", async () => {
      const view = await load(RULE("polygon(10px 0,1px 1px,2px |2px)"));

      pointer("pointerdown", "v0");
      pointer("pointerup");
      pointer("pointermove", null, { x: 50, y: 50 });

      expect(value(view)).toBe("polygon(10px 0,1px 1px,2px 2px)");
    });

    it("follows only the pointer that started", async () => {
      const view = await load(RULE("polygon(10px 0,1px 1px,2px |2px)"));

      pointer("pointerdown", "v0");
      pointer("pointermove", null, { x: 50, y: 50, pointerId: 2 });
      pointer("pointerup", null, { pointerId: 2 });
      pointer("pointercancel");
      pointer("pointermove", null, { x: 50, y: 50 });

      expect(value(view)).toBe("polygon(10px 0,1px 1px,2px 2px)");
    });

    it("captures the pointer when it can", async () => {
      await load(RULE("polygon(10px 0,1px 1px,2px |2px)"));
      overlay().setPointerCapture = vi.fn();
      overlay().releasePointerCapture = vi.fn();

      pointer("pointerdown", "v0");
      pointer("pointerup");

      expect(overlay().setPointerCapture).toHaveBeenCalledWith(1);
      expect(overlay().releasePointerCapture).toHaveBeenCalledWith(1);
    });

    it("ignores a press beside the handles", async () => {
      const view = await load(RULE("polygon(10px 0,1px 1px,2px |2px)"));

      const event = pointer("pointerdown");
      pointer("pointermove", null, { x: 50, y: 50 });

      expect(event.defaultPrevented).toBe(false);
      expect(value(view)).toBe("polygon(10px 0,1px 1px,2px 2px)");
    });

    it("stops when the point is gone", async () => {
      const view = await load(RULE("polygon(10px 0,1px 1px,2px |2px)"));

      pointer("pointerdown", "v0");
      setCode(view, RULE("circle(|)"));
      pointer("pointermove", null, { x: 50, y: 50 });

      expect(value(view)).toBe("circle()");
    });

    it("keeps the focus in the editor", async () => {
      await load(RULE("polygon(10px 0,1px 1px,2px |2px)"));

      const press = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
      });
      overlay().dispatchEvent(press);

      expect(press.defaultPrevented).toBe(true);
    });

    it("adds a point from the middle of a side, then drags it", async () => {
      const view = await load(RULE("polygon(0 0,100px 0,100px |100px)"));

      pointer("pointerdown", "m0", { x: 50, y: 0 });
      expect(value(view)).toBe("polygon(0 0,50px 0,100px 0,100px 100px)");
      flush();
      pointer("pointermove", null, { x: 50, y: 20 });

      expect(value(view)).toBe("polygon(0 0,50px 20px,100px 0,100px 100px)");
    });

    it("removes a point pressed twice", async () => {
      const view = await load(RULE("polygon(0 0,1px 0,1px 1px,0 |1px)"));

      pointer("pointerdown", "v1", { timeStamp: 1000 });
      pointer("pointerup");
      pointer("pointerdown", "v1", { timeStamp: 1200 });

      expect(value(view)).toBe("polygon(0 0,1px 1px,0 1px)");
      expect(view.log.at(-1).userEvent).toBe("input.cbt-clip-path");
    });

    it("keeps a point pressed twice slowly", async () => {
      const view = await load(RULE("polygon(0 0,1px 0,1px 1px,0 |1px)"));

      pointer("pointerdown", "v1", { timeStamp: 1000 });
      pointer("pointerup");
      pointer("pointerdown", "v1", { timeStamp: 1500 });

      expect(value(view)).toBe("polygon(0 0,1px 0,1px 1px,0 1px)");
    });

    it("keeps the points of a triangle", async () => {
      const view = await load(RULE("polygon(0 0,1px 0,1px |1px)"));

      pointer("pointerdown", "v1", { timeStamp: 1000 });
      pointer("pointerup");
      pointer("pointerdown", "v1", { timeStamp: 1100 });

      expect(value(view)).toBe("polygon(0 0,1px 0,1px 1px)");
    });
  });

  describe("new points of a shape()", () => {
    function commands() {
      return bar().querySelector(".cbt-clip-path__added");
    }

    function pressed() {
      return [...commands().querySelectorAll('[aria-pressed="true"]')].map(
        (button) => button.dataset.add,
      );
    }

    it("offers the commands for a shape() only", async () => {
      const view = await load(RULE("shape(from 0 0,|line to 100px 0)"));

      expect(commands().hidden).toBe(false);
      expect(pressed()).toEqual(["line"]);

      setCode(view, RULE("polygon(|0 0,1px 1px,0 1px)"));
      flush();

      expect(commands().hidden).toBe(true);
    });

    it("adds a point with the command picked", async () => {
      const view = await load(RULE("shape(from 0 0,|line to 100px 0)"));

      commands().querySelector('[data-add="arc"]').click();
      expect(pressed()).toEqual(["arc"]);
      flush();
      pointer("pointerdown", "m0", { x: 50, y: 20 });

      expect(value(view)).toBe(
        "shape(from 0 0,arc to 50px 20px of 27px,line to 100px 0)",
      );
    });

    it("ignores a click beside the commands", async () => {
      await load(RULE("shape(from 0 0,|line to 100px 0)"));

      commands().click();

      expect(pressed()).toEqual(["line"]);
    });
  });

  describe("edit toggle", () => {
    function toggle() {
      return bar().querySelector("[data-toggle]");
    }

    it("is on at first", async () => {
      await load(RULE("circle(|)"));

      expect(toggle().getAttribute("role")).toBe("switch");
      expect(toggle().getAttribute("aria-checked")).toBe("true");
      expect(overlay()).not.toBeNull();
    });

    it("explains itself with the site's tooltips", async () => {
      await load(RULE("circle(|)"));

      expect(toggle().dataset.hint).toBe("Edit the shape on the output");
      expect(toggle().classList).toContain("hint--bottom-left");
      expect(toggle().hasAttribute("title")).toBe(false);
    });

    it("switches from its knob too", async () => {
      await load(RULE("circle(|)"));

      toggle().querySelector(".cbt-clip-path__knob").click();
      flush();

      expect(overlay()).toBeNull();
    });

    it("takes the shape off the output, the bar staying", async () => {
      await load(RULE("circle(|)"));

      toggle().click();
      flush();

      expect(overlay()).toBeNull();
      expect(toggle().getAttribute("aria-checked")).toBe("false");
      expect(status()).toBe("circle()");
      expect(frames).toHaveLength(1);
    });

    it("draws the shape again once back on", async () => {
      await load(RULE("circle(|)"));

      toggle().click();
      flush();
      toggle().click();
      flush();

      expect(handleIds()).toEqual(["c", "r"]);
      expect(toggle().getAttribute("aria-checked")).toBe("true");
    });

    it("stays off in the next battle", async () => {
      await load(RULE("circle(|)"));
      toggle().click();
      flush();
      document.dispatchEvent(new CustomEvent("cbt-clip-path-detach"));

      const next = createView("");
      renderPage(next);
      document.dispatchEvent(new CustomEvent("cbt-clip-path-attach"));
      setCode(next, RULE("circle(|)"));
      flush();

      expect(overlay()).toBeNull();
      expect(toggle().getAttribute("aria-checked")).toBe("false");
    });

    it("leaves the ready-made shapes at hand", async () => {
      const view = await load(RULE("|"));
      toggle().click();
      flush();

      bar().querySelector('[aria-label="Circle"]').click();

      expect(value(view)).toBe("circle(50%)");
    });
  });

  describe("ready-made shapes", () => {
    function pick(name) {
      bar().querySelector(`[aria-label="${name}"]`).click();
    }

    it("fill an empty value, the caret in the shape", async () => {
      const view = await load(RULE(" |"));

      pick("Triangle");

      expect(value(view)).toBe(" polygon(50% 0,100% 100%,0 100%)");
      expect(view.doc[view.head - 1]).toBe("(");
      expect(view.log.at(-1).userEvent).toBe("input.cbt-clip-path");
      expect(view.focus).toHaveBeenCalled();
    });

    it("keep the reference box", async () => {
      const view = await load(RULE("none |content-box"));

      pick("Circle");

      expect(value(view)).toBe("circle(50%) content-box");
    });

    it("replace the shape", async () => {
      const view = await load(RULE("border-box polygon(|1px 1px)"));

      pick("Inset");

      expect(value(view)).toBe("border-box inset(15%)");
    });

    it("do nothing once the tool is off", async () => {
      const view = await load(RULE("|"));
      document.body.classList.add("hideClipPath");

      pick("Circle");

      expect(value(view)).toBe("");
    });

    it("ignore a click beside them", async () => {
      const view = await load(RULE("|"));

      bar().querySelector(".cbt-clip-path__presets").click();

      expect(value(view)).toBe("");
    });

    it("keep the focus in the editor", async () => {
      await load(RULE("|"));

      const press = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
      });
      bar().dispatchEvent(press);

      expect(press.defaultPrevented).toBe(true);
    });
  });

  describe("border-shape", () => {
    const BORDER = (value) =>
      `<div></div><style>div{border-shape:${value}}</style>`;
    /** A 10px border and 20px of padding, 200×100 in all. */
    const BOXED = {
      render: `<div style="border:10px solid;padding:20px"></div>`,
    };

    function borderShape(view) {
      return /border-shape:([^;}"]*)/.exec(view.doc)[1];
    }

    function groups() {
      return [...overlay().querySelectorAll("g")].map((g) => ({
        part: g.dataset.part,
        idle: g.classList.contains("cbt-clip-path__idle"),
        transform: g.getAttribute("transform"),
        width: g.querySelector("rect").getAttribute("width"),
      }));
    }

    it("strokes a single shape halfway through the border", async () => {
      await load(BORDER("circle(|50%)"), BOXED);

      expect(status()).toBe("circle() stroked");
      expect(groups()).toEqual([
        {
          part: "0",
          idle: false,
          transform: "translate(10 20) translate(5 5)",
          width: "190",
        },
      ]);
      expect(handleIds()).toEqual(["c", "r"]);
    });

    it("draws two shapes, on the border box and the padding box", async () => {
      await load(BORDER("inset(0) inset(|1px)"), BOXED);

      expect(status()).toBe("inset() outside, inset() inside");
      expect(groups()).toEqual([
        {
          part: "0",
          idle: true,
          transform: "translate(10 20) translate(0 0)",
          width: "200",
        },
        {
          part: "1",
          idle: false,
          transform: "translate(10 20) translate(10 10)",
          width: "180",
        },
      ]);
      expect(handleIds()).toEqual([
        "t",
        "r",
        "b",
        "l",
        "1:t",
        "1:r",
        "1:b",
        "1:l",
      ]);
    });

    it("draws each shape in the box written after it", async () => {
      await load(BORDER("inset(|0) content-box"), BOXED);

      expect(groups()[0].transform).toBe("translate(10 20) translate(30 30)");
    });

    it("draws the shape the caret stands in on top, the other faded", async () => {
      await load(BORDER("inset(0) circle(|1px)"));

      expect(groups().map(({ part, idle }) => [part, idle])).toEqual([
        ["0", true],
        ["1", false],
      ]);
      expect(handleIds()).toEqual(["t", "r", "b", "l", "1:c", "1:r"]);

      setCode(
        document.querySelector(".cm-content").cmView.rootView.view,
        BORDER("inset(|0) circle(1px)"),
      );
      flush();
      expect(groups().map(({ part, idle }) => [part, idle])).toEqual([
        ["1", true],
        ["0", false],
      ]);
      expect(handleIds()).toEqual(["1:c", "1:r", "t", "r", "b", "l"]);
    });

    it("moves the points of the inner shape", async () => {
      const view = await load(
        BORDER("polygon(0 0,100% 0,0 100%) polygon(|0 0,9px 0,0 9px)"),
      );

      pointer("pointerdown", "1:v1", { x: 9, y: 0 });
      pointer("pointermove", null, { x: 20, y: 5 });

      expect(borderShape(view)).toBe(
        "polygon(0 0,100% 0,0 100%) polygon(0 0,20px 5px,0 9px)",
      );
    });

    it("adds a point to the inner shape, then drags it", async () => {
      const view = await load(BORDER("circle(0) polygon(|0 0,10px 0,0 10px)"));

      pointer("pointerdown", "1:m0", { x: 5, y: 0 });
      expect(borderShape(view)).toBe(
        "circle(0) polygon(0 0,5px 0,10px 0,0 10px)",
      );
      flush();
      pointer("pointermove", null, { x: 5, y: 3 });

      expect(borderShape(view)).toBe(
        "circle(0) polygon(0 0,5px 3px,10px 0,0 10px)",
      );
    });

    it("shows a path() without points to drag", async () => {
      await load(BORDER("path('M0 0') circle(|)"));

      expect(status()).toBe("path() outside, circle() inside");
      expect(handleIds()).toEqual(["1:c", "1:r"]);
    });

    it("replaces the shape the caret stands in", async () => {
      const view = await load(BORDER("circle(1px) polygon(|0 0)"));

      bar().querySelector('[aria-label="Inset"]').click();

      expect(borderShape(view)).toBe("circle(1px) inset(15%)");
    });

    it("fills an empty value", async () => {
      const view = await load(BORDER("|"));

      expect(status()).toBe("Pick a shape");
      bar().querySelector('[aria-label="Circle"]').click();

      expect(borderShape(view)).toBe("circle(50%)");
    });

    it("has an option of its own", async () => {
      document.body.classList.add("hideClipPath");
      await load(BORDER("circle(|)"));
      expect(overlay()).not.toBeNull();

      document.body.classList.add("hideBorderShape");
      document.querySelector(".cm-content").cmView.rootView.view.dispatch({});
      flush();
      expect(overlay()).toBeNull();
    });
  });

  describe("colors", () => {
    class Highlight {
      constructor(...ranges) {
        this.ranges = ranges;
      }
    }

    beforeEach(() => {
      vi.stubGlobal("CSS", { highlights: new Map() });
      vi.stubGlobal("Highlight", Highlight);
    });

    function toggle() {
      return bar().querySelector("[data-toggle]");
    }

    function colorOf(id) {
      return document
        .querySelector(`[data-handle="${id}"]`)
        .style.getPropertyValue("--cbt-point");
    }

    /** The text colored in the code, by highlight. */
    function highlights() {
      return Object.fromEntries(
        [...CSS.highlights].map(([name, { ranges }]) => [
          name,
          ranges.map(String),
        ]),
      );
    }

    it("gives each point its own color, none to the new ones", async () => {
      await load(RULE("polygon(50% |0,100% 100%,0 100%)"));

      expect(["v0", "v1", "v2"].map(colorOf)).toEqual(POINT_COLORS.slice(0, 3));
      expect(colorOf("m0")).toBe("");
    });

    it("goes round the colors past the last one", async () => {
      const points = Array.from({ length: 31 }, (_, i) => `${i}px 0`);
      await load(RULE(`polygon(|${points.join(",")})`));

      expect(
        new Set(points.slice(0, 30).map((_, i) => colorOf(`v${i}`))).size,
      ).toBe(30);
      expect(colorOf("v30")).toBe(colorOf("v0"));
    });

    it("goes on from a shape of a border-shape to the next", async () => {
      await load(
        "<div></div><style>div{border-shape:circle(|1px) inset(2px)}</style>",
      );

      expect(["c", "r", "1:t", "1:r"].map(colorOf)).toEqual(
        POINT_COLORS.slice(0, 4),
      );
    });

    it("colors the values of each point in the code alike", async () => {
      await load(RULE("polygon(50% |0,100% 1px,0 100%)"));

      expect(highlights()).toEqual({
        "cbt-point-0": ["50%", "0"],
        "cbt-point-1": ["100%", "1px"],
        "cbt-point-2": ["0", "100%"],
      });
      const style = document.getElementById("cbt-point-colors").textContent;
      expect(style.split("\n")).toHaveLength(30);
      expect(style).toContain(
        "::highlight(cbt-point-0) { color: hsl(0 90% 64%); background-color: color-mix(in srgb, hsl(0 90% 64%) 22%, transparent); }",
      );
    });

    it("colors the values once changed", async () => {
      const view = await load(RULE("polygon(50% 0,100% 100%,0 |100%)"));

      pointer("pointerdown", "v0");
      pointer("pointermove", null, { x: 20, y: 30 });
      flush();

      expect(highlights()["cbt-point-0"]).toEqual(["10%", "30%"]);
      expect(value(view)).toBe("polygon(10% 30%,100% 100%,0 100%)");
    });

    it("colors the lines CodeMirror draws again", async () => {
      await load(RULE("circle(|1px)"));
      document.querySelector(".cm-content").textContent = "";

      flush();

      expect(highlights()["cbt-point-1"]).toEqual(["1px"]);
    });

    it("keeps its highlights while nothing changes", async () => {
      await load(RULE("circle(|1px)"));
      const before = CSS.highlights.get("cbt-point-1");

      flush();

      expect(CSS.highlights.get("cbt-point-1")).toBe(before);
    });

    it("leaves out the values of the lines not drawn", async () => {
      const view = createView("");
      // Up to the first point.
      view.viewport = { from: 0, to: 60 };
      renderPage(view);
      await import("./clip-path-page.js");
      setCode(view, RULE("polygon(|1px 2px,3px 4px)"));
      flush();

      expect(highlights()).toEqual({ "cbt-point-0": ["1px", "2px"] });
    });

    it("takes the colors off with the shape", async () => {
      const view = await load(RULE("circle(|1px)"));
      toggle().click();
      flush();
      expect(highlights()).toEqual({});

      toggle().click();
      flush();
      setCode(view, `${RULE("circle(1px)")}|`);
      flush();
      expect(highlights()).toEqual({});
    });
  });
});
