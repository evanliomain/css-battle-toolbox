import { doAsync } from "./do-async";
import { isPlayPage, mountKey, onNavigate } from "./spa-router";

/**
 * How long to let the page re-render after a client-side navigation before
 * resolving selectors again.
 *
 * `popstate` fires synchronously, well before React has replaced the battle
 * panel, and most selectors still match the *previous* battle's nodes at that
 * point. Resolving immediately would mount successfully against stale content
 * and never retry, so re-mounts wait this out first. The initial mount does not.
 */
const SETTLE_MS = 500;

/** Live mounts by name, so a re-registered tool can retire its previous self. */
const registry = new Map();

/**
 * Mounts a tool and keeps it mounted across SPA navigations.
 *
 * Every DOM node the tool needs is declared up front in `selectors`, and `init`
 * only runs once all of them resolve. That removes the failure mode where a tool
 * guards on one element and then dereferences another that is not there yet:
 * the throw used to kill the retry loop for good.
 *
 * On every navigation the previous mount is torn down through the cleanups the
 * tool registered, then mounted again when `when` matches the new URL. Without
 * the teardown, MutationObservers stay bound to the previous battle's iframe and
 * injected buttons pile up.
 *
 * A tool with independent sub-features should call `mount` once per feature, so
 * each one waits for its own nodes and tears down on its own.
 *
 * @param {string} name Label used in console warnings.
 * @param {object} config
 * @param {(href: string) => boolean} [config.when] URL gate. Defaults to /play/<id> pages.
 * @param {Record<string, Selector>} [config.selectors]
 * @param {Init} config.init
 * @param {number} [config.timeout] Passed to `doAsync`. `Infinity` polls for the page's lifetime.
 *
 * @typedef {string | {all: string} | {optional: string} | ((refs: any) => unknown)} Selector
 * @typedef {(refs: any, onCleanup: (fn: () => void) => void, signal: AbortSignal) => unknown} Init
 */
export function mount(name, config) {
  const { when = isPlayPage, selectors = {}, init, timeout } = config;

  let cycle = null;
  let key = null;

  function teardown() {
    if (null === cycle) {
      return;
    }
    const { cleanups, controller } = cycle;
    cycle.done = true;
    cycle = null;

    controller.abort();
    drain(name, cleanups);
  }

  // A second registration under the same name means this tool's module ran twice
  // — which is what vite's HMR does to a changed content script during `npm
  // start`. Each call owns its own closure, so without this the first mount's
  // injected DOM stays behind forever and everything shows up twice.
  const previous = registry.get(name);
  if (undefined !== previous) {
    console.debug(`[cbt] ${name} registered twice, dropping the first mount`);
    previous();
  }
  registry.set(name, teardown);

  onNavigate((href) => {
    const nextKey = mountKey(href);
    if (nextKey === key) {
      // Same page — a query or fragment change, not a navigation.
      return;
    }
    const isFirstMount = null === key;
    key = nextKey;

    teardown();
    if (!when(href)) {
      return;
    }

    const current = {
      cleanups: [],
      controller: new AbortController(),
      done: false,
    };
    cycle = current;
    const { signal } = current.controller;

    function onCleanup(fn) {
      // Registered after a navigation already tore this cycle down: the mount it
      // belongs to is gone, so undo it straight away.
      if (current.done) {
        run(name, fn);
        return;
      }
      current.cleanups.push(fn);
    }

    const poll = doAsync(
      () => {
        const refs = resolve(selectors);
        if (null === refs) {
          return false;
        }

        // `init` gets a per-attempt signal rather than the cycle's own, so a
        // failed attempt can be rolled back completely: any sub-poller it
        // started is aborted alongside the DOM it injected. Otherwise the retry
        // would run beside the first attempt's leftovers and double everything.
        const attempt = new AbortController();
        const abortAttempt = () => attempt.abort();
        signal.addEventListener("abort", abortAttempt, { once: true });

        // `init` may be async — a sub-feature reading chrome.storage, typically.
        return Promise.resolve(init(refs, onCleanup, attempt.signal))
          .then(() => true)
          .catch((error) => {
            attempt.abort();
            signal.removeEventListener("abort", abortAttempt);
            drain(name, current.cleanups);
            throw error;
          });
      },
      { name, timeout, signal },
    );

    if (isFirstMount) {
      poll();
      return;
    }
    setTimeout(() => {
      if (!signal.aborted) {
        poll();
      }
    }, SETTLE_MS);
  });
}

function drain(name, cleanups) {
  // Popping unwinds in the reverse of the build order, and — unlike iterating
  // then truncating — a cleanup that registers another one still gets it run.
  while (0 < cleanups.length) {
    run(name, cleanups.pop());
  }
}

function run(name, fn) {
  try {
    fn();
  } catch (error) {
    console.debug(`[cbt] ${name} cleanup threw`, error);
  }
}

/**
 * Resolves every selector, or returns null as soon as one is missing.
 *
 * Entries are resolved in declaration order, so a function selector can read the
 * refs declared above it — `iframeDoc` from `iframe`, say. Declaring one before
 * its dependency does not work.
 *
 * @param {Record<string, Selector>} selectors
 */
function resolve(selectors) {
  const refs = {};

  for (const [key, selector] of Object.entries(selectors)) {
    const value = resolveOne(selector, refs);
    if (undefined === value) {
      return null;
    }
    refs[key] = value;
  }

  return refs;
}

/**
 * Returns `undefined` when the selector is not satisfied yet.
 *
 * Note that only `null`/`undefined` count as unsatisfied: a function selector
 * returning `false`, `0` or `""` resolves fine. Return `undefined` to block.
 */
function resolveOne(selector, refs) {
  if ("string" === typeof selector) {
    return document.querySelector(selector) ?? undefined;
  }

  if ("function" === typeof selector) {
    return selector(refs) ?? undefined;
  }

  if (undefined !== selector.all) {
    const nodes = document.querySelectorAll(selector.all);
    return 0 === nodes.length ? undefined : nodes;
  }

  if (undefined !== selector.optional) {
    // Present or not, this one never blocks the mount.
    return document.querySelector(selector.optional) ?? null;
  }

  throw new Error(`[cbt] unsupported selector: ${JSON.stringify(selector)}`);
}
