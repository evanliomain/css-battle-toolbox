/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { DOM_COLOR } from "../utils/dom-color";
import { HIDDEN } from "./ghost-sheet";
import { renderLabels } from "./tag-labels";

function ghostDoc(body) {
  const doc = document.implementation.createHTMLDocument("");
  doc.body.innerHTML = body;
  return doc;
}

/** jsdom lays nothing out, so every rect is zero unless a test says otherwise. */
function place(element, rect) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    ...rect,
  });
}

function labels(doc) {
  return Array.from(doc.querySelectorAll("cbt-label"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the tag labels", () => {
  it("draws the tag name at the corner of each shape", () => {
    const doc = ghostDoc("<p></p>");
    const p = doc.querySelector("p");
    place(p, { left: 10, top: 20, width: 50, height: 30 });

    renderLabels(doc, [{ element: p, depth: 2 }]);

    const [label] = labels(doc);
    expect(label.textContent).toBe("p");
    expect(label.style.getPropertyValue("--cbt-x")).toBe("14px");
    expect(label.style.getPropertyValue("--cbt-y")).toBe("24px");
    expect(label.style.getPropertyValue("--cbt-color")).toBe(DOM_COLOR[2]);
  });

  it("wraps the colour around with the depth", () => {
    const doc = ghostDoc("<p></p>");
    const p = doc.querySelector("p");
    place(p, { width: 1, height: 1 });

    renderLabels(doc, [{ element: p, depth: DOM_COLOR.length + 1 }]);

    expect(labels(doc)[0].style.getPropertyValue("--cbt-color")).toBe(
      DOM_COLOR[1],
    );
  });

  it("skips an element with no box, but keeps a flat one", () => {
    const doc = ghostDoc("<i></i><hr><b></b>");
    const [i, hr, b] = doc.body.children;
    place(i, {});
    place(hr, { width: 100 });
    place(b, { height: 8 });

    renderLabels(doc, [
      { element: i, depth: 0 },
      { element: hr, depth: 0 },
      { element: b, depth: 0 },
    ]);

    expect(labels(doc).map((label) => label.textContent)).toEqual(["hr", "b"]);
  });

  it("greys the label of a layer that is switched off", () => {
    const doc = ghostDoc("<i></i><b></b>");
    const [i, b] = doc.body.children;
    i.setAttribute(HIDDEN, "");
    place(i, { width: 1, height: 1 });
    place(b, { width: 1, height: 1 });

    renderLabels(doc, [
      { element: i, depth: 0 },
      { element: b, depth: 0 },
    ]);

    expect(labels(doc).map((label) => label.hasAttribute(HIDDEN))).toEqual([
      true,
      false,
    ]);
  });

  it("puts the layer after the body, never inside it", () => {
    const doc = ghostDoc("<p></p>");

    renderLabels(doc, []);

    // A child of body would change what the player's :last-child matches.
    expect(doc.documentElement.lastElementChild.localName).toBe("cbt-labels");
    expect(doc.body.querySelector("cbt-labels")).toBeNull();
  });
});
