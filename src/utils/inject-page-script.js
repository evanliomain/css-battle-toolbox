/**
 * Runs a script in the page's own JS world, where CodeMirror lives. Injected
 * once: the script outlives SPA navigations.
 *
 * @param {string} id the id of the <script>, to inject it only once
 * @param {string} path the script, as the build names it
 */
export function injectPageScript(id, path) {
  if (document.getElementById(id)) {
    return;
  }
  const script = document.createElement("script");
  script.id = id;
  script.type = "module";
  script.src = chrome.runtime.getURL(path);
  document.head.append(script);
}
