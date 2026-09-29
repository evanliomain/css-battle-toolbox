/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGhost, fitOverlay, mirrorFlags, syncGhost } from "./ghost-frame";
import { OWN } from "./ghost-sheet";
import { createHiddenLayers, HIDE_SHEET_ID } from "./hidden-layers";

/** Stands in for cssbattle's output iframe: same-origin, written from code. */
function renderFrame(html) {
  const frame = document.createElement("iframe");
  document.body.insertAdjacentElement("beforeend", frame);

  const doc = frame.contentDocument;
  doc.open();
  doc.write(html);
  doc.close();

  return doc;
}

function ghostOf(realDoc) {
  const container = document.createElement("div");
  document.body.insertAdjacentElement("beforeend", container);

  const { ghostDoc } = createGhost(container, realDoc);
  return { ghostDoc, root: syncGhost(ghostDoc, realDoc) };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("the ghost frame", () => {
  it("leaves the rendered document untouched", () => {
    const realDoc = renderFrame(
      `<!doctype html><html><head><style>p{color:red}</style></head><body><p>hi</p></body></html>`,
    );
    const before = realDoc.documentElement.outerHTML;

    const { ghostDoc } = ghostOf(realDoc);
    syncGhost(ghostDoc, realDoc);

    expect(realDoc.documentElement.outerHTML).toBe(before);
  });

  it("clones the tree element for element", () => {
    const realDoc = renderFrame(
      `<!doctype html><html><body><div><p></p><span></span></div></body></html>`,
    );
    const { root } = ghostOf(realDoc);

    const names = (doc) =>
      Array.from(doc.querySelectorAll("body *"), (node) => node.localName);

    expect(names(root)).toEqual(names(realDoc));
  });

  it("keeps the doctype, so the ghost is not in quirks mode", () => {
    const realDoc = renderFrame(`<!doctype html><html><body></body></html>`);
    const { ghostDoc } = ghostOf(realDoc);

    expect(realDoc.compatMode).toBe("CSS1Compat");
    expect(ghostDoc.compatMode).toBe(realDoc.compatMode);
  });

  it("drops scripts and unframes embedded content", () => {
    const realDoc = renderFrame(
      `<!doctype html><html><body><script>window.x=1</script><iframe src="about:blank"></iframe></body></html>`,
    );
    const { root } = ghostOf(realDoc);

    expect(root.querySelector("script")).toBeNull();
    expect(root.querySelector("iframe")).not.toBeNull();
    expect(root.querySelector("iframe").hasAttribute("src")).toBe(false);
  });

  it("keeps the index of a script's siblings", () => {
    const realDoc = renderFrame(
      `<!doctype html><html><body><i></i><script>window.x=1</script><b></b></body></html>`,
    );
    const { root } = ghostOf(realDoc);

    // Removing the script outright would move <b> from the third child to the
    // second, and every :nth-child the player wrote past it would shift.
    const index = (doc) =>
      Array.from(doc.querySelector("body").children).indexOf(
        doc.querySelector("b"),
      );

    expect(index(root)).toBe(index(realDoc));
  });

  it("keeps replaced elements, which carry the layout's intrinsic size", () => {
    const realDoc = renderFrame(
      `<!doctype html><html><body><img src="shape.png"><canvas></canvas></body></html>`,
    );
    const { root } = ghostOf(realDoc);

    expect(root.querySelector("img")?.getAttribute("src")).toBe("shape.png");
    expect(root.querySelector("canvas")).not.toBeNull();
  });

  it("bases relative urls on the rendered document", () => {
    const realDoc = renderFrame(`<!doctype html><html><body></body></html>`);
    const { root } = ghostOf(realDoc);

    const base = root.querySelector("head > :first-child");
    expect(base?.localName).toBe("base");
    expect(base?.getAttribute("href")).toBe(realDoc.baseURI);
  });

  it("marks every node it adds to the head as its own", () => {
    const realDoc = renderFrame(
      `<!doctype html><html><head></head><body></body></html>`,
    );
    const { root } = ghostOf(realDoc);
    const injected = Array.from(root.querySelectorAll("head > *"));

    // The sheet hides them on that mark alone: a player who writes
    // head,style{display:block} must see their own code, never the tool's.
    expect(injected.length).toBeGreaterThan(0);
    expect(injected.every((node) => node.hasAttribute(OWN))).toBe(true);
  });

  it("carries the display flags onto the ghost root", () => {
    const realDoc = renderFrame(`<!doctype html><html><body></body></html>`);
    const { root } = ghostOf(realDoc);

    const targetContainer = document.createElement("div");
    targetContainer.className = "target-container display-outline";

    mirrorFlags(root, targetContainer);
    expect(root.hasAttribute("data-cbt-outline")).toBe(true);
    expect(root.hasAttribute("data-cbt-background")).toBe(false);

    targetContainer.classList.remove("display-outline");
    mirrorFlags(root, targetContainer);
    expect(root.hasAttribute("data-cbt-outline")).toBe(false);
  });

  it("stays in quirks mode when the render is", () => {
    const realDoc = renderFrame(`<html><body></body></html>`);
    const { ghostDoc } = ghostOf(realDoc);

    expect(realDoc.compatMode).toBe("BackCompat");
    expect(ghostDoc.compatMode).toBe("BackCompat");
  });

  it("gives the clone a head when the render has none", () => {
    const realDoc = renderFrame(`<!doctype html><html><body></body></html>`);
    realDoc.head.remove();
    const { root } = ghostOf(realDoc);

    expect(root.firstElementChild.localName).toBe("head");
    expect(root.querySelector("head > base")).not.toBeNull();
    // The render itself is left as it was.
    expect(realDoc.head).toBeNull();
  });

  it("copies the sheets the render adopted, but not the hide sheet", () => {
    const realDoc = renderFrame(`<!doctype html><html><body></body></html>`);
    const player = new realDoc.defaultView.CSSStyleSheet();
    player.replaceSync("p { color: red; }");
    realDoc.adoptedStyleSheets = [player];

    const hidden = createHiddenLayers(
      realDoc.defaultView.frameElement,
      realDoc,
    );
    hidden.toggle(":root");
    hidden.apply();
    expect(realDoc.adoptedStyleSheets).toHaveLength(2);

    const { root } = ghostOf(realDoc);
    const adopted = root.querySelector(`head > style[${OWN}]:not([id])`);

    expect(adopted.textContent).toBe("p { color: red; }");
    expect(root.outerHTML).not.toContain("opacity: 0");
  });

  it("adds no style for adopted sheets when there are only its own", () => {
    const realDoc = renderFrame(`<!doctype html><html><body></body></html>`);
    const hidden = createHiddenLayers(
      realDoc.defaultView.frameElement,
      realDoc,
    );
    hidden.toggle(":root");
    hidden.apply();

    const { root } = ghostOf(realDoc);

    expect(root.querySelectorAll("head > style")).toHaveLength(1);
  });

  it("leaves the fallback hide element out of the clone", () => {
    const realDoc = renderFrame(
      `<!doctype html><html><head><style id="${HIDE_SHEET_ID}">p{opacity:0}</style></head><body></body></html>`,
    );
    const { root } = ghostOf(realDoc);

    expect(root.querySelector(`#${HIDE_SHEET_ID}`)).toBeNull();
    expect(realDoc.getElementById(HIDE_SHEET_ID)).not.toBeNull();
  });

  it("strips every source from framed content", () => {
    const realDoc = renderFrame(
      `<!doctype html><html><body><iframe srcdoc="<p>"></iframe><object data="a.svg"></object><embed src="b.swf"></body></html>`,
    );
    const { root } = ghostOf(realDoc);

    root.querySelectorAll("iframe,object,embed").forEach((embedded) => {
      expect(embedded.getAttributeNames()).toEqual([]);
    });
  });

  it("restarts every animation at the phase of the render", () => {
    const realDoc = renderFrame(
      `<!doctype html><html><body><p></p><i></i></body></html>`,
    );
    const container = document.createElement("div");
    document.body.insertAdjacentElement("beforeend", container);
    const { ghostDoc } = createGhost(container, realDoc);

    // jsdom runs no animation, so each document answers with fakes: the render
    // has two running on <p>, the fresh clone only restarted one of them.
    const ghostAnimation = { currentTime: 0 };
    realDoc.defaultView.Element.prototype.getAnimations = function () {
      return "p" === this.localName
        ? [{ currentTime: 1250 }, { currentTime: 40 }]
        : [];
    };
    ghostDoc.defaultView.Element.prototype.getAnimations = function () {
      return "p" === this.localName ? [ghostAnimation] : [];
    };

    syncGhost(ghostDoc, realDoc);

    expect(ghostAnimation.currentTime).toBe(1250);
  });

  it("carries the scroll position over", () => {
    const realDoc = renderFrame(`<!doctype html><html><body></body></html>`);
    const container = document.createElement("div");
    document.body.insertAdjacentElement("beforeend", container);
    const { ghostDoc } = createGhost(container, realDoc);

    // jsdom defines no scrolling element.
    const target = { scrollTop: 0, scrollLeft: 0 };
    Object.defineProperty(realDoc, "scrollingElement", {
      configurable: true,
      value: { scrollTop: 30, scrollLeft: 12 },
    });
    Object.defineProperty(ghostDoc, "scrollingElement", {
      configurable: true,
      value: target,
    });

    syncGhost(ghostDoc, realDoc);

    expect(target).toEqual({ scrollTop: 30, scrollLeft: 12 });
  });

  it("skips the scroll when only the render can scroll", () => {
    const realDoc = renderFrame(`<!doctype html><html><body></body></html>`);
    Object.defineProperty(realDoc, "scrollingElement", {
      configurable: true,
      value: { scrollTop: 30, scrollLeft: 12 },
    });

    expect(() => ghostOf(realDoc)).not.toThrow();
  });
});

describe("the overlay size", () => {
  function overlay() {
    return document.createElement("div");
  }

  it("matches the viewport of the render", () => {
    const box = overlay();

    fitOverlay(box, {
      clientWidth: 400,
      clientHeight: 300,
      offsetWidth: 404,
      offsetHeight: 304,
    });

    expect(box.style.width).toBe("400px");
    expect(box.style.height).toBe("300px");
  });

  it("falls back on the offset size of an inline iframe", () => {
    const box = overlay();

    fitOverlay(box, {
      clientWidth: 0,
      clientHeight: 0,
      offsetWidth: 400,
      offsetHeight: 300,
    });

    expect(box.style.width).toBe("400px");
    expect(box.style.height).toBe("300px");
  });

  it("says so when the render has no size at all", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const box = overlay();

    fitOverlay(box, document.createElement("iframe"));

    expect(debug).toHaveBeenCalledWith(
      "[cbt] dom-tools: the render has no size, ghost left empty",
    );
    expect(box.style.width).toBe("0px");
    expect(box.style.height).toBe("0px");
  });

  it("says so when only one side is empty", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

    fitOverlay(overlay(), {
      clientWidth: 400,
      clientHeight: 0,
      offsetWidth: 400,
      offsetHeight: 0,
    });

    expect(debug).toHaveBeenCalledOnce();
  });
});
