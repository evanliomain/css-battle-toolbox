/**
 * Runs in the page's own JS world, injected by snippet-tools.js: CodeMirror's
 * view hangs off a DOM property, which a content script's isolated world
 * cannot see. No `chrome.*` here.
 */
import { colorSlotAt } from "./utils/css-color-slot";
import { isPlayPage } from "./utils/spa-router";
import { ATTACH_EVENT, swatchType, targetColors } from "./utils/snippet";

/** The word being typed: a hex color, or a color keyword. */
const WORD = /#?[\w-]*$/;

const hooked = new WeakSet();

const provider = () => [{ autocomplete: completeColors }];

document.addEventListener(ATTACH_EVENT, attach);
// The first event can fire before this module has loaded.
attach();

function attach() {
  // Same lookup as CodeMirror's own EditorView.findFromDOM.
  const view = document.querySelector(".cm-content")?.cmView?.rootView?.view;
  if (!view) {
    console.debug("[cbt] snippet tool: no CodeMirror view found");
    return;
  }
  if (hooked.has(view)) {
    return;
  }
  hooked.add(view);

  // The site bundles CodeMirror: reach its classes through the view.
  const { languageData } = view.state.constructor;
  const { appendConfig } = view.constructor.scrollIntoView(0).constructor;
  const dispatch = view.dispatch;
  const ensureAttached = () => {
    if (!view.state.facet(languageData).includes(provider)) {
      dispatch.call(view, {
        effects: appendConfig.of(languageData.of(provider)),
      });
    }
  };
  // The site's React wrapper reconfigures the editor whenever one of its props
  // changes, which drops any extension added from outside: add it back.
  view.dispatch = function (...args) {
    dispatch.apply(this, args);
    ensureAttached();
  };
  ensureAttached();
}

/** A CodeMirror completion source offering the target colors. */
function completeColors(context) {
  if (document.body.classList.contains("hideSnippet") || !isPlayPage()) {
    return null;
  }
  const word = context.matchBefore(WORD);
  if (word.from === word.to && !context.explicit) {
    return null;
  }
  if (!colorSlotAt(context.state.sliceDoc(0, word.from))) {
    return null;
  }
  return {
    from: word.from,
    options: [...targetColors(), "transparent"].map((color) => ({
      label: color,
      detail: "target",
      type: `cbt-color ${swatchType(color)}`,
      // Ahead of the keywords CodeMirror suggests for CSS values.
      boost: 99,
    })),
    validFor: /^#?[\w-]*$/,
  };
}
