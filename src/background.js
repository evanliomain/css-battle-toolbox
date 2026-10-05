import { CAPTURE_TAB } from "./utils/capture-tab";
import { FETCH_IMAGE, imageAsDataUrl } from "./utils/fetch-image";
import { hold, listen, release, render } from "./utils/hidden-renderer";
import {
  HOLD_RENDERER,
  RELEASE_RENDERER,
  RENDER_CODE,
} from "./utils/render-code";
import { OPEN_OPTIONS } from "./utils/open-options";

listen();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (OPEN_OPTIONS === message?.type) {
    chrome.runtime.openOptionsPage();
    return false;
  }

  if (RENDER_CODE === message?.type) {
    answer(render(message.code), sendResponse);
    return true;
  }

  if (HOLD_RENDERER === message?.type) {
    answer(hold(sender.tab?.id, sender.tab?.windowId), sendResponse, () => ({
      ok: true,
    }));
    return true;
  }

  if (RELEASE_RENDERER === message?.type) {
    release(sender.tab?.id);
    return false;
  }

  if (FETCH_IMAGE === message?.type) {
    imageAsDataUrl(message.url).then(
      (dataUrl) => sendResponse({ dataUrl }),
      (error) => sendResponse({ error: error.message }),
    );
    // Keeps the channel open until the download answers.
    return true;
  }

  if (CAPTURE_TAB !== message?.type) {
    return false;
  }

  captureVisibleTab(sender.tab?.windowId).then(
    (dataUrl) => sendResponse({ dataUrl }),
    (error) => sendResponse({ error: error.message }),
  );

  // Keeps the channel open until the capture answers.
  return true;
});

/**
 * Chrome refuses more than two captures a second: each capture waits its
 * turn, half a second after the previous one.
 */
const CAPTURE_INTERVAL_MS = 500;
let queue = Promise.resolve();
let lastCapture = -Infinity;

function captureVisibleTab(windowId) {
  const capture = queue.then(async () => {
    const wait = lastCapture + CAPTURE_INTERVAL_MS - Date.now();
    if (0 < wait) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    lastCapture = Date.now();
    // captureVisibleTab needs <all_urls>: a click in the page never grants
    // activeTab, and a host permission on cssbattle.dev is not enough.
    return chrome.tabs.captureVisibleTab(windowId, { format: "png" });
  });
  // A failed capture must not block the next ones.
  queue = capture.catch(() => {});
  return capture;
}

/** Answers a message once its work is done, with its result or its error. */
function answer(promise, sendResponse, shape = (dataUrl) => ({ dataUrl })) {
  promise.then(
    (value) => sendResponse(shape(value)),
    (error) => sendResponse({ error: error.message }),
  );
}
