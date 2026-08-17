import "./score-tools.css";
import { mount } from "./utils/mount";
import { prettify } from "./utils/prettify";

// Marks the rows we already decorated. Both observers below can report the same
// node more than once — the top-score one watches the whole body subtree — and
// without this the Copy buttons pile up.
const DONE = "cbtCopyScore";

// The submissions list only exists once the player has submitted, which can be
// minutes into a battle — so these two poll for as long as the page lives
// instead of giving up on the default timeout.
mount("score-tools:scores", {
  timeout: Infinity,
  selectors: {
    items: {
      all: ".submissions-list__item:not(:has(.top-submission-container))",
    },
    // The list is a different selector from the items, so it gets its own entry
    // rather than an unguarded lookup inside the observer setup.
    list: ".submissions-list:not(:has(.top-submission-container))",
  },
  init({ items, list }, onCleanup) {
    const buttons = [];
    onCleanup(() => removeButtons(buttons));

    const observer = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        // Only "childList" changes matter here (nodes added or removed)
        if (mutation.type === "childList" && 0 < mutation.addedNodes.length) {
          addCopyScoreButtons(mutation.addedNodes, buttons);
        }
      }
    });
    observer.observe(list, { childList: true });
    onCleanup(() => observer.disconnect());

    addCopyScoreButtons(items, buttons);
  },
});

mount("score-tools:top-score", {
  timeout: Infinity,
  selectors: {
    items: { all: ".top-submission-container:has(.top-submission__author)" },
  },
  init({ items }, onCleanup, signal) {
    const buttons = [];
    onCleanup(() => removeButtons(buttons));

    const observer = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        if (mutation.type === "childList" && 0 < mutation.addedNodes.length) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              addCopyTopScoreButtons(
                node.querySelectorAll(
                  ".top-submission-container:has(.top-submission__author)",
                ),
                buttons,
                signal,
              );
            }
          });
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    onCleanup(() => observer.disconnect());

    addCopyTopScoreButtons(items, buttons, signal);
  },
});

function addCopyScoreButtons(items, buttons) {
  items.forEach((node) => {
    if (!claim(node)) {
      return;
    }
    const score = node.querySelector("p");
    const otherButton = node.querySelector(".dropdown-container");
    if (null === score || null === otherButton) {
      release(node);
      return;
    }

    const button = copyButton("*" + score.innerText + "*");
    node.insertAdjacentElement("beforeend", button);
    buttons.push([node, button]);

    otherButton.classList.remove("dropdown-container--full-width");
    otherButton.style.flex = "1";

    node.style.display = "flex";
    node.style.gap = "1rem";
    node.style.justifyContent = "space-between";
  });
}

function addCopyTopScoreButtons(items, buttons, signal) {
  items.forEach(async (node) => {
    if (!claim(node)) {
      return;
    }
    const author = node.querySelector("a");
    const score = node.querySelector("p.top-submission__author__score");
    const code = node.querySelector("p.submissions-list__code");
    const host = node.querySelector(".top-submission__author");
    if (null === author || null === score || null === code || null === host) {
      release(node);
      return;
    }

    const prettyCode = await prettify(code.innerText);
    // prettify is async, so a navigation may have torn this mount down by now.
    if (signal.aborted) {
      release(node);
      return;
    }

    const button = copyButton(
      `*Top solution by ${author.ariaLabel}: ${score.innerText}*
\`\`\`${prettyCode}\`\`\``,
    );
    host.append(button);
    buttons.push([node, button]);
  });
}

function copyButton(message) {
  const button = document.createElement("button");
  button.type = "button";
  button.innerText = "Copy";
  button.className = "button button--copy-score";
  button.addEventListener("click", () =>
    navigator.clipboard.writeText(message),
  );
  return button;
}

/**
 * @returns {boolean} false when the node is not an element, or was already
 * decorated. Observer callbacks hand us text nodes too.
 */
function claim(node) {
  if (undefined === node.dataset || undefined !== node.dataset[DONE]) {
    return false;
  }
  node.dataset[DONE] = "";
  return true;
}

function release(node) {
  delete node.dataset[DONE];
}

function removeButtons(buttons) {
  buttons.forEach(([node, button]) => {
    button.remove();
    release(node);
  });
  buttons.length = 0;
}
