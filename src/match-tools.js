import "./match-tools.css";
import { CODE_CHANGED } from "./utils/change-code";
import { dependsOnFonts } from "./utils/font-dependent";
import { htmlToElement } from "./utils/html-to-element";
import { minify } from "./utils/minify";
import { mount } from "./utils/mount";
import { MATCH_MEASURED, matchImages } from "./utils/pixel-match";
import { holdRenderer, releaseRenderer, renderCode } from "./utils/render-code";
import { readEditorCode } from "./utils/saved-code";
import { computeScore } from "./utils/score";
import { targetAsShown } from "./utils/screen-colors";

export const BADGE_ID = "cbt-match";
export const PIXELS_ID = "cbt-match-pixels";

/** From this match on, the wrong pixels are few enough to count them. */
const COUNTED_FROM = 0.99;
export const TOOL_ID = "cbt-match-tool";
export const SWITCH_ID = "cbt-match-switch";

/** Stored, so the switch stays as the user left it, in every tab. */
const ENABLED_KEY = "enableMatch";

/** The pause after the last keystroke before measuring. */
const DEBOUNCE_MS = 500;

/**
 * What only the user does in the editor. Not a MutationObserver: cssbattle
 * re-renders the editor on its own, and each re-render would cost a render.
 * `keydown` rather than `input`, which CodeMirror never fires for Backspace,
 * Enter or Ctrl+Z, as it handles them itself.
 */
const USER_EDITS = ["keydown", "paste", "cut", "drop"];

const PROMPT = "Type to measure the match";

const APPROXIMATE =
  "Approximate: cssbattle's renderer may differ from this computer's.";

const SWITCH_HINT =
  "Live match estimate, approximate. While on, your code is rendered in a hidden tab through Chrome's debugger: that is why Chrome shows a debugging banner.";

mount("match-tools", {
  selectors: {
    container:
      '[class^="Editor-module"] > .item__header > .header__extra-info > .hstack',
    editor: "[contenteditable]",
    // By its class: target-tools adds an image of its own to the panel, the
    // icon of its link to the previewer.
    target: ".container__item--target img.levelpage__target",
  },
  init({ container, editor, target }, onCleanup, signal) {
    const tool = htmlToElement(template());
    const toggle = tool.querySelector(`#${SWITCH_ID}`);
    const badge = tool.querySelector(`#${BADGE_ID}`);
    const pixels = tool.querySelector(`#${PIXELS_ID}`);
    // Right after the minified count, which the score is computed from.
    const counter = document.getElementById("nb-minified-characters");
    if (null === counter) {
      container.insertAdjacentElement("afterbegin", tool);
    } else {
      counter.insertAdjacentElement("afterend", tool);
    }
    onCleanup(() => tool.remove());
    setHint(badge, PROMPT);

    // A click shows where the pixels are wrong.
    function onBadgeClick() {
      document.getElementById("output-pixel-diff-input")?.click();
    }
    badge.addEventListener("click", onBadgeClick);

    let timer = null;
    let running = false;
    let queued = false;
    // Measured once per code: an edit that leaves it as it was costs nothing.
    let lastCode = null;

    // Off by default: it is only worth its banner when a solution resists.
    // On, the renderer is held from then on, so Chrome's debugging banner shows
    // when the user asks for it, rather than at the first keystroke.
    let enabled = false;
    let hidden = false;
    let held = false;
    function useRenderer(wanted) {
      if (wanted === held) {
        return;
      }
      held = wanted;
      if (wanted) {
        holdRenderer().catch((error) =>
          console.debug("[cbt] match-tools: no renderer", error),
        );
      } else {
        releaseRenderer().catch(() => {});
      }
    }
    function apply() {
      const active = enabled && !hidden;
      toggle.setAttribute("aria-checked", String(enabled));
      // Lit like cssbattle's own selected buttons.
      toggle.classList.toggle("button--primary", enabled);
      tool.classList.toggle("is-on", enabled);
      useRenderer(active);
      if (!active) {
        clearTimeout(timer);
        timer = null;
        lastCode = null;
        showUnmeasured({ badge, pixels }, PROMPT);
      }
      return active;
    }

    chrome.storage.sync.get([ENABLED_KEY, "hideMatch"]).then((items) => {
      if (signal.aborted) {
        return;
      }
      enabled = true === items[ENABLED_KEY];
      hidden = true === items.hideMatch;
      apply();
    });
    function onStorageChange(changes) {
      if (undefined !== changes[ENABLED_KEY]) {
        enabled = true === changes[ENABLED_KEY].newValue;
      }
      if (undefined !== changes.hideMatch) {
        hidden = true === changes.hideMatch.newValue;
      }
      apply();
    }
    chrome.storage.onChanged.addListener(onStorageChange);
    onCleanup(() => {
      chrome.storage.onChanged.removeListener(onStorageChange);
      useRenderer(false);
    });

    // Switched on: measured at once, the click being the user's own action.
    function onToggle() {
      enabled = !enabled;
      chrome.storage.sync.set({ [ENABLED_KEY]: enabled });
      if (apply()) {
        measure();
      }
    }
    toggle.addEventListener("click", onToggle);

    function onEdit() {
      clearTimeout(timer);
      timer = setTimeout(measure, DEBOUNCE_MS);
    }
    USER_EDITS.forEach((type) => editor.addEventListener(type, onEdit));
    document.addEventListener(CODE_CHANGED, onEdit);
    onCleanup(() => {
      clearTimeout(timer);
      USER_EDITS.forEach((type) => editor.removeEventListener(type, onEdit));
      document.removeEventListener(CODE_CHANGED, onEdit);
    });

    async function measure() {
      timer = null;
      // One render at a time: an edit meanwhile is measured right after,
      // instead of piling up renders.
      if (running) {
        queued = true;
        return;
      }
      // Nothing to show, so nothing to render: dropped, not put off.
      if (!enabled || hidden || "hidden" === document.visibilityState) {
        return;
      }
      const code = readEditorCode(editor);
      if (null === code || code === lastCode) {
        return;
      }

      running = true;
      try {
        // In the colors the hidden tab draws, as the render comes back in them.
        const targetImage = await targetAsShown(target.src);
        const rendered = await renderCode(code);
        // Left, or switched off, while the render was on its way.
        if (signal.aborted || !enabled || hidden) {
          return;
        }
        lastCode = code;
        const result = matchImages(targetImage, rendered);
        showMatch({ badge, pixels }, result, code);
        document.dispatchEvent(
          new CustomEvent(MATCH_MEASURED, { detail: result }),
        );
      } catch (error) {
        console.debug("[cbt] match-tools:", error);
        showUnmeasured(
          { badge, pixels },
          `The match could not be measured: ${error.message}`,
        );
      } finally {
        running = false;
        if (queued && !signal.aborted) {
          queued = false;
          measure();
        }
      }
    }
  },
});

function showMatch({ badge, pixels }, { match, diffPixels }, code) {
  const length = minify(code).length;

  // Never rounded up to 100%: what is left of a 99.9% is the point.
  // Always approximate: cssbattle renders on its own server.
  badge.textContent = `≈${percent(match)}%`;
  badge.classList.toggle("is-perfect", 0 === diffPixels);
  // Close to 100%, the count of wrong pixels says more than the percent;
  // with none, the 100% says it all.
  pixels.hidden = match < COUNTED_FROM || 0 === diffPixels;
  pixels.textContent = `${diffPixels} px`;
  setHint(
    badge,
    [
      `Estimated match: ${percent(match)}%, ${diffPixels} wrong pixels.`,
      `Estimated score: ${computeScore(length, match)} for ${length} characters once minified.`,
      APPROXIMATE,
      // cssbattle renders on Linux, with other fonts than this computer's.
      ...(dependsOnFonts(code)
        ? [
            "Even more so as your code depends on the fonts, which cssbattle renders with its own Linux fonts.",
          ]
        : []),
    ].join(" "),
  );
}

function showUnmeasured({ badge, pixels }, hint) {
  pixels.hidden = true;
  badge.textContent = "—";
  badge.classList.remove("is-perfect");
  setHint(badge, hint);
}

/**
 * To 5 decimals at most, where a pixel weighs 0.00083%: every wrong pixel
 * shows.
 * The closest to 100% short of it, 99.99917%, never rounds up.
 */
function percent(match) {
  // Through a number, which drops the trailing zeros: 99.98, not 99.98000.
  return String(Number((match * 100).toFixed(5)));
}

function setHint(badge, hint) {
  badge.setAttribute("aria-label", hint);
  badge.setAttribute("data-hint", hint);
}

function template() {
  return `
    <div id="${TOOL_ID}">
      <button
        type="button"
        role="switch"
        aria-checked="false"
        id="${SWITCH_ID}"
        class="button button--mini hint--bottom hint--large"
        aria-label="${SWITCH_HINT}"
        data-hint="${SWITCH_HINT}"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <g fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="4" />
          </g>
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        id="${BADGE_ID}"
        class="hint--bottom hint--large"
      >—</button>
      <span
        id="${PIXELS_ID}"
        class="hint--bottom"
        aria-label="Wrong pixels out of 120,000"
        data-hint="Wrong pixels out of 120,000"
        hidden
      ></span>
    </div>`;
}
