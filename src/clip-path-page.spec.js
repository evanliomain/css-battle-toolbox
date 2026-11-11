/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    get state() {
      return {
        doc: { toString: () => this.doc },
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

      expect(document.querySelector(".target-container").lastChild).toBe(
        overlay(),
      );
      expect(handleIds()).toEqual(["v0", "v1", "v2", "m0", "m1", "m2"]);
      expect(overlay().querySelector("g").getAttribute("transform")).toBe(
        "translate(10 20) translate(0 0)",
      );
      expect(overlay().querySelector("path").getAttribute("d")).toBe(
        "M 100 0 L 200 100 L 0 100 Z",
      );
      expect(overlay().querySelector("svg").getAttribute("width")).toBe("400");
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

    it("moves to the new render container", async () => {
      await load(RULE("circle(|)"));
      const container = document.querySelector(".target-container");
      const next = container.cloneNode(true);
      container.replaceWith(next);
      Object.defineProperty(next.querySelector("iframe"), "clientWidth", {
        value: 400,
      });

      flush();

      expect(overlay().parentElement).toBe(next);
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
});
