import "./options-effect.css";
import { mount } from "./utils/mount";

// The option classes live on <body>, which always exists, and they matter on
// every cssbattle page — so this part stays outside `mount`.
chrome.storage.sync.get(null).then(applySettings);

chrome.storage.onChanged.addListener((changes) => {
  applySettings(
    Object.fromEntries(
      Object.entries(changes).map(([key, { newValue }]) => [key, newValue]),
    ),
  );
});

function applySettings(settings) {
  for (let [key, value] of Object.entries(settings)) {
    document.body.classList.toggle(key, value);
    if (key.startsWith("nb")) {
      document.body.style.setProperty("--" + key, value);
    }
  }
}

mount("options-effect:today", {
  selectors: {
    battleDate: '[class^="Header_breadcrumbs"] h2',
  },
  init({ battleDate }, onCleanup) {
    if (battleDate.innerText !== today()) {
      return;
    }
    document.body.classList.add("today");
    onCleanup(() => document.body.classList.remove("today"));
  },
});

function today() {
  const today = new Date();
  const day = String(today.getDate());
  const month = String(today.getMonth() + 1);
  const year = today.getFullYear();

  return `${day}/${month}/${year}`;
}
