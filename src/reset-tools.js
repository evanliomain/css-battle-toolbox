import { changeCode } from "./utils/change-code";
import { mount } from "./utils/mount";
import { targetId } from "./utils/spa-router";
import { BOILERPLATE, loadSavedCode } from "./utils/saved-code";

// How long the boilerplate has to stay in the editor before it is replaced.
// cssbattle drops the `lastCode-<id>` key a moment before its editor shows the
// restored code, so the boilerplate can still be on screen right after it.
const SETTLE_MS = 300;

mount("reset-tools", {
  // Deliberately short. The boilerplate, when there is one, is in the editor
  // almost immediately; waiting longer would risk catching a brief boilerplate
  // frame before cssbattle restores saved progress, and overwriting real work.
  timeout: 3000,
  selectors: {
    editor: "[contenteditable]",
    // Waiting for the boilerplate itself, not just for the editor to exist. On a
    // client-side navigation React reuses the editor node, so it still holds the
    // previous battle's code for a moment — checking once there would silently
    // do nothing and never retry.
    // Also waiting for cssbattle to pick up the code it saved: until then, the
    // boilerplate on screen is only a placeholder for the user's own work.
    boilerplate: (refs) =>
      (!hasCssbattleSavedCode() && refs.editor.textContent === BOILERPLATE) ||
      undefined,
  },
  init(refs, onCleanup, signal) {
    return settle(signal).then(() => {
      if (signal.aborted || hasCssbattleSavedCode()) {
        return;
      }
      // Puts back the code the extension saved, or else a simpler template
      changeCode(reset);
    });
  },
});

/**
 * Whether cssbattle has code of the user's to put back in the editor.
 *
 * On unload cssbattle saves the editor into `localStorage` under
 * `lastCode-<id>`, then on load reads that key, removes it, and restores the
 * code. Until it does, the editor shows the boilerplate — and replacing it
 * there made the restore land on the template instead, losing the user's code
 * on every refresh.
 *
 * Content scripts share the page's `localStorage`, so the key is visible here.
 */
function hasCssbattleSavedCode() {
  try {
    return null !== window.localStorage.getItem(`lastCode-${levelId()}`);
  } catch {
    // Storage blocked: better to skip a reset than to risk losing work.
    return true;
  }
}

// Mirrors how cssbattle derives the id it keys the saved code on: numeric
// below seven characters, the raw string above.
function levelId() {
  const id = targetId();
  return 6 < id.length ? id : parseInt(id, 10);
}

function settle(signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, SETTLE_MS);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function reset(code) {
  return chrome.storage.sync.get("strDefaultCode").then((items) => {
    if (code === BOILERPLATE) {
      return (
        loadSavedCode() ??
        items.strDefaultCode ??
        `<style>
& {
  background: ;
  * {
  }
}
</style>`
      );
    }
    return false;
  });
}
