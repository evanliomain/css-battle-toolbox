/**
 * Reaches the site's CodeMirror editor from the page's own JS world, where the
 * page scripts injected by the content scripts run. Shared by the snippet tool
 * and the clip-path tool.
 */

/** The values each view already keeps, so a second call adds nothing. */
const kept = new WeakMap();

/** @returns {any} the editor's view, `null` when there is none yet */
export function findView() {
  // Same lookup as CodeMirror's own EditorView.findFromDOM.
  return document.querySelector(".cm-content")?.cmView?.rootView?.view ?? null;
}

/**
 * Adds `facet.of(value)` to the editor, and adds it back whenever it goes.
 *
 * The site bundles CodeMirror: its classes are reached through the view. The
 * site's React wrapper reconfigures the editor whenever one of its props
 * changes, which drops any extension added from outside: every transaction
 * checks it is still there.
 *
 * @param {any} view the editor's view
 * @param {any} facet a facet of the site's CodeMirror
 * @param {unknown} value what to provide to it, the same each time
 * @returns {boolean} whether it was added now, `false` if it already was
 */
export function keepFacet(view, facet, value) {
  const values = kept.get(view) ?? new Set();
  kept.set(view, values);
  if (values.has(value)) {
    return false;
  }
  values.add(value);

  const { appendConfig } = view.constructor.scrollIntoView(0).constructor;
  const dispatch = view.dispatch;
  const ensureAttached = () => {
    if (!view.state.facet(facet).includes(value)) {
      dispatch.call(view, { effects: appendConfig.of(facet.of(value)) });
    }
  };
  view.dispatch = function (...args) {
    dispatch.apply(this, args);
    ensureAttached();
  };
  ensureAttached();
  return true;
}
