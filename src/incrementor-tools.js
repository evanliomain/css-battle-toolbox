import "./incrementor-tools.css";
import { addModulo, subModulo } from "./utils/add-modulo";
import { doAsync } from "./utils/do-async";
import { htmlToElement } from "./utils/html-to-element";

const INCREMENTS = [100, 10, 1, 0.1, 0.01];

doAsync(incrementorTool)();

function incrementorTool() {
  const container = document.querySelector('[class^="Editor_editor__"]');

  if (null === container) {
    return false;
  }

  let upKey = "=";
  let downKey = ":";
  let leftKey = "<";
  let rightKey = "w";

  let incrementMode = false;
  let activeNumberIndex = 0;
  let currentIncrementIndex = 2;
  let selectedSpan = [];

  // Init keyboard shortcut from settings
  chrome.storage.sync.get(null).then(applyKeyboardSettings);

  // Refresh keyboard shortcut on settings change
  chrome.storage.onChanged.addListener((changes) => {
    applyKeyboardSettings(
      Object.fromEntries(
        Object.entries(changes).map(([key, { newValue }]) => [key, newValue]),
      ),
    );
  });

  const observer = new MutationObserver(onContentChange);

  // Add incrementor tool bar
  container.insertAdjacentElement(
    "afterend",
    htmlToElement(template({ leftKey, rightKey, upKey, downKey })),
  );

  toggleIncrementSelection();

  // Handle clicks
  document.getElementById("increment-minus").addEventListener("click", () => {
    modifyNumber(-1);
  });
  document.getElementById("increment-plus").addEventListener("click", () => {
    modifyNumber(1);
  });
  document.getElementById("increment-exit").addEventListener("click", () => {
    toggleIncrementMode();
  });
  document.querySelectorAll("[data-increment-move]").forEach((element) => {
    element.addEventListener("click", () => {
      if ("-1" === element.dataset.incrementMove) {
        setIncrementIndex(subModulo(currentIncrementIndex, INCREMENTS.length));
      }
      if ("1" === element.dataset.incrementMove) {
        setIncrementIndex(addModulo(currentIncrementIndex, INCREMENTS.length));
      }
    });
  });

  document
    .querySelectorAll(`.incrementor-panel [data-increment]`)
    .forEach((element) =>
      element.addEventListener("click", (event) => {
        setIncrementIndex(
          INCREMENTS.findIndex(
            (increment) => increment === Number(event.target.dataset.increment),
          ),
        );
      }),
    );

  // Handle keyboard shortcuts
  document.addEventListener("keydown", (event) => {
    // Ctrl+Shift+I toggle increment mode
    if (event.shiftKey && event.ctrlKey && event.key === "I") {
      toggleIncrementMode();
    }

    // If not in increment mode, exit now
    if (!incrementMode) {
      return;
    }
    // Escape exits increment mode
    if (event.key === "Escape") {
      toggleIncrementMode();
      return;
    }

    // Move increment selection
    switch (event.key) {
      case leftKey:
        setIncrementIndex(subModulo(currentIncrementIndex, INCREMENTS.length));
        break;
      case rightKey:
        setIncrementIndex(addModulo(currentIncrementIndex, INCREMENTS.length));
        break;
      default:
        break;
    }

    event.preventDefault();
    const activeLine = getActiveLine();
    if (!activeLine) {
      return;
    }

    // Reset selection cursor
    const selection = window.getSelection();
    switch (event.key) {
      case "ArrowRight":
        selection.modify("move", "backward", "character");
        break;
      case "ArrowLeft":
        selection.modify("move", "forward", "character");
        break;
      default:
        break;
    }

    const numberSpans = getNumberSpansFromLine(activeLine);
    if (numberSpans.length === 0) {
      return;
    }

    switch (event.key) {
      case "ArrowRight":
        activeNumberIndex = addModulo(activeNumberIndex, numberSpans.length);
        break;
      case "ArrowLeft":
        activeNumberIndex = subModulo(activeNumberIndex, numberSpans.length);
        break;
      case "ArrowUp":
      case "ArrowDown":
        setTimeout(highlightFirstNumberOnLine, 0);
        break;

      case upKey:
        modifyNumber(1);
        break;
      case downKey:
        modifyNumber(-1);
        break;

      case "a":
        toggleSpanToSelection(numberSpans[activeNumberIndex]);
        break;
      case "d":
        getAllNumberSpans().forEach((span) => {
          span.classList.remove("locked");
        });
        selectedSpan = [];
        break;
      default:
        break;
    }
    setTimeout(() => highlightNumberSpan(numberSpans, activeNumberIndex), 0);
  });

  // Handle increment mode enter on menu item click
  doAsync(() => {
    const menuItem = document.getElementById("increment-mode-toggle");
    if (null === menuItem) {
      return false;
    }
    menuItem.addEventListener("click", () => {
      toggleIncrementMode();
    });
    return true;
  })();

  // Increment tool bar template
  function template({ leftKey, rightKey, upKey, downKey }) {
    return `<div class="incrementor-panel">
    <div class="hstack" style="display: flex; gap: 0.25rem; align-items: center; justify-content: flex-start; flex-direction: row;">
      <h3 class="header__title">Increment by</h3>

    </div>
    <div class="hstack" style="display: flex; gap: 0.25rem; align-items: center; justify-content: flex-start; flex-direction: row;">
      <button
        type="button" class="button button--mini button--command hint--bottom"
        data-increment-move="-1"
        data-hint="Increase increment, click here or press '${leftKey}'"
      >
        <
      </button>
    ${INCREMENTS.map(
      (increment) => `
        <button
          type="button" class="button button--mini button--incr hint--bottom"
          data-increment="${increment}"
          data-hint="Choose to increment/decrement by ${increment}"
        >
          ${increment.toString().padStart(3, " ")}
        </button>`,
    ).join(" ")}
      <div class="hstack" style="display: flex; gap: 0.25rem; align-items: center; justify-content: flex-start; flex-direction: row;">
      <button
        type="button" class="button button--mini button--command hint--bottom-left"
        data-increment-move="1"
        data-hint="Decrease increment, click here or press '${rightKey}'"
      >
        >
      </button>
    </div>
    <div class="hstack" style="display: flex; gap: 0.25rem; align-items: center; justify-content: flex-start; flex-direction: row;">
      <button
        type="button"
        id="increment-minus"
        class="button button--mini button--command hint--bottom-left"
        data-hint="Decrement, click here or press '${downKey}'"
        >
        -
        </button>
        <button
        type="button"
        id="increment-plus"
        class="button button--mini button--command hint--bottom-left"
        data-hint="Increment, click here or press '${upKey}'"
      >
      +
      </button>
    </div>
    <div class="hstack" style="display: flex; gap: 0.25rem; align-items: center; justify-content: flex-start; flex-direction: row;">
      <button
        id="increment-exit"
        class="button pill pill--key hint--bottom-left"
        data-hint="Exit increment mode"
        style="text-transform: none;"
      >
        Esc
      </button>
    </div>
  </div>`;
  }

  function enterIncrementMode() {
    selectedSpan = [];
    activeNumberIndex = 0;
    const activeLine = getActiveLine();
    const numberSpans = getNumberSpansFromLine(activeLine);

    getAllNumberSpans().forEach((span) => {
      span.dataset.type = "number";
    });
    const cmContent = document.querySelector(".cm-content");
    if (cmContent) {
      cmContent.classList.add("content-highlighted");
    }

    if (0 < numberSpans.length) {
      highlightNumberSpan(numberSpans, activeNumberIndex);
    }

    observer.observe(document.querySelector("[contenteditable]"), {
      attributes: true,
      childList: true,
    });

    moveCursorToLineStart(activeLine);
  }

  function moveCursorToLineStart(line) {
    const selection = window.getSelection();
    const range = document.createRange();

    // Place the cursor at the start of the current node
    range.setStart(line.firstChild, 0);
    range.collapse(true);

    // Erases the current selection and applies the new
    selection.removeAllRanges();
    selection.addRange(range);
    selection.modify("move", "forward", "character");
  }

  function onContentChange() {
    getAllNumberSpans().forEach((span) => {
      span.dataset.type = "number";
      span.addEventListener("click", (event) => {
        if (event.defaultPrevented) {
          return true;
        }

        event.preventDefault();
        const activeLine = getActiveLine();
        if (!activeLine) {
          return false;
        }
        let spanIndexOnActiveLine;
        const numberSpans = getNumberSpansFromLine(activeLine);
        numberSpans.forEach((element, j) => {
          highlightElement(element, false);
          if (element === span) {
            spanIndexOnActiveLine = j;
          }
        });
        if (!event.shiftKey) {
          highlightElement(span);
          activeNumberIndex = spanIndexOnActiveLine;
          return true;
        }

        // Toggle span to the selection
        toggleSpanToSelection(numberSpans[spanIndexOnActiveLine]);

        return true;
      });
    });
    selectedSpan.forEach((span) => {
      span.classList.add("locked");
    });
    const activeLine = getActiveLine();
    if (activeLine) {
      const numberSpans = getNumberSpansFromLine(activeLine);
      numberSpans[activeNumberIndex]?.classList?.add("highlighted");
    }
  }

  function exitIncrementMode() {
    getAllNumberSpans().forEach((span) => {
      highlightElement(span, false);
      span.classList.remove("locked");
    });
    const cmContent = document.querySelector(".cm-content");
    if (cmContent) {
      cmContent.classList.remove("content-highlighted");
    }
    observer.disconnect();
  }

  function currentIncrement() {
    return INCREMENTS[currentIncrementIndex];
  }

  function highlightElement(element, highlight = true) {
    if (highlight) {
      element.classList.add("highlighted");
    } else {
      element.classList.remove("highlighted");
    }
  }

  function highlightNumberSpan(spans, index) {
    spans.forEach((span, i) => {
      highlightElement(span, i === index);
    });
  }

  function modifyNumber(i) {
    const increment = i * currentIncrement();

    const spansToIncr = [...document.querySelectorAll(".locked,.highlighted")];

    spansToIncr.forEach((span) => {
      const number = parseFloat(span.textContent);
      if (!isNaN(number)) {
        span.textContent = (number + increment)
          .toFixed(3)
          .replace(/\.(\d*[1-9])?0+$/, ".$1")
          .replace(/\.$/, "");
        highlightElement(span); // Keep the outline after content update
      }
    });
  }

  function toggleIncrementMode() {
    incrementMode = !incrementMode;

    if (incrementMode) {
      enterIncrementMode();
    } else {
      exitIncrementMode();
    }
  }

  function getNumberSpansFromLine(line) {
    if (!line) {
      return [];
    }
    return queryNumberElements(line).filter(
      (span) => !isNaN(parseFloat(span.textContent)),
    );
  }
  function getAllNumberSpans() {
    return queryNumberElements(document).filter(
      (span) => !isNaN(parseFloat(span.textContent)),
    );
  }
  function queryNumberElements(element) {
    return [...element.querySelectorAll(".ͼ1g, .ͼ18")];
  }

  function highlightFirstNumberOnLine() {
    const activeLine = getActiveLine();
    if (!activeLine) {
      return;
    }

    const numberSpans = getNumberSpansFromLine(activeLine);

    if (0 < numberSpans.length) {
      activeNumberIndex = 0;
      highlightNumberSpan(numberSpans, activeNumberIndex);
    }
    moveCursorToLineStart(activeLine);
  }

  function setIncrementIndex(index) {
    currentIncrementIndex = index;
    toggleIncrementSelection();
  }

  function toggleIncrementSelection() {
    document
      .querySelectorAll(`.incrementor-panel [data-increment]`)
      .forEach((element) => element.classList.remove("button--primary"));

    document
      .querySelector(
        `.incrementor-panel [data-increment="${currentIncrement()}"]`,
      )
      .classList.add("button--primary");
  }

  function toggleSpanToSelection(numberSpan) {
    numberSpan.classList.toggle("locked");

    if (numberSpan.classList.contains("locked")) {
      selectedSpan.push(numberSpan);
    } else {
      selectedSpan = selectedSpan.filter((span) =>
        span.classList.contains("locked"),
      );
    }
  }

  function applyKeyboardSettings(settings) {
    upKey = settings?.strKbdIncrement ?? upKey;
    downKey = settings?.strKbdDecrement ?? downKey;
    leftKey = settings?.strKbdIncreaseIncrement ?? leftKey;
    rightKey = settings?.strKbdDecreaseIncrement ?? rightKey;
  }

  return true;
}

function getActiveLine() {
  return document.querySelector(".cm-activeLine");
}
