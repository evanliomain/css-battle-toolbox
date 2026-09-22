/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHiddenLayers,
  hideCss,
  HIDE_SHEET_ID,
  isHideSheet,
} from "./hidden-layers";

/** Stands in for cssbattle's output iframe: same-origin, written from code. */
function renderFrame(body = "<div></div><div></div>") {
  const frame = document.createElement("iframe");
  document.body.insertAdjacentElement("beforeend", frame);

  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head></head><body>${body}</body></html>`);
  doc.close();

  return { frame, doc };
}

/** jsdom has no adoptedStyleSheets of its own, so an absent one means none. */
function adopted(doc) {
  return doc.adoptedStyleSheets ?? [];
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("the hide stylesheet", () => {
  it("is empty when no layer is off", () => {
    expect(hideCss([])).toBe("");
  });

  it("switches a layer off with opacity, never with display", () => {
    const css = hideCss([":root>:nth-child(2)>:nth-child(1)"]);

    expect(css).toContain(":root>:nth-child(2)>:nth-child(1)");
    expect(css).toContain("opacity: 0 !important");
    // display would reflow the siblings, and the ghost would stop matching.
    expect(css).not.toContain("display");
  });

  it("lives in a layer, so it beats an !important the player wrote", () => {
    expect(hideCss([":root"])).toContain("@layer cbt");
  });

  it("carries one rule per hidden layer", () => {
    const css = hideCss([":root", ":root>:nth-child(2)"]);

    expect(css.match(/opacity: 0 !important/g)).toHaveLength(2);
  });
});

describe("the hidden layers of a render", () => {
  it("attaches nothing while no layer is off", () => {
    const { frame, doc } = renderFrame();
    const hidden = createHiddenLayers(frame, doc);
    const before = doc.documentElement.outerHTML;

    hidden.apply();

    expect(adopted(doc)).toHaveLength(0);
    expect(doc.documentElement.outerHTML).toBe(before);
  });

  it("adopts a sheet into the render when a layer goes off", () => {
    const { frame, doc } = renderFrame();
    const hidden = createHiddenLayers(frame, doc);
    const before = doc.documentElement.outerHTML;

    hidden.toggle(":root>:nth-child(2)>:nth-child(1)");
    hidden.apply();

    expect(adopted(doc)).toHaveLength(1);
    expect(adopted(doc)[0].cssRules[0].cssText).toContain("opacity: 0");
    // Adopted, not appended: not one node of the player's document moves.
    expect(doc.documentElement.outerHTML).toBe(before);
  });

  it("gives the render back untouched when the layer comes back", () => {
    const { frame, doc } = renderFrame();
    const hidden = createHiddenLayers(frame, doc);
    const before = doc.documentElement.outerHTML;

    hidden.toggle(":root>:nth-child(2)");
    hidden.apply();
    hidden.toggle(":root>:nth-child(2)");
    hidden.apply();

    expect(adopted(doc)).toHaveLength(0);
    expect(doc.documentElement.outerHTML).toBe(before);
  });

  it("writes nothing when nothing changed", () => {
    const { frame, doc } = renderFrame();
    const replaceSync = vi.spyOn(
      frame.contentWindow.CSSStyleSheet.prototype,
      "replaceSync",
    );
    const hidden = createHiddenLayers(frame, doc);

    hidden.toggle(":root>:nth-child(2)");
    hidden.apply();
    const attached = adopted(doc);

    hidden.apply();
    hidden.apply();

    expect(replaceSync).toHaveBeenCalledTimes(1);
    expect(adopted(doc)).toBe(attached);
  });

  it("re-adopts after the render has been rebuilt under it", () => {
    const { frame, doc } = renderFrame();
    const hidden = createHiddenLayers(frame, doc);

    hidden.toggle(":root>:nth-child(2)");
    hidden.apply();

    // What a keystroke does: cssbattle rewrites the render and takes whatever
    // was attached with it.
    doc.adoptedStyleSheets = [];
    hidden.apply();

    expect(adopted(doc)).toHaveLength(1);
  });

  it("forgets a layer whose path no longer matches anything", () => {
    const { frame, doc } = renderFrame();
    const hidden = createHiddenLayers(frame, doc);

    hidden.toggle(":root>:nth-child(2)>:nth-child(1)");
    hidden.toggle(":root>:nth-child(2)>:nth-child(2)");
    hidden.prune(new Set([":root>:nth-child(2)>:nth-child(1)"]));

    expect(hidden.size).toBe(1);
    expect(hidden.has(":root>:nth-child(2)>:nth-child(1)")).toBe(true);
    expect(hidden.has(":root>:nth-child(2)>:nth-child(2)")).toBe(false);
  });

  it("clears everything at once", () => {
    const { frame, doc } = renderFrame();
    const hidden = createHiddenLayers(frame, doc);

    hidden.toggle(":root");
    hidden.toggle(":root>:nth-child(2)");
    hidden.clear();
    hidden.apply();

    expect(hidden.size).toBe(0);
    expect(adopted(doc)).toHaveLength(0);
  });

  it("detaches on dispose, so a layer cannot outlive the mount", () => {
    const { frame, doc } = renderFrame();
    const hidden = createHiddenLayers(frame, doc);

    hidden.toggle(":root>:nth-child(2)");
    hidden.apply();
    hidden.dispose();

    expect(adopted(doc)).toHaveLength(0);
  });

  it("marks its own sheets, so the ghost can leave them out", () => {
    const { frame, doc } = renderFrame();
    const hidden = createHiddenLayers(frame, doc);

    hidden.toggle(":root");
    hidden.apply();

    expect(isHideSheet(adopted(doc)[0])).toBe(true);
    expect(isHideSheet(new frame.contentWindow.CSSStyleSheet())).toBe(false);
  });

  it("falls back to a style element where a sheet cannot be constructed", () => {
    const { doc } = renderFrame();
    // No CSSStyleSheet in the render's realm: some engines, and older Chromes.
    const hidden = createHiddenLayers({ contentWindow: {} }, doc);

    hidden.toggle(":root>:nth-child(2)");
    hidden.apply();

    const style = doc.getElementById(HIDE_SHEET_ID);
    expect(style?.textContent).toContain("opacity: 0 !important");
    // Still nothing on the player's own nodes.
    expect(doc.body.getAttributeNames()).toEqual([]);

    hidden.dispose();
    expect(doc.getElementById(HIDE_SHEET_ID)).toBeNull();
  });
});
