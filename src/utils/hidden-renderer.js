// The background worker's half of the match: renders code as cssbattle's
// renderer does, in a page no one sees, through the debugger protocol.

import { isPlayPage } from "./spa-router";

/**
 * What cssbattle writes before the code in its output (its Preview
 * component). It changes the layout, so the render has to have it too.
 */
export const PREFIX = "<style>body{overflow:hidden}</style>";

const BLANK = "about:blank";
const PROTOCOL = "1.3";
const STALE_TAB = "rendererTabId";
const GROUP_TITLE = "CSS Battle Toolbox: match";

/** The hidden tab holding the render page, once opened. */
let session = null;
/** The same, resolved: the listeners below need it synchronously. */
let current = null;
/** Tabs of cssbattle that may ask for a render. */
const holders = new Set();
/** Set when the user dismissed Chrome's debugging banner: not attached again. */
let refused = false;
let queue = Promise.resolve();

/**
 * Keeps the renderer ready for a tab of cssbattle. Attaching is what makes
 * Chrome show its debugging banner, which shifts the page: done once the page
 * loads, rather than at the first keystroke.
 *
 * @param {number} tabId
 * @param {number} [windowId] The window of that tab, where the hidden tab
 *   opens: its pages are drawn for that window's screen.
 */
export function hold(tabId, windowId) {
  holders.add(tabId);
  refused = false;
  return open(windowId);
}

/**
 * The tab no longer needs the renderer: once no tab does, the hidden tab is
 * closed and the debugger, with its banner, goes away.
 *
 * @param {number} tabId
 */
export function release(tabId) {
  holders.delete(tabId);
  if (0 === holders.size) {
    return close();
  }
  return Promise.resolve();
}

/**
 * Renders the code at 400×300, one device pixel per CSS pixel, scripts off,
 * as cssbattle's headless Chromium does, whatever the user's screen.
 * One render at a time.
 *
 * @param {string} code
 * @returns {Promise<string>} The PNG, as a data URL
 */
export function render(code) {
  const run = queue.then(() => draw(code));
  queue = run.catch(() => {});
  return run;
}

function open(windowId) {
  if (refused) {
    return Promise.reject(
      new Error("Debugging was cancelled: reload the page to measure again"),
    );
  }
  session ??= create(windowId).then(
    (opened) => (current = opened),
    (error) => {
      session = null;
      throw error;
    },
  );
  return session;
}

/**
 * Opens the render page in a background tab, folded away in a collapsed tab
 * group: a background tab is never on screen, yet the debugger draws it on
 * demand. Neither a minimized window, never drawn at all, nor an offscreen
 * document, which has nothing to draw on, can be shot.
 */
async function create(windowId) {
  const tab = await chrome.tabs.create({ windowId, url: BLANK, active: false });
  await chrome.storage.session.set({ [STALE_TAB]: tab.id });
  try {
    const groupId = await chrome.tabs.group({
      tabIds: tab.id,
      createProperties: { windowId: tab.windowId },
    });
    await chrome.tabGroups.update(groupId, {
      collapsed: true,
      title: GROUP_TITLE,
      color: "grey",
    });
  } catch (error) {
    // A window without tab groups: the tab stays in the background all the same.
    console.debug("[cbt] hidden-renderer: no tab group", error);
  }
  const target = { tabId: tab.id };
  await chrome.debugger.attach(target, PROTOCOL);
  await send(target, "Emulation.setDeviceMetricsOverride", {
    width: 400,
    height: 300,
    deviceScaleFactor: 1,
    mobile: false,
  });
  // cssbattle allows no script, and none of the code must run here.
  await send(target, "Emulation.setScriptExecutionDisabled", { value: true });
  // Nor reach the network: an <img src> or a <meta http-equiv="refresh"> of
  // the code would otherwise load from a page the user never sees.
  await send(target, "Network.enable");
  await send(target, "Network.setBlockedURLs", { urls: ["*://*/*"] });
  return { tabId: tab.id, target };
}

async function draw(code) {
  const { target } = await open();
  const { result } = await send(target, "Runtime.evaluate", {
    expression: "location.href",
    returnByValue: true,
  });
  if (BLANK !== result.value) {
    await send(target, "Page.navigate", { url: BLANK });
  }
  // Written in, as cssbattle writes its output: no doctype, so quirks mode.
  await send(target, "Runtime.evaluate", {
    expression: `document.open();document.write(${JSON.stringify(PREFIX + code)});document.close();`,
  });
  const { data } = await send(target, "Page.captureScreenshot", {
    format: "png",
    clip: { x: 0, y: 0, width: 400, height: 300, scale: 1 },
  });
  return `data:image/png;base64,${data}`;
}

async function close() {
  const closing = session;
  session = null;
  current = null;
  if (null === closing) {
    return;
  }
  const { tabId, target } = await closing.catch(() => ({}));
  if (undefined === tabId) {
    return;
  }
  await chrome.debugger.detach(target).catch(() => {});
  await chrome.tabs.remove(tabId).catch(() => {});
}

function send(target, method, params = {}) {
  return chrome.debugger.sendCommand(target, method, params);
}

/** Wires the renderer to the browser's events. For the background worker. */
export function listen() {
  // The user pressed Cancel on Chrome's banner, or closed our tab: start
  // afresh next time, but never force the debugger on a user who refused it.
  chrome.debugger.onDetach.addListener((source, reason) => {
    if (source.tabId !== current?.target.tabId) {
      return;
    }
    if ("canceled_by_user" === reason) {
      refused = true;
    }
    const { tabId } = current;
    session = null;
    current = null;
    chrome.tabs.remove(tabId).catch(() => {});
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === current?.tabId) {
      session = null;
      current = null;
    }
    if (holders.has(tabId)) {
      release(tabId);
    }
  });
  // A page that is left unloads before its content script can say so.
  chrome.tabs.onUpdated.addListener((tabId, { url }) => {
    if (holders.has(tabId) && undefined !== url && !isPlayPage(url)) {
      release(tabId);
    }
  });
  // A worker restarted while its tab was open: that tab is lost.
  chrome.storage.session.get(STALE_TAB).then((items) => {
    const stale = items[STALE_TAB];
    if (undefined !== stale && stale !== current?.tabId) {
      chrome.tabs.remove(stale).catch(() => {});
    }
  });
}

/** Forgets everything, for the tests. */
export function resetRenderer() {
  session = null;
  current = null;
  holders.clear();
  refused = false;
  queue = Promise.resolve();
}
