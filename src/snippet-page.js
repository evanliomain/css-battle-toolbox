/**
 * Runs in the page's own JS world, injected by snippet-tools.js: CodeMirror's
 * view hangs off a DOM property, which a content script's isolated world
 * cannot see. No `chrome.*` here.
 */
import { colorSlotAt } from "./utils/css-color-slot";
import { propertyValuesAt } from "./utils/css-property-values";
import { isPlayPage } from "./utils/spa-router";
import { ATTACH_EVENT, swatchType, targetColors } from "./utils/snippet";

/** The word being typed: a hex color, or a color keyword. */
const WORD = /#?[\w-]*$/;

const hooked = new WeakSet();
const patched = new WeakSet();
/** The site's completion sources, each muted where ours take over. */
const muted = new WeakMap();

const provider = () => [
  { autocomplete: completeColors },
  { autocomplete: completeValues },
];
const ours = new Set([completeColors, completeValues]);

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
  muteSiteCompletions(view.state.constructor);
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

/**
 * The site's CSS completion offers the same few hundred keywords in any value.
 * Where we know the valid values, it must stay quiet: CodeMirror's
 * autocompletion asks `languageDataAt` for its sources on each update.
 *
 * This patches the site's EditorState class, so every editor of the page, on
 * purpose: they all share the same completion.
 */
function muteSiteCompletions(EditorState) {
  const { prototype } = EditorState;
  if (patched.has(prototype)) {
    return;
  }
  patched.add(prototype);
  const languageDataAt = prototype.languageDataAt;
  prototype.languageDataAt = function (name, ...args) {
    const values = languageDataAt.call(this, name, ...args);
    return "autocomplete" === name ? values.map(mute) : values;
  };
}

/**
 * The same wrapper each time: CodeMirror tells its running sources apart by
 * identity.
 */
function mute(source) {
  if ("function" !== typeof source || ours.has(source)) {
    return source;
  }
  if (!muted.has(source)) {
    muted.set(source, (context) =>
      enabled() && null !== valuesAt(context) ? null : source(context),
    );
  }
  return muted.get(source);
}

function enabled() {
  return !document.body.classList.contains("hideSnippet") && isPlayPage();
}

/** The values ours suggest for the word being typed, `null` if none of ours. */
function valuesAt(context) {
  const word = context.matchBefore(WORD);
  return propertyValuesAt(context.state.sliceDoc(0, word.from));
}

/** A CodeMirror completion source offering the target colors. */
function completeColors(context) {
  if (!enabled()) {
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

/**
 * A CodeMirror completion source offering the values valid there, for the
 * properties whose site completion makes no sense.
 */
function completeValues(context) {
  if (!enabled()) {
    return null;
  }
  const word = context.matchBefore(WORD);
  if (word.from === word.to && !context.explicit) {
    return null;
  }
  const values = propertyValuesAt(context.state.sliceDoc(0, word.from));
  if (!values?.length) {
    return null;
  }
  return {
    from: word.from,
    options: values.map((value) =>
      "function" === value.type ? { ...value, apply: insertFunction } : value,
    ),
    validFor: /^[\w-]*$/,
  };
}

/** Inserts `name()`, the caret between its parentheses. */
function insertFunction(view, completion, from, to) {
  view.dispatch({
    changes: { from, to, insert: completion.label },
    selection: { anchor: from + completion.label.length - 1 },
    userEvent: "input.complete",
  });
}
