/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Just enough of CodeMirror for the page script: the classes it reaches
 * through the view, a languageData facet, and a reconfigure that drops what
 * was appended, as `StateEffect.reconfigure` does. `site` stands for the
 * site's own language data, which `languageDataAt` returns ahead of the facet.
 */
function createView(doc = "", { site = [] } = {}) {
  class StateEffect {
    static appendConfig = { of: (extension) => ({ append: extension }) };
  }
  class EditorState {
    static languageData = { of: (provider) => ({ provider }) };
    constructor(providers, doc) {
      this.providers = providers;
      this.doc = doc;
    }
    facet(facet) {
      return facet === EditorState.languageData ? this.providers : [];
    }
    languageDataAt(name) {
      return [
        ...site.map((data) => data[name]),
        ...this.providers.flatMap((provider) =>
          provider().map((data) => data[name]),
        ),
      ].filter(Boolean);
    }
    sliceDoc(from, to) {
      return this.doc.slice(from, to);
    }
  }
  class EditorView {
    static scrollIntoView() {
      return new StateEffect();
    }
    state = new EditorState([], doc);
    dispatch({ effects, reconfigure, insert = "" }) {
      let providers = reconfigure ? [] : this.state.providers;
      if (effects) {
        providers = [...providers, effects.append.provider];
      }
      this.state = new EditorState(providers, this.state.doc + insert);
    }
  }
  return new EditorView();
}

function renderEditor(view) {
  document.body.innerHTML = `
    <div class="colors-list">
      <div class="colors-list__color">#1A4341</div>
      <div class="colors-list__color">#F3AC3C</div>
    </div>
    <div class="cm-editor"><div class="cm-content" contenteditable="true"></div></div>`;
  // jsdom has no innerText.
  document.querySelectorAll(".colors-list__color").forEach((node) => {
    node.innerText = ` ${node.textContent} `;
  });
  // Where CodeMirror hangs its view, as EditorView.findFromDOM reads it.
  document.querySelector(".cm-content").cmView = { rootView: { view } };
}

/** Asks the completion sources for the end of the document. */
function complete(view, { explicit = false } = {}) {
  return view.state
    .languageDataAt("autocomplete")
    .map((source) => source(contextAt(view, { explicit })));
}

function contextAt(view, { explicit = false } = {}) {
  const { doc } = view.state;
  return {
    state: view.state,
    pos: doc.length,
    explicit,
    matchBefore(expr) {
      const text = doc.slice(0, this.pos);
      const from = text.search(expr);
      return { from, to: this.pos, text: text.slice(from) };
    },
  };
}

function attachEvent() {
  document.dispatchEvent(new CustomEvent("cbt-snippet-attach"));
}

describe("snippet-page", () => {
  let documentListeners;

  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    documentListeners = vi.spyOn(document, "addEventListener");
  });

  afterEach(() => {
    // The document outlives the module: unbind the previous load's listener.
    documentListeners.mock.calls.forEach(([type, handler]) =>
      document.removeEventListener(type, handler),
    );
    vi.restoreAllMocks();
    document.body.innerHTML = "";
    document.body.className = "";
    window.history.replaceState({}, "", "/play/123");
  });

  describe("attach", () => {
    it("adds the completions to the editor once loaded", async () => {
      const view = createView();
      renderEditor(view);

      await import("./snippet-page.js");

      expect(view.state.providers).toHaveLength(1);
    });

    it("adds them only once per editor", async () => {
      const view = createView();
      renderEditor(view);

      await import("./snippet-page.js");
      attachEvent();
      attachEvent();

      expect(view.state.providers).toHaveLength(1);
    });

    it("wraps the editor's dispatch only once", async () => {
      const view = createView();
      renderEditor(view);

      await import("./snippet-page.js");
      const dispatch = view.dispatch;
      attachEvent();

      expect(view.dispatch).toBe(dispatch);
    });

    it("adds them back when the site reconfigures the editor", async () => {
      const view = createView();
      renderEditor(view);

      await import("./snippet-page.js");
      view.dispatch({ reconfigure: true });

      expect(view.state.providers).toHaveLength(1);
    });

    it("keeps the editor's own transactions", async () => {
      const view = createView("<p>");
      renderEditor(view);

      await import("./snippet-page.js");
      view.dispatch({ insert: "</p>" });

      expect(view.state.doc).toBe("<p></p>");
      expect(view.state.providers).toHaveLength(1);
    });

    it("reaches the editor of the next battle", async () => {
      renderEditor(createView());
      await import("./snippet-page.js");

      const next = createView();
      renderEditor(next);
      attachEvent();

      expect(next.state.providers).toHaveLength(1);
    });

    it("waits for an editor to be there", async () => {
      document.body.innerHTML = `<div class="cm-content"></div>`;

      await import("./snippet-page.js");

      expect(console.debug).toHaveBeenCalledWith(
        "[cbt] snippet tool: no CodeMirror view found",
      );
      const view = createView();
      renderEditor(view);
      attachEvent();
      expect(view.state.providers).toHaveLength(1);
    });

    it("skips a CodeMirror node without its view", async () => {
      document.body.innerHTML = `<div class="cm-content"></div>`;
      document.querySelector(".cm-content").cmView = {};

      await import("./snippet-page.js");

      expect(console.debug).toHaveBeenCalledWith(
        "[cbt] snippet tool: no CodeMirror view found",
      );
    });

    it("does nothing without any editor", async () => {
      await import("./snippet-page.js");

      expect(console.debug).toHaveBeenCalledWith(
        "[cbt] snippet tool: no CodeMirror view found",
      );
    });
  });

  describe("completions", () => {
    async function completeAfter(code, options) {
      const view = createView(code);
      renderEditor(view);
      await import("./snippet-page.js");
      return complete(view, options)[0];
    }

    it("offers the target colors and transparent", async () => {
      const result = await completeAfter("<style>p{color:#");

      expect(result.options.map(({ label }) => label)).toEqual([
        "#1A4341",
        "#F3AC3C",
        "transparent",
      ]);
    });

    it("replaces the word being typed", async () => {
      const result = await completeAfter("<style>p{color:tr");

      expect(result.from).toBe(15);
      expect(result.validFor.test("#1a")).toBe(true);
      expect(result.validFor.test("transp")).toBe(true);
      expect(result.validFor.test("a b")).toBe(false);
    });

    it("shows each color's swatch, ahead of the site's suggestions", async () => {
      const result = await completeAfter("<style>p{color:#");

      expect(result.options[0]).toEqual({
        label: "#1A4341",
        detail: "target",
        type: "cbt-color cbt-color-1a4341",
        boost: 99,
      });
      expect(result.options[2].type).toBe("cbt-color cbt-color-transparent");
    });

    it("waits for a first letter", async () => {
      expect(await completeAfter("<style>p{color:")).toBeNull();
    });

    it("answers Ctrl+Space before any letter", async () => {
      const result = await completeAfter("<style>p{color:", { explicit: true });

      expect(result.options).toHaveLength(3);
    });

    it("offers nothing where CSS takes no color", async () => {
      expect(await completeAfter("<style>p{width:#")).toBeNull();
    });

    it("offers nothing once the option is off", async () => {
      // The class options-effect.js sets from the stored options.
      document.body.classList.add("hideSnippet");

      expect(await completeAfter("<style>p{color:#")).toBeNull();
    });

    it("offers nothing outside a battle", async () => {
      window.history.replaceState({}, "", "/leaderboard");

      expect(await completeAfter("<style>p{color:#")).toBeNull();
    });
  });

  describe("values", () => {
    async function completeAfter(code, options) {
      const view = createView(code);
      renderEditor(view);
      await import("./snippet-page.js");
      return complete(view, options)[1];
    }

    const labels = (result) => result.options.map(({ label }) => label);

    it("offers the values valid there", async () => {
      const result = await completeAfter("<style>p{corner-shape:s");

      expect(labels(result)).toEqual([
        "round",
        "scoop",
        "bevel",
        "notch",
        "square",
        "squircle",
        "superellipse()",
      ]);
    });

    it("puts the shape functions of clip-path first", async () => {
      const result = await completeAfter("<style>p{clip-path:c");

      expect(result.options[0]).toMatchObject({
        label: "circle()",
        type: "function",
        boost: 50,
      });
      expect(result.options.find(({ label }) => "none" === label)).toEqual({
        label: "none",
        type: "keyword",
      });
    });

    it("replaces the word being typed", async () => {
      const result = await completeAfter("<style>p{clip-path:ci");

      expect(result.from).toBe(19);
      expect(result.validFor.test("closest-side")).toBe(true);
      expect(result.validFor.test("a b")).toBe(false);
    });

    it("puts the caret between the parentheses of a function", async () => {
      const result = await completeAfter("<style>p{clip-path:ci");
      const circle = result.options.find(({ label }) => "circle()" === label);
      const view = { dispatch: vi.fn() };

      circle.apply(view, circle, 19, 21);

      expect(view.dispatch).toHaveBeenCalledWith({
        changes: { from: 19, to: 21, insert: "circle()" },
        selection: { anchor: 26 },
        userEvent: "input.complete",
      });
    });

    it("waits for a first letter", async () => {
      expect(await completeAfter("<style>p{clip-path:")).toBeNull();
    });

    it("answers Ctrl+Space before any letter", async () => {
      const result = await completeAfter("<style>p{clip-path:circle(", {
        explicit: true,
      });

      expect(labels(result)).toEqual([
        "closest-side",
        "farthest-side",
        "var()",
        "attr()",
        "calc()",
        "min()",
        "max()",
        "clamp()",
        "at",
      ]);
    });

    it("offers nothing where the value is complete", async () => {
      expect(
        await completeAfter("<style>p{clip-path:none ", { explicit: true }),
      ).toBeNull();
    });

    it("offers nothing for another property", async () => {
      expect(await completeAfter("<style>p{position:a")).toBeNull();
    });

    it("offers nothing once the option is off", async () => {
      document.body.classList.add("hideSnippet");

      expect(await completeAfter("<style>p{clip-path:c")).toBeNull();
    });

    it("offers nothing outside a battle", async () => {
      window.history.replaceState({}, "", "/leaderboard");

      expect(await completeAfter("<style>p{clip-path:c")).toBeNull();
    });
  });

  describe("the site's completion", () => {
    const SITE = { label: "above" };
    let site;

    beforeEach(() => {
      site = vi.fn(() => SITE);
    });

    async function siteAfter(code) {
      const view = createView(code, { site: [{ autocomplete: site }] });
      renderEditor(view);
      await import("./snippet-page.js");
      return complete(view, { explicit: true })[0];
    }

    it.each([
      ["clip-path", "<style>p{clip-path:a"],
      ["corner-shape", "<style>p{corner-shape:"],
      ["-webkit-box-reflect", "<style>p{-webkit-box-reflect:"],
      ["padding", "<style>p{padding:a"],
      ["font", "<style>p{font:a"],
      ["a gradient", "<style>p{background:radial-gradient("],
      ["a complete value", "<style>p{clip-path:none "],
    ])("stays quiet in %s", async (_, code) => {
      expect(await siteAfter(code)).toBeNull();
      expect(site).not.toHaveBeenCalled();
    });

    it.each([
      ["another property", "<style>p{position:a"],
      ["the name of a variable", "<style>p{clip-path:var("],
    ])("still answers in %s", async (_, code) => {
      expect(await siteAfter(code)).toBe(SITE);
      expect(site).toHaveBeenCalledOnce();
    });

    it("still answers once the option is off", async () => {
      document.body.classList.add("hideSnippet");

      expect(await siteAfter("<style>p{clip-path:a")).toBe(SITE);
    });

    it("still answers outside a battle", async () => {
      window.history.replaceState({}, "", "/leaderboard");

      expect(await siteAfter("<style>p{clip-path:a")).toBe(SITE);
    });

    it("is the same source from one update to the next", async () => {
      const view = createView("", { site: [{ autocomplete: site }] });
      renderEditor(view);
      await import("./snippet-page.js");

      const [first] = view.state.languageDataAt("autocomplete");
      const [again] = view.state.languageDataAt("autocomplete");

      expect(first).not.toBe(site);
      expect(again).toBe(first);
    });

    it("keeps our own sources and the other language data", async () => {
      const list = ["a", "b"];
      const wordChars = () => "-";
      const view = createView("", {
        site: [{ autocomplete: list, wordChars }],
      });
      renderEditor(view);
      await import("./snippet-page.js");

      const [data, ...ours] = view.state.languageDataAt("autocomplete");

      expect(data).toBe(list);
      expect(ours.map(({ name }) => name)).toEqual([
        "completeColors",
        "completeValues",
      ]);
      expect(view.state.languageDataAt("wordChars")).toEqual([wordChars]);
    });

    it("is muted once for every editor of the site", async () => {
      const view = createView("", { site: [{ autocomplete: site }] });
      renderEditor(view);
      await import("./snippet-page.js");
      const [first] = view.state.languageDataAt("autocomplete");

      // The next battle's editor, from the same CodeMirror bundle.
      const next = new view.constructor();
      document.querySelector(".cm-content").cmView = {
        rootView: { view: next },
      };
      attachEvent();

      expect(next.state.providers).toHaveLength(1);
      expect(next.state.languageDataAt("autocomplete")[0]).toBe(first);
    });
  });
});
