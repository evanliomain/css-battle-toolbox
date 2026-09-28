import { mount } from "./utils/mount";
import { targetId } from "./utils/spa-router";
import { BOILERPLATE, readEditorCode, saveCode } from "./utils/saved-code";

// Typing fires a mutation per keystroke; one write once the user pauses is enough.
// Leaving the page flushes whatever is still pending.
const DEBOUNCE_MS = 300;

mount("save-tools", {
  selectors: {
    editor: "[contenteditable]",
  },
  init({ editor }, onCleanup) {
    // Taken once: on a client-side navigation the editor node is reused and may
    // already show the next battle's code before this mount is torn down.
    const id = targetId();
    let timer = null;

    function save() {
      clearTimeout(timer);
      timer = null;
      if (id !== targetId()) {
        return;
      }
      // Never the boilerplate: on load it is on screen before the saved code is
      // put back, and saving it then would wipe what there was to restore.
      if (editor.textContent === BOILERPLATE) {
        return;
      }
      const code = readEditorCode(editor);
      if (null !== code) {
        saveCode(code, id);
      }
    }

    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(save, DEBOUNCE_MS);
    }

    function flush() {
      // `takeRecords` catches an edit whose mutation callback has not run yet.
      if (null !== timer || 0 < observer.takeRecords().length) {
        save();
      }
    }

    function onVisibilityChange() {
      if ("hidden" === document.visibilityState) {
        flush();
      }
    }

    const observer = new MutationObserver(schedule);
    observer.observe(editor, {
      characterData: true,
      childList: true,
      subtree: true,
    });
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    onCleanup(() => {
      observer.disconnect();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      // Keeps the last keystrokes, unless the URL has already moved on.
      flush();
    });
  },
});
