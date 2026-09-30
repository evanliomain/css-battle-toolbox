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
    battleDate: '[class^="Header-module"][class$="breadcrumbs"] h2',
  },
  init({ battleDate }, onCleanup) {
    if (battleDate.innerText.trim() !== today()) {
      return;
    }
    document.body.classList.add("today");
    onCleanup(() => document.body.classList.remove("today"));
  },
});

// Spelled out by hand rather than with toLocaleDateString, whose short month
// names vary between locales and ICU versions ("Sep" vs "Sept").
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Today, dated like cssbattle renders it: "Sep 30, 2026". */
function today() {
  const today = new Date();
  return `${MONTHS[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;
}
