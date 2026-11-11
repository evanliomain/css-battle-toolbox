/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { findView, keepFacet } from "./cm-view";

/** A facet, a view and a reconfigure that drops what was appended. */
function createView() {
  const facet = { of: (value) => ({ value }) };
  class StateEffect {
    static appendConfig = { of: (extension) => ({ append: extension }) };
  }
  class EditorView {
    static scrollIntoView() {
      return new StateEffect();
    }
    values = [];
    state = { facet: () => this.values };
    log = [];
    dispatch(spec) {
      this.log.push(spec);
      if (spec.reconfigure) {
        this.values = [];
      }
      if (spec.effects) {
        this.values = [...this.values, spec.effects.append.value];
      }
    }
  }
  return { facet, view: new EditorView() };
}

describe("findView", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("reads the view CodeMirror hangs on its content", () => {
    document.body.innerHTML = `<div class="cm-content"></div>`;
    const view = {};
    document.querySelector(".cm-content").cmView = { rootView: { view } };

    expect(findView()).toBe(view);
  });

  it("is null without an editor", () => {
    expect(findView()).toBeNull();
  });
});

describe("keepFacet", () => {
  it("adds the value to the editor", () => {
    const { facet, view } = createView();

    expect(keepFacet(view, facet, "a")).toBe(true);

    expect(view.values).toEqual(["a"]);
  });

  it("adds it only once", () => {
    const { facet, view } = createView();
    keepFacet(view, facet, "a");
    const dispatch = view.dispatch;

    expect(keepFacet(view, facet, "a")).toBe(false);

    expect(view.dispatch).toBe(dispatch);
    expect(view.values).toEqual(["a"]);
  });

  it("adds it back when the site reconfigures the editor", () => {
    const { facet, view } = createView();
    keepFacet(view, facet, "a");

    view.dispatch({ reconfigure: true });

    expect(view.values).toEqual(["a"]);
  });

  it("keeps several values, each on its own", () => {
    const { facet, view } = createView();
    keepFacet(view, facet, "a");
    keepFacet(view, facet, "b");

    view.dispatch({ reconfigure: true });

    expect(view.values.sort()).toEqual(["a", "b"]);
  });
});
