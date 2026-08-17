/** Bound on the removal loop, so a node that refuses to detach cannot spin. */
const MAX_STALE = 50;

/**
 * Removes any element already carrying one of these ids.
 *
 * A safety net for the tools that inject id'd nodes: it makes a duplicate
 * impossible no matter how a second mount came about. `mount`'s own registry
 * covers the common case, but it lives in module state — which a hot reload
 * resets, while the leftover DOM stays on the page.
 *
 * @param {...string} ids
 */
export function removeStale(...ids) {
  ids.forEach((id) => {
    for (let i = 0; i < MAX_STALE; i++) {
      const existing = document.getElementById(id);
      if (null === existing) {
        return;
      }
      existing.remove();
    }
    console.debug(`[cbt] gave up removing stale #${id}`);
  });
}
