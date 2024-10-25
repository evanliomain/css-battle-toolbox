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
  "invertDifference",
  "nbBrightnessDifference",
  "strDefaultCode",
];

const defaultCodeTemplate = `<style>
& {
  background: ;
  * {
  }
}
</style>`;

// Saves options to chrome.storage
const saveOptions = () => {
  const optionValues = Object.fromEntries(
    OPTIONS_KEYS.map((key) => {
      if (key.startsWith("nb") || key.startsWith("str")) {
        return [key, document.getElementById(key).value];
      }
      return [key, document.getElementById(key).checked];
    }),
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
      if (null === document.getElementById(key)) {
        continue;
      }

      if (key.startsWith("nb") || key.startsWith("str")) {
        document.getElementById(key).value = value;
        continue;
      }
      document.getElementById(key).checked = value;
    }

    if (undefined === items.strDefaultCode) {
      document.getElementById("strDefaultCode").value = defaultCodeTemplate;
      chrome.storage.sync.set({ strDefaultCode: defaultCodeTemplate });
    }
  });
};

document.addEventListener("DOMContentLoaded", restoreOptions);
document.getElementById("save").addEventListener("click", saveOptions);
document.getElementById("resetTemplate").addEventListener("click", resetCodeTemplate);

function resetCodeTemplate() {
  document.getElementById("strDefaultCode").value = defaultCodeTemplate;
}
