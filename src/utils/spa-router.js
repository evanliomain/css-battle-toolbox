const POLL_INTERVAL = 300;
const ORIGIN = "https://cssbattle.dev";

/**
 * cssbattle.dev is a Next.js SPA. Chrome only injects content scripts on a real
 * document load, so a client-side navigation into /play/<id> leaves every tool
 * unmounted until the user hits refresh.
 *
 * We cannot monkey-patch `history.pushState`: content scripts run in an isolated
 * world with their own JS globals, so the page's own calls are invisible to us.
 * Polling `location.href` is the only mechanism that catches every navigation
 * without a service worker and an extra `webNavigation` permission.
 */
const listeners = [];
let currentHref = null;
let started = false;

/**
 * Calls `cb(href)` immediately for the current URL, then again on every URL
 * change. The immediate call means callers have a single code path for both the
 * initial load and later navigations.
 *
 * @param {(href: string) => void} cb
 */
export function onNavigate(cb) {
  listeners.push(cb);
  start();
  cb(window.location.href);
}

function start() {
  if (started) {
    return;
  }
  started = true;
  currentHref = window.location.href;

  // Polling catches pushState/replaceState; the events make back/forward and
  // hash changes feel instant instead of waiting up to POLL_INTERVAL.
  setInterval(check, POLL_INTERVAL);
  window.addEventListener("popstate", check);
  window.addEventListener("hashchange", check);
}

function check() {
  const href = window.location.href;
  if (href === currentHref) {
    return;
  }
  currentHref = href;
  listeners.forEach((cb) => {
    try {
      cb(href);
    } catch (error) {
      console.debug("[cbt] navigation listener threw", error);
    }
  });
}

/**
 * The part of a URL that decides which tools should be mounted.
 *
 * Deliberately ignores the query and the fragment: the mode menu's own items are
 * `<a href="#">`, so keying on the full href made every click on them look like a
 * navigation and tear all 15 tools down.
 *
 * @param {string} [href]
 */
export function mountKey(href = window.location.href) {
  return pathname(href);
}

/** @param {string} [href] */
export function isPlayPage(href = window.location.href) {
  return /^\/play\/[^/]+/.test(pathname(href));
}

/** @param {string} [href] */
export function isDailyPage(href = window.location.href) {
  return /^\/daily\/?$/.test(pathname(href));
}

/**
 * The battle id of a /play/<id> URL, or "" elsewhere. Parsing the pathname
 * keeps query strings and trailing slashes out of the id.
 *
 * @param {string} [href]
 */
export function targetId(href = window.location.href) {
  const match = /^\/play\/([^/]+)/.exec(pathname(href));
  return null === match ? "" : match[1];
}

function pathname(href) {
  try {
    return new URL(href, ORIGIN).pathname;
  } catch {
    return "";
  }
}
