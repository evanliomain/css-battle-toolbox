/** Id of the fallback style element, so the ghost can drop it from the clone. */
export const HIDE_SHEET_ID = "cbt-hidden";

/** The sheets this module owns, so the ghost can leave them out of the clone. */
const OWNED = new WeakSet();

/** True for a stylesheet this module adopted into the rendered document. */
export function isHideSheet(sheet) {
  return OWNED.has(sheet);
}

/**
 * The stylesheet that switches the given layers off, or "" when none are.
 *
 * `opacity` rather than `display: none`, which would reflow: the siblings of a
 * hidden layer would move and the render under study would no longer be the one
 * being debugged. Every box stays exactly where it was — which is also what lets
 * the ghost keep drawing the contour of a layer that is off, since both
 * documents still lay out the same.
 *
 * Unlike `visibility: hidden`, no descendant can declare its way back out: an
 * element with `opacity: 0` paints its whole subtree as one transparent group.
 *
 * In a cascade layer on purpose. For `!important` declarations the layer order
 * is reversed and unlayered styles are the weakest, so this beats an
 * `!important` the player wrote — which a plain rule could not.
 *
 * @param {string[]} paths Selector paths, as built while walking the tree.
 */
export function hideCss(paths) {
  if (0 === paths.length) {
    return "";
  }

  const rules = paths
    .map((path) => `  ${path} { opacity: 0 !important; }`)
    .join("\n");

  return `@layer cbt {\n${rules}\n}`;
}

/**
 * Holds the layers the user switched off, and keeps the rendered document in
 * step with them.
 *
 * This is the one place the tool writes to the player's render, and it only
 * does so while at least one layer is off: with an empty set nothing is
 * attached at all, and the read-only contract holds exactly as before.
 *
 * @param {HTMLIFrameElement} frame The render's iframe.
 * @param {Document} realDoc Its document.
 */
export function createHiddenLayers(frame, realDoc) {
  const paths = new Set();

  /** Constructed sheet, and the style element used when one is not available. */
  let sheet = null;
  let node = null;
  let applied = "";

  function create() {
    // The sheet has to be constructed in the render's own realm: Chrome refuses
    // to adopt one that belongs to another document.
    const Sheet = frame.contentWindow?.CSSStyleSheet;
    if ("function" === typeof Sheet) {
      try {
        sheet = new Sheet();
        OWNED.add(sheet);
        return;
      } catch (error) {
        console.debug("[cbt] dom-tools: no constructed sheet here", error);
        sheet = null;
      }
    }

    node = realDoc.createElement("style");
    node.id = HIDE_SHEET_ID;
  }

  function detach() {
    if (null !== sheet) {
      const adopted = realDoc.adoptedStyleSheets ?? [];
      if (adopted.includes(sheet)) {
        realDoc.adoptedStyleSheets = adopted.filter((one) => one !== sheet);
      }
    }
    node?.remove();
    applied = "";
  }

  /**
   * Makes the render match the set — writing only what actually differs.
   *
   * Called on every rebuild rather than only on a click, because cssbattle
   * rebuilds the render from scratch on each keystroke and takes whatever was
   * attached with it. Being idempotent is what makes that safe: in the style
   * element fallback a needless write would wake the observer that triggered
   * this rebuild, and the two would chase each other.
   */
  function apply() {
    const css = hideCss([...paths]);

    if ("" === css) {
      detach();
      return;
    }
    if (null === sheet && null === node) {
      create();
    }

    if (null !== sheet) {
      if (css !== applied) {
        sheet.replaceSync(css);
      }
      const adopted = realDoc.adoptedStyleSheets ?? [];
      if (!adopted.includes(sheet)) {
        realDoc.adoptedStyleSheets = [...adopted, sheet];
      }
    } else {
      if (css !== applied) {
        node.textContent = css;
      }
      if (!node.isConnected) {
        const head = realDoc.head ?? realDoc.documentElement;
        head.insertAdjacentElement("beforeend", node);
      }
    }

    applied = css;
  }

  return {
    get size() {
      return paths.size;
    },

    has(path) {
      return paths.has(path);
    },

    toggle(path) {
      if (paths.has(path)) {
        paths.delete(path);
        return;
      }
      paths.add(path);
    },

    clear() {
      paths.clear();
    },

    /**
     * Forgets the layers whose path no longer matches anything.
     *
     * A path is a position in the tree, so editing the markup can leave one
     * pointing at nothing — or, when a node is inserted before it, one notch
     * off. The first case is cleaned up here; the second is the accepted price
     * of never stamping an id on the player's own nodes.
     *
     * @param {Set<string>} alive Every path the current tree produced.
     */
    prune(alive) {
      paths.forEach((path) => {
        if (!alive.has(path)) {
          paths.delete(path);
        }
      });
    },

    apply,

    /** Gives the render back untouched — a mount must not outlive its writes. */
    dispose() {
      paths.clear();
      detach();
    },
  };
}
