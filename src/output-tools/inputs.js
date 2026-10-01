/**
 * cssbattle's own labels in the output header, leaving ours out: until
 * cssbattle renders its checkboxes, a plain lookup would land on our options.
 */
export function cssbattleLabels() {
  return [
    ...document.querySelectorAll(
      ".container__item--output .header__extra-info .hstack label",
    ),
  ].filter((label) => null === label.querySelector('[id^="output-"]'));
}

/** Clicks a checkbox only when it is not already in the wanted state. */
export function setChecked(input, checked) {
  if (input.checked !== checked) {
    input.click();
  }
}

/**
 * The checkbox of every output tool, keyed like the groups store them, or
 * `null` for one not rendered yet: cssbattle's two show up after ours.
 *
 * @returns {Record<string, HTMLInputElement | null>}
 */
export function toolInputs() {
  const labels = cssbattleLabels();
  const slideLabel = labels.find(
    (label) => null !== label.querySelector('input[type="checkbox"]'),
  );
  return {
    slideAndCompare:
      slideLabel?.querySelector('input[type="checkbox"]') ?? null,
    difference: labels[1]?.querySelector("input") ?? null,
    targetOnOutput: document.getElementById("output-compare-input"),
    grid: document.getElementById("output-grid-input"),
    outline: document.getElementById("output-outline-input"),
    background: document.getElementById("output-background-input"),
  };
}
