/** Asks the background worker to download an image. */
export const FETCH_IMAGE = "cbt:fetch-image";

/**
 * Downloads an image of another origin, as a blob.
 *
 * A content script fetches under the page's CORS rules, whatever the host
 * permissions, and the daily targets are served by Firebase Storage without
 * any `Access-Control-Allow-Origin`: the fetch fails. The background worker is
 * not bound by CORS, so it downloads the image on our behalf.
 *
 * @param {string} url
 * @returns {Promise<Blob>}
 */
export async function fetchImage(url) {
  const response = await chrome.runtime.sendMessage({ type: FETCH_IMAGE, url });
  if ("string" !== typeof response?.dataUrl) {
    throw new Error(response?.error ?? "The image could not be downloaded");
  }
  return (await fetch(response.dataUrl)).blob();
}

/**
 * Downloads an image as a data URL, the only way bytes can travel in a
 * message. For the background worker.
 *
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function imageAsDataUrl(url) {
  if (!/^https?:/.test(url)) {
    throw new Error(`Not a web image: ${url}`);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`The image could not be downloaded: ${response.status}`);
  }
  const type = response.headers.get("content-type") ?? "image/png";
  const bytes = new Uint8Array(await response.arrayBuffer());
  // By chunks: spreading a whole image into String.fromCharCode overflows the stack.
  let binary = "";
  for (let start = 0; start < bytes.length; start += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK));
  }
  return `data:${type};base64,${btoa(binary)}`;
}

const CHUNK = 0x8000;
