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

  // captureVisibleTab needs <all_urls>: a click in the page never grants
  // activeTab, and a host permission on cssbattle.dev is not enough.
  chrome.tabs.captureVisibleTab(sender.tab?.windowId, { format: "png" }).then(
    (dataUrl) => sendResponse({ dataUrl }),
    (error) => sendResponse({ error: error.message }),
  );

  // Keeps the channel open until the capture answers.
  return true;
});
