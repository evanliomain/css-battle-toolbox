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
    viewport = { from: 0, to: Infinity };
    /** The editor's text, as a single text node, drawn again on change. */
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

/** The border-image value in the code. */
function value(view) {
  return /border-image:([^;}"]*)/.exec(view.doc)[1];
}

let frames;

/** Runs the frames asked for so far, as the browser would. */
function flush() {
  const queued = frames;
  frames = [];
  queued.forEach((callback) => callback());
}

/** What the render computes for the element, jsdom computing none of it. */
const STYLE = {
  "border-image-source": "linear-gradient(red, 10vw, blue 2rem)",
  "border-image-slice": "25%",
  "border-image-width": "10px",
  "border-image-outset": "0",
  "border-image-repeat": "stretch",
  "font-size": "16px",
};

let computed;

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
  const own = renderWin.getComputedStyle.bind(renderWin);
  vi.spyOn(renderWin, "getComputedStyle").mockImplementation((el) => {
    const style = own(el);
    if (!["DIV", "HTML"].includes(el.tagName)) {
      return style;
    }
    return new Proxy(style, {
      get(target, name) {
        if ("getPropertyValue" === name) {
          return (property) =>
            computed[property] ?? target.getPropertyValue(property);
        }
        if ("fontSize" === name) {
          return computed["font-size"];
        }
        const found = target[name];
        return "function" === typeof found ? found.bind(target) : found;
      },
    });
  });
  return iframe;
}

function overlay() {
  return document.getElementById("cbt-border-image");
}

/** What the page script told the panel so far, as JSON would carry it. */
let sentStates;
/** What the page script gave the panel last: how to send and close. */
let sidebarOptions;

function states() {
  return sentStates;
}

function sidebar() {
  return document.getElementById("cbt-border-image-sidebar");
}

/** Sends a command of the panel to the page script. */
function command(data) {
  sidebarOptions.send(data);
}

function line(id, where = overlay()) {
  return where.querySelector(`[data-line="${id}"]`);
}

/** Fires a pointer event on an element. */
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

const RULE = (value) => `<div></div><style>div{border-image:${value}}</style>`;
const G = "linear-gradient(red,blue)";

describe("border-image-page", () => {
  let documentListeners;
  let ctm;

  beforeEach(() => {
    vi.resetModules();
    frames = [];
    computed = { ...STYLE };
    vi.stubGlobal("requestAnimationFrame", (callback) => frames.push(callback));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    // The lines sit at the client's origin: client = local.
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
    ctm = { a: 1, b: 0, inverse: () => ({}) };
    window.SVGElement.prototype.getScreenCTM = () => ctm;
    vi.spyOn(console, "debug").mockImplementation(() => {});
    documentListeners = vi.spyOn(document, "addEventListener");
    sentStates = [];
    sidebarOptions = null;
    // The panel draws what it is told: its own tests tell how.
    vi.doMock("./utils/border-image-sidebar", () => ({
      createSidebar(options) {
        sidebarOptions = options;
        const element = document.createElement("div");
        element.id = "cbt-border-image-sidebar";
        return {
          element,
          update: (data) => sentStates.push(JSON.parse(JSON.stringify(data))),
          destroy: () => element.remove(),
        };
      },
    }));
  });

  afterEach(() => {
    // The document outlives the module: unbind the previous load's listeners.
    documentListeners.mock.calls.forEach(([type, handler]) =>
      document.removeEventListener(type, handler),
    );
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    document.body.className = "";
    window.history.replaceState({}, "", "/play/123");
  });

  /**
   * Loads the page script on a page whose code is `code`, and opens the panel
   * once the caret is in a value.
   */
  async function load(code, options) {
    const view = createView("");
    renderPage(view, options);
    await import("./border-image-page.js");
    setCode(view, code);
    flush();
    return view;
  }

  /** The titles of the things that change the result, as last told. */
  function noticeTitles() {
    return states()
      .at(-1)
      .notices.map(({ title }) => title);
  }

  describe("attach", () => {
    it("waits for an editor to be there", async () => {
      await import("./border-image-page.js");

      expect(console.debug).toHaveBeenCalledWith(
        "[cbt] border-image tool: no CodeMirror view found",
      );
    });

    it("follows the editor of the next battle", async () => {
      const first = await load(RULE(`${G}2|5%/10px`));
      document.dispatchEvent(new CustomEvent("cbt-border-image-detach"));
      expect(overlay()).toBeNull();
      expect(sidebar()).toBeNull();

      const next = createView("");
      renderPage(next);
      document.dispatchEvent(new CustomEvent("cbt-border-image-attach"));
      setCode(next, RULE(`${G}2|5%/10px`));
      setCode(first, "|");
      flush();

      expect(overlay()).not.toBeNull();
    });

    it("draws nothing from a frame asked before the battle left", async () => {
      const view = await load(RULE(`${G}2|5%`));
      view.dispatch({});

      document.dispatchEvent(new CustomEvent("cbt-border-image-detach"));
      flush();

      expect(sidebar()).toBeNull();
    });

    it("asks for a single frame at a time", async () => {
      const view = await load(RULE(`${G}2|5%`));

      view.dispatch({});
      view.dispatch({});

      expect(frames).toHaveLength(1);
    });
  });

  describe("drawing", () => {
    const pieces = (where = overlay()) => [
      ...where.querySelectorAll(".cbt-border-image__piece"),
    ];

    it("draws the nine pieces over the element, numbered", async () => {
      await load(RULE(`${G}2|5%/10px`));

      expect(overlay().parentElement).toBe(document.body);
      const group = overlay().querySelector('g[data-part="output"]');
      expect(group.getAttribute("transform")).toBe("translate(10 20)");
      expect(pieces().map((piece) => piece.getAttribute("class"))).toEqual([
        "cbt-border-image__piece cbt-border-image__piece--corner",
        "cbt-border-image__piece cbt-border-image__piece--edge",
        "cbt-border-image__piece cbt-border-image__piece--corner",
        "cbt-border-image__piece cbt-border-image__piece--edge",
        "cbt-border-image__piece cbt-border-image__piece--middle cbt-border-image__piece--empty",
        "cbt-border-image__piece cbt-border-image__piece--edge",
        "cbt-border-image__piece cbt-border-image__piece--corner",
        "cbt-border-image__piece cbt-border-image__piece--edge",
        "cbt-border-image__piece cbt-border-image__piece--corner",
      ]);
      // Only the middle has room for its number.
      const numbers = [...group.querySelectorAll("text")];
      expect(numbers.map((number) => number.textContent)).toEqual(["5"]);
      expect(numbers[0].getAttribute("class")).toBe(
        "cbt-border-image__number cbt-border-image__number--empty",
      );
      expect(group.querySelector(".cbt-border-image__box")).toBeNull();
      expect(overlay().querySelector(".cbt-border-image__dim")).toBeNull();
      expect(overlay().querySelector("svg").getAttribute("width")).toBe("400");
    });

    it("draws a line and a handle for each width and outset", async () => {
      await load(RULE(`${G}2|5%/10px`));

      const group = overlay().querySelector('g[data-part="output"]');
      expect(
        [...group.querySelectorAll("[data-edge]")].map((g) => g.dataset.edge),
      ).toEqual([
        "outset-0",
        "outset-1",
        "outset-2",
        "outset-3",
        "width-0",
        "width-1",
        "width-2",
        "width-3",
      ]);
      expect(group.querySelector('[data-edge="width-0"]').outerHTML).toBe(
        `<g class="cbt-border-image__edge cbt-border-image__edge--width cbt-border-image__edge--ns" data-edge="width-0" style="--cbt-line: ${POINT_COLORS[1]}"><line class="cbt-border-image__line" x1="0" y1="10" x2="200" y2="10"></line><line class="cbt-border-image__hit" data-line="width-0" x1="0" y1="10" x2="200" y2="10"><title>width top</title></line></g>`,
      );
      // The handles in pixels of the render, out of the transforms.
      const handles = [
        ...overlay().querySelectorAll(
          ":scope svg > g .cbt-border-image__handle",
        ),
      ];
      expect(handles).toHaveLength(8);
      const width = overlay().querySelector(
        'circle.cbt-border-image__handle[data-line="width-0"]',
      );
      expect([width.getAttribute("cx"), width.getAttribute("cy")]).toEqual([
        "110",
        "30",
      ]);
      const outset = overlay().querySelector(
        'rect.cbt-border-image__handle[data-line="outset-3"]',
      );
      expect(outset.getAttribute("transform")).toBe("rotate(45 10 45)");
    });

    it("draws the border box when the outsets grow the area", async () => {
      computed["border-image-outset"] = "5px";
      await load(RULE(`${G}2|5%/10px/5px`));

      const box = overlay().querySelector(".cbt-border-image__box");
      expect([box.getAttribute("x"), box.getAttribute("width")]).toEqual([
        "0",
        "200",
      ]);
      expect(pieces()[0].getAttribute("x")).toBe("-5");
    });

    it("follows the render", async () => {
      await load(RULE(`${G}2|5%`));
      vi.spyOn(
        document.querySelector(".target-container"),
        "getBoundingClientRect",
      ).mockReturnValue({ left: 5, top: 7 });

      flush();

      expect(overlay().style.translate).toBe("5px 7px");
    });

    it("draws it again once it went", async () => {
      await load(RULE(`${G}2|5%`));
      overlay().remove();

      flush();

      expect(overlay().querySelector("svg")).not.toBeNull();
    });

    it("leaves what it drew as it is while nothing changes", async () => {
      await load(RULE(`${G}2|5%`));
      const svg = overlay().querySelector("svg");
      const sent = states().length;

      flush();

      expect(overlay().querySelector("svg")).toBe(svg);
      expect(states()).toHaveLength(sent);
    });

    it("goes away when the caret leaves the value", async () => {
      const view = await load(RULE(`${G}2|5%`));

      view.dispatch({ selection: { anchor: 0 } });
      flush();

      expect(overlay()).toBeNull();
      expect(sidebar()).toBeNull();
      expect(frames).toHaveLength(0);
    });

    it("draws nothing once the option is off", async () => {
      document.body.classList.add("hideBorderImage");

      await load(RULE(`${G}2|5%`));

      expect(sidebar()).toBeNull();
    });

    it("draws nothing outside a battle", async () => {
      window.history.replaceState({}, "", "/");

      await load(RULE(`${G}2|5%`));

      expect(sidebar()).toBeNull();
    });

    it("draws nothing without the render", async () => {
      const view = await load(RULE(`${G}2|5%`));
      document.querySelector("iframe").remove();

      view.dispatch({});
      flush();

      expect(sidebar()).toBeNull();
    });

    it("says what it cannot find", async () => {
      await load(`<p></p><style>p:after{border-image:${G}2|5%}</style>`);

      expect(overlay()).toBeNull();
      expect(states().at(-1)).toEqual({
        reason: "pseudo-element",
        names: [],
        onOutput: true,
      });
    });

    it("draws on the element of a style attribute", async () => {
      await load(`<div style="border-image:${G}2|5%"></div>`, {
        render: `<div style="color:red"></div>`,
      });

      expect(states().at(-1).names).toEqual(["div"]);
      expect(overlay()).not.toBeNull();
    });

    it("finds no element for a rule without a selector", async () => {
      await load(`<style>@media (x){border-image:${G}2|5%}</style>`);

      expect(states().at(-1).reason).toBe("element not found");
    });

    it("takes no zoom where the browser tells none", async () => {
      const view = createView("");
      const iframe = renderPage(view);
      Object.defineProperty(
        iframe.contentDocument.querySelector("div"),
        "currentCSSZoom",
        { value: undefined },
      );
      await import("./border-image-page.js");
      setCode(view, RULE(`${G}2|5%`));
      flush();

      expect(states().at(-1).zoom).toBe(1);
      expect(states().at(-1).stories[0].sizes).toBe("50×25 → 10×10");
    });

    it("takes the initial values the render leaves out", async () => {
      computed = {
        ...Object.fromEntries(Object.keys(STYLE).map((name) => [name, ""])),
        "font-size": "16px",
        "border-top-width": "",
      };

      await load(RULE(`${G}2|5%`));

      expect(states().at(-1).stories[0].sizes).toBe("200×100 → 0×0");
      expect(noticeTitles()).toEqual(["No border to count"]);
      expect(states().at(-1).repeat).toEqual(["stretch", "stretch"]);
      expect(states().at(-1).clone).toContain(
        "border-image-source:none;border-image-slice:0;",
      );
    });

    it("follows the element's zoom", async () => {
      const view = createView("");
      const iframe = renderPage(view);
      Object.defineProperty(
        iframe.contentDocument.querySelector("div"),
        "currentCSSZoom",
        { value: 2 },
      );
      computed["border-image-slice"] = "10";
      computed["border-top-width"] = "3px";
      computed["border-right-width"] = "thin";
      await import("./border-image-page.js");
      setCode(view, RULE(`${G}1|0`));
      flush();

      const state = states().at(-1);
      expect(state.stories[0].sizes).toBe("20×20 → 20×20");
      expect(state.zoom).toBe(2);
      expect(state.clone).toContain("width:100px;height:50px;");
    });

    it("draws an element of no size", async () => {
      const view = createView("");
      const iframe = renderPage(view);
      iframe.contentWindow.Element.prototype.getBoundingClientRect.mockReturnValue(
        { x: 0, y: 0, width: 0, height: 0 },
      );
      await import("./border-image-page.js");
      setCode(view, RULE(`${G}2|5%`));
      flush();

      expect(states().at(-1).layout.pieces).toHaveLength(9);
    });
  });

  describe("notices", () => {
    it("tells nothing while there is nothing to beware of", async () => {
      await load(RULE(`${G}2|5%`));

      expect(noticeTitles()).toEqual([]);
    });

    it("warns of the widths shrunk and rounded down", async () => {
      computed["border-image-width"] = "60.5px 10px";
      await load(RULE(`${G}2|5%`));

      expect(noticeTitles()).toEqual([
        "Widths shrunk to fit the element",
        "Widths rounded down to the pixel",
      ]);
    });

    it("warns of a var(), and locks every line", async () => {
      await load(RULE(`var(--a,${G})2|5%`));

      expect(noticeTitles()).toEqual(["Read only: var() in the value"]);
      expect(
        overlay().querySelector('[data-edge="width-0"]').getAttribute("class"),
      ).toContain("cbt-border-image__edge--locked");
      expect(states().at(-1)).toMatchObject({ opaque: true });
      expect(states().at(-1).locked).toHaveLength(12);
    });
  });

  describe("opening", () => {
    it("opens the panel as soon as the caret is in the value", async () => {
      await load(RULE(`${G}2|5%`));

      expect(sidebar().parentElement).toBe(document.body);
      expect(states().at(-1).layout).toBeDefined();
      expect(document.getElementById("cbt-border-image-bar")).toBeNull();
    });

    it("keeps it closed once closed, until the caret comes back", async () => {
      const view = await load(RULE(`${G}2|5%`));

      sidebarOptions.close();
      flush();
      view.dispatch({});
      flush();
      expect(sidebar()).toBeNull();
      expect(overlay()).not.toBeNull();

      view.dispatch({ selection: { anchor: 0 } });
      flush();
      view.dispatch({ selection: { anchor: view.doc.indexOf("25") + 1 } });
      flush();
      expect(sidebar()).not.toBeNull();
    });

    it("keeps the focus in the editor", async () => {
      await load(RULE(`${G}2|5%`));

      const event = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
      });
      overlay().dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });

    it("takes the pieces off the output, and back", async () => {
      await load(RULE(`${G}2|5%`));

      command({ type: "draw" });
      flush();
      expect(overlay()).toBeNull();
      expect(states().at(-1)).toMatchObject({ onOutput: false });
      expect(states().at(-1).layout).toBeDefined();

      command({ type: "draw" });
      flush();
      expect(overlay()).not.toBeNull();
      expect(states().at(-1)).toMatchObject({ onOutput: true });
    });

    it("switches between the elements the rule styles", async () => {
      const view = await load(`<style>div,p{border-image:${G}2|5%}</style>`, {
        render: "<div></div><p></p>",
      });
      expect(states().at(-1).names).toEqual(["div", "p"]);

      command({ type: "isolate", zone: 1 });
      flush();
      command({ type: "element", index: 1 });
      flush();
      expect(states().at(-1)).toMatchObject({ index: 1, isolated: -1 });

      // Another rule starts from its first element.
      setCode(
        view,
        `<style>div,p{border-image:${G}25%}p{border-image:${G}3|0%}</style>`,
      );
      flush();
      expect(states().at(-1).index).toBe(0);
    });
  });
  describe("dragging on the output", () => {
    it("drags a width", async () => {
      const view = await load(RULE(`${G}2|5%/10px`));
      overlay().setPointerCapture = vi.fn();
      overlay().releasePointerCapture = vi.fn();

      const down = pointer("pointerdown", line("width-0"), { x: 100, y: 11 });
      pointer("pointermove", overlay(), { x: 100, y: 30 });

      expect(down.defaultPrevented).toBe(true);
      expect(overlay().setPointerCapture).toHaveBeenCalledWith(1);
      expect(value(view)).toBe(`${G}25%/30px`);
      expect(view.log.at(-1).userEvent).toBeUndefined();

      pointer("pointerup", overlay());
      expect(overlay().releasePointerCapture).toHaveBeenCalledWith(1);
      pointer("pointermove", overlay(), { x: 100, y: 50 });
      expect(value(view)).toBe(`${G}25%/30px`);
    });

    it("shows the line dragged, and changes nothing where it stands", async () => {
      const view = await load(RULE(`${G}2|5%/10px`));
      const edits = view.log.length;
      const edge = () => overlay().querySelector('[data-edge="width-0"]');

      pointer("pointerdown", line("width-0"), { x: 100, y: 10 });
      flush();
      expect(edge().getAttribute("class")).toContain("--active");
      pointer("pointermove", overlay(), { x: 100, y: 10 });
      expect(view.log).toHaveLength(edits);

      pointer("pointerup", overlay());
      flush();
      expect(edge().getAttribute("class")).not.toContain("--active");
    });

    it("splits the sides with Alt, and fine tunes with Shift", async () => {
      computed["border-top-width"] = "4px";
      computed["border-image-width"] = "1";
      const view = await load(RULE(`${G}2|5%/1`));
      computed["border-image-width"] = "1";

      pointer("pointerdown", line("width-0"), { x: 100, y: 4 });
      pointer("pointermove", overlay(), { x: 100, y: 9, altKey: true });
      expect(value(view)).toBe(`${G}25%/2.3 1 1`);

      pointer("pointermove", overlay(), {
        x: 100,
        y: 9,
        altKey: true,
        shiftKey: true,
      });
      expect(value(view)).toBe(`${G}25%/2.25 1 1`);
    });

    it("waits for the move to choose between lines one on the other", async () => {
      computed["border-image-width"] = "0";
      const view = await load(RULE(`${G}2|5%`));

      pointer("pointerdown", line("outset-0"), { x: 100, y: 0 });
      pointer("pointermove", overlay(), { x: 100, y: 0 });
      expect(value(view)).toBe(`${G}25%`);
      pointer("pointermove", overlay(), { x: 100, y: -5 });
      expect(value(view)).toBe(`${G}25%//5px`);
    });

    it("drags the other line the other way", async () => {
      computed["border-image-width"] = "0";
      const view = await load(RULE(`${G}2|5%`));

      pointer("pointerdown", line("outset-0"), { x: 100, y: 0 });
      pointer("pointermove", overlay(), { x: 100, y: 5 });

      expect(value(view)).toBe(`${G}25%/5px`);
    });

    it("leaves a press off the lines", async () => {
      const view = await load(RULE(`${G}2|5%/10px`));
      const edits = view.log.length;

      const down = pointer("pointerdown", overlay().querySelector("svg"));
      pointer("pointermove", overlay(), { x: 100, y: 30 });

      expect(down.defaultPrevented).toBe(false);
      expect(view.log).toHaveLength(edits);
    });

    it("leaves a press too far from a line", async () => {
      const view = await load(RULE(`${G}2|5%/10px`));
      ctm = { a: 0, b: 0, inverse: () => ({}) };

      pointer("pointerdown", line("width-0"), { x: 100, y: 30 });
      pointer("pointermove", overlay(), { x: 100, y: 50 });

      expect(value(view)).toBe(`${G}25%/10px`);
    });

    it("drags nothing that is locked", async () => {
      const view = await load(RULE(`${G}2|5%/min(10px)`));

      pointer("pointerdown", line("width-0"), { x: 100, y: 10 });
      pointer("pointermove", overlay(), { x: 100, y: 30 });

      expect(value(view)).toBe(`${G}25%/min(10px)`);
    });

    it("stops once the value cannot be written", async () => {
      const view = await load(RULE(`${G}2|5%/10px`));

      pointer("pointerdown", line("width-0"), { x: 100, y: 10 });
      setCode(view, RULE(`${G}2|5%/min(10px)`));
      pointer("pointermove", overlay(), { x: 100, y: 30 });

      expect(value(view)).toBe(`${G}25%/min(10px)`);
    });

    it("stops once the caret left", async () => {
      const view = await load(RULE(`${G}2|5%/10px`));
      const ov = overlay();

      pointer("pointerdown", line("width-0"), { x: 100, y: 10 });
      view.dispatch({ selection: { anchor: 0 } });
      pointer("pointermove", ov, { x: 100, y: 30 });

      expect(value(view)).toBe(`${G}25%/10px`);
    });

    it("follows only the pointer that pressed", async () => {
      const view = await load(RULE(`${G}2|5%/10px`));

      pointer("pointerdown", line("width-0"), { x: 100, y: 10 });
      pointer("pointermove", overlay(), { x: 100, y: 30, pointerId: 2 });
      pointer("pointerup", overlay(), { pointerId: 2 });
      expect(value(view)).toBe(`${G}25%/10px`);

      pointer("pointermove", overlay(), { x: 100, y: 30 });
      expect(value(view)).toBe(`${G}25%/30px`);
    });

    it("drags nothing once the caret left", async () => {
      const view = await load(RULE(`${G}2|5%/10px`));
      const edge = line("width-0");

      view.dispatch({ selection: { anchor: 0 } });
      const down = pointer("pointerdown", edge, { x: 100, y: 10 });

      expect(down.defaultPrevented).toBe(false);
    });

    it("ignores a release without a drag", async () => {
      await load(RULE(`${G}2|5%/10px`));

      expect(() => pointer("pointerup", overlay())).not.toThrow();
    });
  });

  describe("panel", () => {
    it("sits under the output, right of the code", async () => {
      await load(RULE(`${G}2|5%/10px`));
      const style = () => sidebar().style;
      // No column of code: cssbattle's own place.
      expect(style().getPropertyValue("--cbt-left")).toBe("");

      const editor = document.createElement("div");
      editor.className = "container__item--editor";
      document.body.prepend(editor);
      vi.spyOn(editor, "getBoundingClientRect").mockReturnValue({
        right: 519.6,
      });
      const bottom = vi
        .spyOn(document.querySelector(".anchor"), "getBoundingClientRect")
        .mockReturnValue({ bottom: 443.2 });
      flush();
      expect(style().getPropertyValue("--cbt-left")).toBe("520px");
      expect(style().getPropertyValue("--cbt-top")).toBe("443px");

      // The output low on the screen, or scrolled above it: still on screen.
      bottom.mockReturnValue({ bottom: 700 });
      flush();
      expect(style().getPropertyValue("--cbt-top")).toBe(
        `${window.innerHeight - 240}px`,
      );
      bottom.mockReturnValue({ bottom: -50 });
      flush();
      expect(style().getPropertyValue("--cbt-top")).toBe("0px");

      // No column of code any more: back to the right.
      editor.remove();
      flush();
      expect(style().getPropertyValue("--cbt-left")).toBe("");
      expect(style().getPropertyValue("--cbt-top")).toBe("");
    });

    it("sends what to draw, once", async () => {
      await load(RULE(`${G}2|5%/10px`));

      const state = states().at(-1);
      expect(state).toMatchObject({
        names: ["div"],
        index: 0,
        reason: "",
        notices: [],
        opaque: false,
        repeat: ["stretch", "stretch"],
        fill: false,
        locked: [],
        hovered: -1,
        isolated: -1,
        dragged: "",
        zoom: 1,
      });
      expect(state.layout.slices).toEqual([25, 50, 25, 50]);
      expect(state.stories[0].name).toBe("Top-left corner");
      // As written, or as left out.
      expect(state.written).toEqual({
        slice: ["25%", "25%", "25%", "25%"],
        width: ["10px", "10px", "10px", "10px"],
        outset: ["0", "0", "0", "0"],
      });
      expect(state.look).toMatch(
        /^--cbt-source:linear-gradient\(red, 40px, blue 32px\);font-family:/,
      );
      expect(state.clone).toContain(
        "box-sizing:border-box;width:200px;height:100px;border-style:solid;border-image-source:linear-gradient(red, 40px, blue 32px);border-image-slice:25%;border-image-width:10px;border-image-outset:0;border-image-repeat:stretch;",
      );
      const sent = states().length;
      flush();
      expect(states()).toHaveLength(sent);
    });

    it("closes it once the caret left", async () => {
      const view = await load(RULE(`${G}2|5%`));

      view.dispatch({ selection: { anchor: 0 } });
      flush();

      expect(sidebar()).toBeNull();
    });

    it("drags a width of the element in it", async () => {
      const view = await load(RULE(`${G}2|5%/10px`));

      command({
        type: "down",
        where: "element",
        point: { x: 100, y: 11 },
        scale: 1,
        zone: null,
      });
      flush();
      expect(states().at(-1).dragged).toBe("width-0");
      command({ type: "move", point: { x: 100, y: 30 } });
      expect(value(view)).toBe(`${G}25%/30px`);

      command({ type: "up" });
      flush();
      expect(states().at(-1).dragged).toBe("");
    });

    it("drags the line pressed by its handle, off the line", async () => {
      const view = await load(RULE(`${G}2|5%/10px`));

      // Left of the top width's end, out of reach of the point alone.
      command({
        type: "down",
        where: "element",
        point: { x: -10, y: 10 },
        scale: 1,
        zone: null,
        line: "width-0",
      });
      command({ type: "move", point: { x: -10, y: 30 } });

      expect(value(view)).toBe(`${G}25%/30px`);
    });

    it("drops the slice dragged in it once closed", async () => {
      const view = await load(RULE(`${G}2|5%`));
      command({ type: "down", point: { x: 50, y: 50 }, scale: 1, zone: 3 });
      flush();
      expect(states().at(-1).dragged).toBe("slice-3");

      sidebarOptions.close();
      command({ type: "move", point: { x: 80, y: 50 } });

      expect(value(view)).toBe(`${G}25%`);
    });

    it("tells nothing once closed, and lets the output be", async () => {
      const view = await load(RULE(`${G}2|5%`));
      command({ type: "isolate", zone: 1 });
      flush();
      expect(states().at(-1).isolated).toBe(1);
      const sent = states().length;

      sidebarOptions.close();
      flush();
      setCode(view, RULE(`${G}3|0%`));
      flush();

      expect(sidebar()).toBeNull();
      expect(states()).toHaveLength(sent);
      expect(overlay().querySelector(".cbt-border-image__dim")).toBeNull();
    });

    it("lights the piece the panel hovers", async () => {
      await load(RULE(`${G}2|5%`));

      command({ type: "hover", zone: 2 });
      flush();

      expect(
        overlay().querySelector('[data-zone="2"]').getAttribute("class"),
      ).toContain("--hovered");
      expect(states().at(-1).hovered).toBe(2);
    });

    it("shows a piece alone, with its tiles, and all again", async () => {
      computed["border-image-repeat"] = "round";
      computed["border-image-slice"] = "10";
      computed["border-image-width"] = "5px";
      await load(RULE(`${G}1|0/5px round`));

      command({ type: "isolate", zone: 1 });
      flush();
      expect(
        overlay().querySelector(".cbt-border-image__dim").getAttribute("d"),
      ).toBe("M0 0h400v300h-400Z M15 20L205 20L205 25L15 25Z");
      // 190 long, tiles of 90 rounded to 2 of 95.
      expect(
        [...overlay().querySelectorAll(".cbt-border-image__tile")].map((l) =>
          l.getAttribute("x1"),
        ),
      ).toEqual(["100", "100"]);
      expect(states().at(-1).isolated).toBe(1);

      command({ type: "isolate", zone: 1 });
      flush();
      expect(overlay().querySelector(".cbt-border-image__dim")).toBeNull();
    });

    it("draws no bounds for the tiles of a side, or too thin", async () => {
      computed["border-image-repeat"] = "round";
      computed["border-image-slice"] = "10";
      computed["border-image-width"] = "5px";
      await load(RULE(`${G}1|0/5px round`));
      const tiles = () =>
        [...overlay().querySelectorAll(".cbt-border-image__tile")].map((l) =>
          l.getAttribute("y1"),
        );

      command({ type: "isolate", zone: 3 });
      flush();
      // 90 long, tiles of 40 rounded to 2 of 45.
      expect(tiles()).toEqual(["50", "50"]);

      command({ type: "isolate", zone: 0 });
      flush();
      expect(tiles()).toEqual([]);

      command({ type: "isolate", zone: 3 });
      computed["border-image-slice"] = "50% 10";
      flush();
      expect(tiles()).toEqual([]);

      computed["border-image-repeat"] = "stretch";
      flush();
      expect(tiles()).toEqual([]);
    });

    it("draws no bounds for a piece left out, or a single tile", async () => {
      computed["border-image-repeat"] = "round";
      computed["border-image-slice"] = "0 10";
      await load(RULE(`${G}0 1|0 round`));

      command({ type: "isolate", zone: 1 });
      flush();
      expect(
        overlay().querySelectorAll(".cbt-border-image__tile"),
      ).toHaveLength(0);

      computed["border-image-repeat"] = "space";
      computed["border-image-slice"] = "10";
      flush();
      // Top: 180 long, a tile of 180 × 1.
      expect(
        overlay().querySelectorAll(".cbt-border-image__tile"),
      ).toHaveLength(0);
    });

    it("switches to the element the panel picks", async () => {
      await load(`<style>div,p{border-image:${G}2|5%}</style>`, {
        render: "<div></div><p></p>",
      });

      command({ type: "element", index: 1 });
      flush();

      expect(states().at(-1).index).toBe(1);
    });

    it("cycles the repeat of an axis", async () => {
      const view = await load(RULE(`${G}2|5%`));

      command({ type: "repeat", axis: 0 });
      expect(value(view)).toBe(`${G}25%repeat stretch`);
      expect(view.log.at(-1).userEvent).toBe("input.cbt-border-image");

      command({ type: "repeat", axis: 1 });
      expect(value(view)).toBe(`${G}25%repeat`);

      command({ type: "repeat", axis: 0 });
      expect(value(view)).toBe(`${G}25%round repeat`);
    });

    it("goes back to stretch after space", async () => {
      const view = await load(RULE(`${G}2|5% space`));

      command({ type: "repeat", axis: 0 });

      expect(value(view)).toBe(`${G}25% stretch space`);
    });

    it("adds fill, or takes it off", async () => {
      const view = await load(RULE(`${G}2|5%`));

      command({ type: "fill" });
      expect(value(view)).toBe(`${G}25%fill`);

      command({ type: "fill" });
      expect(value(view)).toBe(`${G}25%`);
    });

    it("changes nothing in a var(), or with nothing drawn", async () => {
      const view = await load(RULE(`var(--a,${G})2|5%`));
      command({ type: "fill" });
      expect(value(view)).toBe(`var(--a,${G})25%`);

      setCode(view, `<p></p><style>p:after{border-image:${G}2|5%}</style>`);
      command({ type: "fill" });
      expect(view.doc).toContain(`${G}25%}`);
    });

    it("drags a slice of the image", async () => {
      const view = await load(RULE(`${G}2|5%/10px`));

      command({ type: "down", point: { x: 50, y: 50 }, scale: 1, zone: 3 });
      flush();
      expect(states().at(-1).dragged).toBe("slice-3");
      command({ type: "move", point: { x: 80, y: 50 } });
      expect(value(view)).toBe(`${G}40%/10px`);
      command({ type: "move", point: { x: 81, y: 50 }, shiftKey: true });
      expect(value(view)).toBe(`${G}40.5%/10px`);

      command({ type: "up" });
      flush();
      expect(states().at(-1).dragged).toBe("");
      command({ type: "move", point: { x: 100, y: 50 } });
      expect(value(view)).toBe(`${G}40.5%/10px`);
    });

    it("tells no line dragged on the output", async () => {
      await load(RULE(`${G}2|5%/10px`));

      pointer("pointerdown", line("width-0"), { x: 100, y: 10 });
      flush();

      expect(states().at(-1).dragged).toBe("");
    });

    it("waits for the move to choose between slices one on the other", async () => {
      computed["border-image-slice"] = "50%";
      const view = await load(RULE(`${G}5|0%`));

      command({ type: "down", point: { x: 100, y: 50 }, scale: 1, zone: 4 });
      flush();
      expect(states().at(-1).dragged).toBe("");
      // Rightwards: the left slice, which grows that way.
      command({ type: "move", point: { x: 120, y: 50 } });

      expect(value(view)).toBe(`${G}60%`);
    });

    it("shows a piece pressed alone, and all again", async () => {
      await load(RULE(`${G}2|5%`));

      command({ type: "down", point: { x: 100, y: 50 }, scale: 1, zone: 4 });
      flush();
      expect(states().at(-1).isolated).toBe(4);

      command({ type: "down", point: { x: 100, y: 50 }, scale: 1, zone: 4 });
      flush();
      expect(states().at(-1).isolated).toBe(-1);

      command({ type: "down", point: { x: 100, y: 50 }, scale: 1, zone: null });
      flush();
      expect(states().at(-1).isolated).toBe(-1);
    });

    it("presses nothing with nothing drawn", async () => {
      const view = await load(
        `<p></p><style>p:after{border-image:${G}2|5%}</style>`,
      );

      command({ type: "down", point: { x: 50, y: 50 }, scale: 1, zone: 3 });
      command({ type: "move", point: { x: 80, y: 50 } });

      expect(view.doc).toContain(`${G}25%}`);
    });

    it("ignores a command it does not know, or out of the value", async () => {
      const view = await load(RULE(`${G}2|5%`));
      const sent = states().length;

      command({ type: "what" });
      flush();
      expect(states()).toHaveLength(sent);

      view.dispatch({ selection: { anchor: 0 } });
      command({ type: "fill" });
      expect(value(view)).toBe(`${G}25%`);
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

    /** The text colored in the code, by highlight. */
    function highlights() {
      return Object.fromEntries(
        [...CSS.highlights].map(([name, { ranges }]) => [
          name,
          ranges.map(String),
        ]),
      );
    }

    it("colors the values of each group as its lines", async () => {
      await load(RULE(`${G}2|5% 9 fill/10px auto/2q`));

      expect(highlights()).toEqual({
        "cbt-border-image-slice": ["25%", "9", "fill"],
        "cbt-border-image-width": ["10px", "auto"],
        "cbt-border-image-outset": ["2q"],
      });
      const style = document.getElementById(
        "cbt-border-image-colors",
      ).textContent;
      expect(style.split("\n")).toHaveLength(3);
      expect(style).toContain(
        `::highlight(cbt-border-image-slice) { color: ${POINT_COLORS[0]};`,
      );
    });

    it("keeps its highlights while nothing changes", async () => {
      await load(RULE(`${G}2|5%`));
      const before = CSS.highlights.get("cbt-border-image-slice");

      flush();

      expect(CSS.highlights.get("cbt-border-image-slice")).toBe(before);
      expect(
        document.querySelectorAll("#cbt-border-image-colors"),
      ).toHaveLength(1);
    });

    it("colors the lines CodeMirror draws again", async () => {
      await load(RULE(`${G}2|5%`));
      document.querySelector(".cm-content").textContent = "";

      flush();

      expect(highlights()["cbt-border-image-slice"]).toEqual(["25%"]);
    });

    it("leaves out what CodeMirror cannot place, or does not draw", async () => {
      const view = createView("");
      const domAtPos = view.domAtPos.bind(view);
      view.domAtPos = (pos) => {
        if (pos === view.doc.indexOf("25%")) {
          throw new RangeError("Trying to find position for a widget");
        }
        return domAtPos(pos);
      };
      view.viewport = { from: 0, to: 80 };
      renderPage(view);
      await import("./border-image-page.js");
      setCode(view, RULE(`${G}2|5%/10px/${"9".repeat(30)}px`));
      flush();

      expect(highlights()).toEqual({ "cbt-border-image-width": ["10px"] });
    });

    it("takes the colors off with the pieces", async () => {
      const view = await load(RULE(`${G}2|5%`));
      command({ type: "draw" });
      flush();
      expect(highlights()).toEqual({});

      command({ type: "draw" });
      flush();
      setCode(view, `${RULE(`${G}25%`)}|`);
      flush();
      expect(highlights()).toEqual({});
    });

    it("colors nothing without the highlight API", async () => {
      vi.stubGlobal("Highlight", undefined);

      await load(RULE(`${G}2|5%`));

      expect(highlights()).toEqual({});
    });
  });

  describe("units", () => {
    it("writes the units only the render knows", async () => {
      const view = createView("");
      const iframe = renderPage(view);
      const renderWin = iframe.contentWindow;
      const styled = renderWin.getComputedStyle.getMockImplementation();
      // jsdom computes no length: 1lh is 20px on the probe.
      renderWin.getComputedStyle.mockImplementation((el) =>
        "CBT-PROBE" === el.tagName
          ? {
              getPropertyValue: () => "",
              get marginLeft() {
                return `${parseFloat(el.style.marginLeft) * 20}px`;
              },
            }
          : styled(el),
      );
      computed["border-image-width"] = "20px";
      await import("./border-image-page.js");
      setCode(view, RULE(`${G}2|5%/1lh`));
      flush();

      pointer("pointerdown", line("width-0"), { x: 100, y: 20 });
      pointer("pointermove", overlay(), { x: 100, y: 40 });

      expect(value(view)).toBe(`${G}25%/2lh`);
    });
  });
});
