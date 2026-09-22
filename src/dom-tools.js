import "./dom-tools.css";
import { buildPanel, setHover } from "./dom-tools/dom-panel";
import {
  createGhost,
  fitOverlay,
  mirrorFlags,
  syncGhost,
} from "./dom-tools/ghost-frame";
import { createHiddenLayers } from "./dom-tools/hidden-layers";
import { renderLabels } from "./dom-tools/tag-labels";
import { htmlToElement } from "./utils/html-to-element";
import { mount } from "./utils/mount";
import { removeStale } from "./utils/remove-stale";

const INJECTED_IDS = ["dom-tool", "dom-outline"];

const OBSERVE = {
  attributes: true,
  // A keystroke can change nothing but a text node.
  characterData: true,
  childList: true,
  subtree: true,
};

mount("dom-tools", {
  selectors: {
    container: ".container__item--output .item__content :first-child",
    targetContainer: ".target-container",
    // Excludes the extension's own iframes, which a bare "iframe" could match:
    // unit-tools' calculator, leaderboard-tools' scraper, and this tool's own
    // ghost — a re-mount resolves its selectors while the previous ghost is
    // still on the page, and cloning that into itself would leave the panel
    // describing the overlay rather than the render.
    iframe: "iframe:not(#calcFrame):not(.cbt-scraper):not(.cbt-ghost)",
    iframeDoc: (refs) =>
      refs.iframe.contentDocument ?? refs.iframe.contentWindow?.document,
  },
  init(refs, onCleanup) {
    const { container, iframe, iframeDoc, targetContainer } = refs;

    // Clear anything a previous mount left on the page before injecting, so the
    // panel and its overlay can never end up duplicated.
    removeStale(...INJECTED_IDS);

    const tool = htmlToElement(template());
    container.insertAdjacentElement("afterend", tool);
    onCleanup(() => tool.remove());

    // Keeps the id the rest of the extension knows: output-tools hides it while
    // Slide & Compare is on, and options-effect.css hides it for hideOutline.
    const overlay = htmlToElement(`<div id="dom-outline"></div>`);
    targetContainer.insertAdjacentElement("beforeend", overlay);
    onCleanup(() => overlay.remove());

    const main = tool.querySelector(`[data-dom-tool="main"]`);
    const showAll = tool.querySelector("#dom-show-all");
    const { ghostDoc } = createGhost(overlay, iframeDoc);

    // The only thing in this tool that writes to the render, and only while the
    // user is holding a layer off. Disposed with the mount: a hidden layer must
    // not survive into the next battle.
    const hidden = createHiddenLayers(iframe, iframeDoc);
    onCleanup(() => hidden.dispose());

    let byId = new Map();
    let hovered = null;
    let frame = 0;

    function rebuild() {
      frame = 0;
      hovered = null;

      // Sized first: the clone lays out inside this box, and player code is
      // full of vw/vh units, so a viewport set afterwards would lay out once at
      // the wrong size and only then settle.
      fitOverlay(overlay, iframe);

      const ghostRoot = syncGhost(ghostDoc, iframeDoc);
      mirrorFlags(ghostRoot, targetContainer);

      const entries = buildPanel(ghostRoot, main, hidden);
      byId = new Map(entries.map((entry) => [entry.id, entry]));

      // Re-applied on every rebuild, not just on a click: cssbattle rebuilds the
      // render from scratch on each keystroke and takes the sheet with it.
      hidden.prune(new Set(entries.map((entry) => entry.path)));
      hidden.apply();

      renderLabels(ghostDoc, entries);

      showAll.hidden = 0 === hidden.size;
      showAll.textContent = `${hidden.size} layer${1 === hidden.size ? "" : "s"} hidden — show all`;
    }

    // Coalesced on a frame: a keystroke fires a burst of mutations. A rebuild
    // reads the live DOM when it runs rather than the MutationRecords that woke
    // it, so dropping the extra runs can never lose an edit.
    function schedule() {
      if (0 !== frame) {
        return;
      }
      frame = requestAnimationFrame(rebuild);
    }
    onCleanup(() => cancelAnimationFrame(frame));

    // No guard against the observer's own mutations any more: everything this
    // tool writes goes to the ghost, never to the document it watches.
    const observer = new MutationObserver(schedule);
    observer.observe(iframeDoc, OBSERVE);
    onCleanup(() => observer.disconnect());

    // output-tools toggles these classes on the host, and a class cannot cross
    // an iframe boundary, so they are mirrored onto the ghost root instead.
    const flags = new MutationObserver(() =>
      mirrorFlags(ghostDoc.documentElement, targetContainer),
    );
    flags.observe(targetContainer, { attributeFilter: ["class"] });
    onCleanup(() => flags.disconnect());

    // The overlay is watched alongside the render, because it is the one that
    // comes back from display:none — Slide & Compare and the hideOutline option
    // both hide it, and everything measured while it was hidden read zero.
    if ("function" === typeof ResizeObserver) {
      const resize = new ResizeObserver(schedule);
      resize.observe(iframe);
      resize.observe(overlay);
      onCleanup(() => resize.disconnect());
    }

    // Delegated once rather than bound per row: the panel is rebuilt on every
    // edit, and re-binding hundreds of listeners each time is pure waste.
    function onHover(event) {
      const row = event.target.closest?.("[data-id]");
      const next =
        undefined === row?.dataset.id ? null : byId.get(row.dataset.id);
      if ((next ?? null) === hovered) {
        return;
      }
      if (null !== hovered) {
        setHover(hovered.element, false);
      }
      hovered = next ?? null;
      if (null !== hovered) {
        setHover(hovered.element, true);
      }
    }
    function onLeave() {
      if (null !== hovered) {
        setHover(hovered.element, false);
        hovered = null;
      }
    }
    // Delegated for the same reason, and on the same root.
    function onClick(event) {
      const target = event.target;

      if (null !== (target.closest?.("#dom-show-all") ?? null)) {
        hidden.clear();
      } else {
        const path = target.closest?.("[data-eye]")?.dataset.eye;
        if (undefined === path) {
          return;
        }
        hidden.toggle(path);
      }

      hidden.apply();
      // Nothing observes a stylesheet, so the panel and the ghost have to be
      // told to catch up — the render itself is already up to date.
      schedule();
    }

    tool.addEventListener("mouseover", onHover);
    tool.addEventListener("mouseleave", onLeave);
    tool.addEventListener("click", onClick);
    onCleanup(() => {
      tool.removeEventListener("mouseover", onHover);
      tool.removeEventListener("mouseleave", onLeave);
      tool.removeEventListener("click", onClick);
    });

    rebuild();
  },
});

function template() {
  return `
    <div id="dom-tool">
      <button type="button" id="dom-show-all" hidden></button>
      <div data-dom-tool="main"></div>
    </div>
  `;
}
