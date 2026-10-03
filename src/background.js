import { CAPTURE_TAB } from "./utils/capture-tab";
import { OPEN_OPTIONS } from "./utils/open-options";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (OPEN_OPTIONS === message?.type) {
    chrome.runtime.openOptionsPage();
    return false;
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
 * Chrome refuses more than two captures a second, and the match and the
 * screenshot share them: each capture waits its turn, half a second after the
 * previous one.
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
