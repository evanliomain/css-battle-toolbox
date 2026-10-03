import "./match-tools.css";
import { CODE_CHANGED } from "./utils/change-code";
import { dependsOnFonts } from "./utils/font-dependent";
import { htmlToElement } from "./utils/html-to-element";
import { minify } from "./utils/minify";
import { mount } from "./utils/mount";
import { MATCH_MEASURED, matchImages } from "./utils/pixel-match";
import { createProbe } from "./utils/render-probe";
import { readEditorCode } from "./utils/saved-code";
import { computeScore, PERFECT_MATCH } from "./utils/score";
import { targetImageData } from "./utils/target-image";

export const BADGE_ID = "cbt-match";

/** The pause after the last keystroke before measuring. */
const DEBOUNCE_MS = 500;

/**
 * What only the user does in the editor. Not a MutationObserver: cssbattle
 * re-renders the editor on its own, and each re-render would cost a capture.
 * `keydown` rather than `input`, which CodeMirror never fires for Backspace,
 * Enter or Ctrl+Z, as it handles them itself.
 */
const USER_EDITS = ["keydown", "paste", "cut", "drop"];

const PROMPT = "Type to measure the match";

mount("match-tools", {
  selectors: {
    container:
      '[class^="Editor-module"] > .item__header > .header__extra-info > .hstack',
    editor: "[contenteditable]",
    // By its class: target-tools adds an image of its own to the panel, the
    // icon of its link to the previewer.
    target: ".container__item--target img.levelpage__target",
    output: ".target-container",
  },
  init({ container, editor, target, output }, onCleanup, signal) {
    const badge = htmlToElement(template());
    // Right after the minified count, which the score is computed from.
    const counter = document.getElementById("nb-minified-characters");
    if (null === counter) {
      container.insertAdjacentElement("afterbegin", badge);
    } else {
      counter.insertAdjacentElement("afterend", badge);
    }
    onCleanup(() => badge.remove());
    setHint(badge, PROMPT);

    // A click shows where the pixels are wrong.
    function onBadgeClick() {
      document.getElementById("output-pixel-diff-input")?.click();
    }
    badge.addEventListener("click", onBadgeClick);

    const probe = createProbe();
    onCleanup(() => probe.destroy());

    let timer = null;
    let running = false;
    let queued = false;
    // Measured once per code: an edit that leaves it as it was costs nothing.
    let lastCode = null;

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
      // One capture at a time: an edit meanwhile is measured right after,
      // instead of piling up captures.
      if (running) {
        queued = true;
        return;
      }
      // Nothing to show, so nothing to capture: dropped, not put off.
      if (
        document.body.classList.contains("hideMatch") ||
        "hidden" === document.visibilityState
      ) {
        return;
      }
      const code = readEditorCode(editor);
      if (null === code || code === lastCode) {
        return;
      }

      running = true;
      try {
        const targetImage = await targetImageData(target.src);
        const shot = await probe.render(code, output);
        if (signal.aborted) {
          return;
        }
        if (null === shot) {
          showUnmeasured(badge, "Scroll the output fully into view to measure");
          return;
        }
        lastCode = code;
        const result = matchImages(targetImage, shot.image);
        showMatch(badge, result, code, shot.sRGB);
        document.dispatchEvent(
          new CustomEvent(MATCH_MEASURED, { detail: result }),
        );
      } catch (error) {
        console.debug("[cbt] match-tools:", error);
        showUnmeasured(badge, "The match could not be measured");
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

function showMatch(badge, { match, diffPixels }, code, sRGB) {
  const perfect = match >= PERFECT_MATCH;
  const shown = perfect ? "100" : percent(match);
  const length = minify(code).length;

  const reasons = [];
  if (!sRGB) {
    reasons.push(
      "Chrome blends the colors of this screen outside sRGB, unlike cssbattle: for an exact match, set chrome://flags/#force-color-profile to sRGB.",
    );
  }
  if (dependsOnFonts(code)) {
    reasons.push(
      "Your code depends on the fonts, and cssbattle renders it with its own Linux fonts.",
    );
  }
  const approximate = 0 < reasons.length;

  badge.textContent = `${approximate ? "≈" : ""}${shown}%`;
  badge.classList.toggle("is-perfect", perfect);
  badge.classList.toggle("is-approximate", approximate);
  setHint(
    badge,
    [
      `Estimated match: ${percent(match)}%, ${diffPixels} wrong pixels.`,
      `Estimated score: ${computeScore(length, match)} for ${length} characters once minified.`,
      ...reasons,
    ].join(" "),
  );
}

function showUnmeasured(badge, hint) {
  badge.textContent = "—";
  badge.classList.remove("is-perfect", "is-approximate");
  setHint(badge, hint);
}

/** Rounded down: 99.999% is not 100% yet. */
function percent(match) {
  return (Math.floor(match * 10000) / 100).toFixed(2);
}

function setHint(badge, hint) {
  badge.setAttribute("aria-label", hint);
  badge.setAttribute("data-hint", hint);
}

function template() {
  return `
    <button
      type="button"
      id="${BADGE_ID}"
      class="hint--bottom hint--large"
    >—</button>`;
}
