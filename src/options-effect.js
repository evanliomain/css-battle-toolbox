import "./options-effect.css";
import { doAsync } from "./utils/do-async";

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

doAsync(() => {
  const battleDate = document.querySelector('[class^="Header_breadcrumbs"] h2');
  if (null === battleDate) {
    return false;
  }
  if (battleDate.innerText === today()) {
    document.body.classList.add("today");
  }
  return true;
})();

function today() {
  const today = new Date();
  const day = String(today.getDate());
  const month = String(today.getMonth() + 1);
  const year = today.getFullYear();

  return `${day}/${month}/${year}`;
}
