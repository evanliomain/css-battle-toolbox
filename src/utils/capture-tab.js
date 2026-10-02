/** Asks the background worker for a capture of the tab. */
export const CAPTURE_TAB = "cbt:capture-visible-tab";

/**
 * Captures the visible part of the tab, as a PNG data URL.
 *
 * `chrome.tabs` is out of reach of a content script, so the background worker
 * takes the capture on its behalf.
 *
 * @returns {Promise<string>}
 */
export async function captureTab() {
  const response = await chrome.runtime.sendMessage({ type: CAPTURE_TAB });
  if ("string" !== typeof response?.dataUrl) {
    throw new Error(response?.error ?? "The tab could not be captured");
  }
  return response.dataUrl;
}
