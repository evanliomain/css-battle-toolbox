const OPTIONS_KEYS = [
  "hideSlideAndCompare",
  "hideDifference",
  "hideTargetOnOutput",
  "hideGrid",
  "hideOutline",
  "hideBackground",
  "hideHeader",
  "hideFooter",
  "hidePrettify",
  "hideMinify",
  "hidePlugins",
  "hideMySolution",
  "hideTopSolution",
  "hideSubmit",
  "hideOutputCode",
  "hideTarget",
  "hideNbMinifiedCharacters",
  "hideColorMixer",
  "hideUnitGolf",
];
// Saves options to chrome.storage
const saveOptions = () => {
  const optionValues = Object.fromEntries(
    OPTIONS_KEYS.map((key) => [key, document.getElementById(key).checked]),
  );
  chrome.storage.sync.set(optionValues, () => {
    // Update status to let user know options were saved.
    const status = document.getElementById("status");
    status.textContent = "Options saved.";
    setTimeout(() => {
      status.textContent = "";
    }, 750);
  });
};

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
const restoreOptions = () => {
  chrome.storage.sync.get(null).then((items) => {
    for (let [key, value] of Object.entries(items)) {
      document.getElementById(key).checked = value;
    }
  });
};
// restoreOptions();
document.addEventListener("DOMContentLoaded", restoreOptions);
document.getElementById("save").addEventListener("click", saveOptions);
