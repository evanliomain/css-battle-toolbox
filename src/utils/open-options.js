/** Asks the background worker to open the options page. */
export const OPEN_OPTIONS = "cbt:open-options-page";

/**
 * Opens the options page of the extension.
 *
 * `chrome.runtime.openOptionsPage` is out of reach of a content script, and a
 * `window.open` on the extension page is blocked by Chrome, so the background
 * worker opens it on its behalf.
 */
export function openOptions() {
  chrome.runtime.sendMessage({ type: OPEN_OPTIONS });
}
