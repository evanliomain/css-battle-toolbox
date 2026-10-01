import "./output-groups.css";
import { htmlToElement } from "../utils/html-to-element";
import { setChecked, toolInputs } from "./inputs";

export const GROUPS_ID = "output-groups";

/** Ctrl+1 to Ctrl+9: a group past the ninth has no shortcut. */
const MAX_SHORTCUTS = 9;

/**
 * Adds a column of buttons left of the output, one per group set in the
 * options. A click puts every output tool in the state its group asks for, and
 * a button lights up whenever the checkboxes match its group, however they got
 * there.
 */
export function addGroupButtons(config, refs, onCleanup) {
  let groups = [];
  let column = null;

  function render(next = []) {
    column?.remove();
    column = null;
    groups = next;
    if (0 === groups.length) {
      return;
    }

    column = htmlToElement(`
      <div
        id="${GROUPS_ID}"
        role="toolbar"
        aria-orientation="vertical"
        aria-label="Output tool groups"
      ></div>`);
    groups.forEach((group, i) => column.appendChild(groupButton(group, i)));
    // Next to the render, not inside it: the diff tool sets a filter on
    // .target-container, which would recolor the buttons too.
    refs.targetContainer.insertAdjacentElement("afterend", column);
    refreshActive();
  }

  function groupButton(group, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "output-group hint--left";
    button.textContent = initial(group.label);
    button.setAttribute("aria-label", group.label);
    if (index < MAX_SHORTCUTS) {
      const digit = index + 1;
      button.setAttribute("data-hint", `${group.label} (Ctrl+${digit})`);
      button.setAttribute("aria-keyshortcuts", `Control+${digit}`);
    } else {
      button.setAttribute("data-hint", group.label);
    }
    button.addEventListener("click", () => {
      applyGroup(group);
      refreshActive();
    });
    return button;
  }

  function refreshActive() {
    if (null === column) {
      return;
    }
    const inputs = toolInputs();
    [...column.children].forEach((button, i) =>
      button.setAttribute("aria-pressed", String(matches(groups[i], inputs))),
    );
  }

  render(config.outputGroups);
  onCleanup(() => column?.remove());

  // Both cssbattle's checkboxes and ours sit in the header strip, and their
  // change events bubble up to it.
  refs.hstack.addEventListener("change", refreshActive);
  onCleanup(() => refs.hstack.removeEventListener("change", refreshActive));

  // On the capture phase, ahead of the editor, which would otherwise take the
  // keystroke while it has the focus.
  function onKeyDown(event) {
    const index = shortcutIndex(event);
    if (index >= groups.length) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    column.children[index].click();
  }
  document.addEventListener("keydown", onKeyDown, true);
  onCleanup(() => document.removeEventListener("keydown", onKeyDown, true));

  function onStorageChange(changes) {
    if (undefined !== changes.outputGroups) {
      render(changes.outputGroups.newValue);
    }
  }
  chrome.storage.onChanged.addListener(onStorageChange);
  onCleanup(() => chrome.storage.onChanged.removeListener(onStorageChange));
}

/**
 * The group a Ctrl+digit asks for, from 0, or `Infinity` for any other key.
 *
 * Read from `code`, not `key`: on an AZERTY keyboard the digit row types
 * `&é"'(` unless Shift is held.
 */
function shortcutIndex(event) {
  if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
    return Infinity;
  }
  const match = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
  return null === match ? Infinity : Number(match[1]) - 1;
}

function applyGroup(group) {
  for (const [tool, input] of Object.entries(toolInputs())) {
    if (null !== input) {
      setChecked(input, wanted(group, tool));
    }
  }
}

function matches(group, inputs) {
  return Object.entries(inputs).every(
    ([tool, input]) => (input?.checked ?? false) === wanted(group, tool),
  );
}

function wanted(group, tool) {
  return true === group.tools?.[tool];
}

/** The first character as a reader sees it, so an emoji stays whole. */
function initial(label) {
  const [first] = new Intl.Segmenter().segment(label.trim());
  return (first?.segment ?? "?").toUpperCase();
}
