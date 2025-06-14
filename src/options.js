const OPTIONS_KEYS = [
  "hideSlideAndCompare",
  "hideDifference",
  "hideTargetOnOutput",
  "hideGrid",
  "hideOutline",
  "hideBackground",

  "defaultSlideAndCompare",
  "defaultDifference",
  "defaultTargetOnOutput",
  "defaultGrid",
  "defaultOutline",
  "defaultBackground",

  "hideGlobalStats",
  "hideShareTwitter",

  "hideNumberOfCharacters",
  "hideSponsor",
  "hideHeader",
  "hideFooter",
  "hideOutputCode",
  "hideTarget",

  "hidePrettify",
  "hideMinify",
  "hidePlugins",
  "hideMySolution",
  "hideTopSolution",
  "hideSubmit",

  "hideNbMinifiedCharacters",
  "hideColorMixer",
  "hideUnitGolf",

  "invertDifference",
  "nbBrightnessDifference",
  "x2Difference",

  "strDefaultCode",

  "strKbdIncrement",
  "strKbdDecrement",
  "strKbdIncreaseIncrement",
  "strKbdDecreaseIncrement",
  "strKbdToggleIncrement",
];

const defaultCodeTemplate = `<style>
& {
  background: ;
  * {
  }
}
</style>`;

const default_strKbdIncrement = "=";
const default_strKbdDecrement = ":";
const default_strKbdIncreaseIncrement = "<";
const default_strKbdDecreaseIncrement = "w";
const default_strKbdToggleIncrement = "I";

// Saves options to chrome.storage
const saveOptions = () => {
  const optionValues = Object.fromEntries(
    OPTIONS_KEYS.map((key) => {
      if ("strKbdToggleIncrement" === key) {
        return [key, (document.getElementById(key).value ?? "").toUpperCase()];
      }
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
    if (undefined === items.strKbdIncrement) {
      document.getElementById("strKbdIncrement").value =
        default_strKbdIncrement;
      chrome.storage.sync.set({ strKbdIncrement: default_strKbdIncrement });
    }
    if (undefined === items.strKbdDecrement) {
      document.getElementById("strKbdDecrement").value =
        default_strKbdDecrement;
      chrome.storage.sync.set({ strKbdDecrement: default_strKbdDecrement });
    }
    if (undefined === items.strKbdIncreaseIncrement) {
      document.getElementById("strKbdIncreaseIncrement").value =
        default_strKbdIncreaseIncrement;
      chrome.storage.sync.set({
        strKbdIncreaseIncrement: default_strKbdIncreaseIncrement,
      });
    }
    if (undefined === items.strKbdDecreaseIncrement) {
      document.getElementById("strKbdDecreaseIncrement").value =
        default_strKbdDecreaseIncrement;
      chrome.storage.sync.set({
        strKbdDecreaseIncrement: default_strKbdDecreaseIncrement,
      });
    }
    if (undefined === items.strKbdToggleIncrement) {
      document.getElementById("strKbdToggleIncrement").value =
        default_strKbdToggleIncrement;
      chrome.storage.sync.set({
        strKbdToggleIncrement: default_strKbdToggleIncrement,
      });
    }

    updateToggkeKeyLetter();
  });
};

document.addEventListener("DOMContentLoaded", restoreOptions);
document.getElementById("save").addEventListener("click", saveOptions);
document
  .getElementById("resetTemplate")
  .addEventListener("click", resetCodeTemplate);

document
  .getElementById("strKbdToggleIncrement")
  .addEventListener("input", updateToggkeKeyLetter);

function resetCodeTemplate() {
  document.getElementById("strDefaultCode").value = defaultCodeTemplate;
}

function updateToggkeKeyLetter() {
  document.getElementById("toggle-key-letter").innerText = document
    .getElementById("strKbdToggleIncrement")
    .value.toUpperCase();
}
