import { BACKGROUND_FLAG, ghostCss, OUTLINE_FLAG } from "./ghost-sheet";

const SHEET_ID = "cbt-ghost-sheet";

/**
 * Creates the iframe the outlines are drawn in.
 *
 * `container` must already be connected: an iframe only exposes its
 * `contentDocument` once it is in the page, and that document is available
 * synchronously — no `load` to wait for.
 */
export function createGhost(container, realDoc) {
  const frame = document.createElement("iframe");
  frame.id = "dom-ghost";
  frame.className = "cbt-ghost";
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  // A default <iframe> carries `border: 2px inset` from the UA sheet, which
  // shifts the embedded viewport by 2px and shrinks it by 4 — enough on its own
  // to throw every outline off.
  //
  // color-scheme is the one that decides whether the render shows through: an
  // iframe canvas is transparent only while the embedded document's used
  // color-scheme matches the embedding element's. cssbattle's root is dark, so
  // an element left to inherit it would disagree with the about:blank document
  // and Chrome would paint an opaque canvas over the whole preview. Both sides
  // are pinned to `normal` — here, and on the ghost root in ghostCss.
  frame.style.cssText =
    "border:0;margin:0;padding:0;display:block;width:100%;height:100%;background:transparent;color-scheme:normal;pointer-events:none";
  container.insertAdjacentElement("beforeend", frame);

  const ghostDoc = frame.contentDocument;
  // A fresh about:blank has no doctype, so it renders in quirks mode, where
  // percentage heights and body sizing differ — the clone would stop laying out
  // like the render it copies. Writing the document is the only way to give it
  // one, and it happens synchronously.
  ghostDoc.open();
  ghostDoc.write(
    "CSS1Compat" === realDoc.compatMode
      ? "<!doctype html><html><head></head><body></body></html>"
      : "<html><head></head><body></body></html>",
  );
  ghostDoc.close();

  return { frame, ghostDoc };
}

/**
 * Replaces the ghost document with a fresh clone of the render.
 *
 * Cloning the whole document — structure and <style> alike — is what lets the
 * browser redo the layout and apply every transform itself. Rebuilding boxes by
 * hand could never reproduce a transform inherited from an ancestor.
 *
 * @returns {Element} the new ghost `documentElement`
 */
export function syncGhost(ghostDoc, realDoc) {
  const root = ghostDoc.importNode(realDoc.documentElement, true);
  // Paired before anything is added or removed, while the two trees are still
  // structurally identical.
  const pairs = pairElements(realDoc.documentElement, root);

  sanitize(root, ghostDoc, realDoc);
  ghostDoc.replaceChild(root, ghostDoc.documentElement);

  copyAnimations(pairs);
  copyScroll(ghostDoc, realDoc);

  return root;
}

/** Mirrors the host classes that drive the two display modes. */
export function mirrorFlags(ghostRoot, targetContainer) {
  ghostRoot.toggleAttribute(
    OUTLINE_FLAG,
    targetContainer.classList.contains("display-outline"),
  );
  ghostRoot.toggleAttribute(
    BACKGROUND_FLAG,
    targetContainer.classList.contains("display-background"),
  );
}

/**
 * Sizes the overlay on the render's own viewport.
 *
 * Not on its container: player code is full of vw/vh units, so a viewport off by
 * a pixel moves every shape in the clone.
 */
export function fitOverlay(overlay, realFrame) {
  // clientWidth is specified to return zero for an inline-level box, and an
  // iframe is inline by default. Blink answers with the content box anyway, but
  // a zero here would size the ghost out of existence, so offsetWidth backs it.
  const width = realFrame.clientWidth || realFrame.offsetWidth;
  const height = realFrame.clientHeight || realFrame.offsetHeight;

  if (0 === width || 0 === height) {
    console.debug("[cbt] dom-tools: the render has no size, ghost left empty");
  }

  overlay.style.width = `${width}px`;
  overlay.style.height = `${height}px`;
}

function sanitize(root, ghostDoc, realDoc) {
  // A script only runs once inserted into a document with a browsing context, so
  // stripping them while the tree is still detached can never let one fire.
  root.querySelectorAll("script").forEach((script) => script.remove());

  // Replaced elements stay: <img>, <video> and <canvas> carry an intrinsic size
  // that feeds the layout. Only the framed ones lose their source — their box
  // comes from CSS, never from what they load.
  root.querySelectorAll("iframe,object,embed").forEach((embedded) => {
    embedded.removeAttribute("src");
    embedded.removeAttribute("srcdoc");
    embedded.removeAttribute("data");
  });

  const head =
    root.querySelector("head") ??
    root.insertBefore(ghostDoc.createElement("head"), root.firstChild);

  // about:blank resolves relative URLs against itself, so an <img src="x.png">
  // would 404 in the ghost and lose the intrinsic size that sizes its box.
  const base = ghostDoc.createElement("base");
  base.href = realDoc.baseURI;
  head.insertAdjacentElement("afterbegin", base);

  // A sheet built through CSSOM has no matching text in the DOM, so the clone
  // would lay out without it.
  if (0 < (realDoc.adoptedStyleSheets?.length ?? 0)) {
    const adopted = ghostDoc.createElement("style");
    adopted.textContent = realDoc.adoptedStyleSheets
      .flatMap((sheet) => Array.from(sheet.cssRules, (rule) => rule.cssText))
      .join("\n");
    head.insertAdjacentElement("beforeend", adopted);
  }

  const sheet = ghostDoc.createElement("style");
  sheet.id = SHEET_ID;
  sheet.textContent = ghostCss();
  head.insertAdjacentElement("beforeend", sheet);
}

function pairElements(realRoot, ghostRoot) {
  const reals = [realRoot, ...realRoot.querySelectorAll("*")];
  const ghosts = [ghostRoot, ...ghostRoot.querySelectorAll("*")];

  return reals.map((real, index) => [real, ghosts[index]]);
}

function copyAnimations(pairs) {
  // Replacing documentElement restarts every animation at zero, so an infinite
  // one would run a fixed phase ahead of the real render, for good. Both
  // documents share one clock, so a phase copied once does not drift.
  if ("function" !== typeof pairs[0]?.[0]?.getAnimations) {
    return;
  }

  pairs.forEach(([real, ghost]) => {
    if (undefined === ghost) {
      return;
    }
    const sources = real.getAnimations();
    const targets = ghost.getAnimations();
    sources.forEach((source, index) => {
      if (undefined !== targets[index]) {
        targets[index].currentTime = source.currentTime;
      }
    });
  });
}

function copyScroll(ghostDoc, realDoc) {
  // A document with no rendered root has no scrolling element at all, and jsdom
  // never defines one.
  const from = realDoc.scrollingElement ?? null;
  const to = ghostDoc.scrollingElement ?? null;
  if (null === from || null === to) {
    return;
  }
  to.scrollTop = from.scrollTop;
  to.scrollLeft = from.scrollLeft;
}
