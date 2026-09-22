/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, describe, expect, it } from "vitest";
import { createGhost, mirrorFlags, syncGhost } from "./ghost-frame";

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
});
