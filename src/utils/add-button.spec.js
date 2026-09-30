/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addButton } from "./add-button";

function group() {
  return document.querySelector(".btn-group");
}

describe("addButton", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form><div class="btn-group"><button>Submit</button></div></form>`;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("prepends a button with the label", () => {
    const button = addButton(group(), "Minify", () => {});

    expect(group().firstElementChild).toBe(button);
    expect(button.innerText).toBe("Minify");
  });

  it("runs the callback on click, without submitting the surrounding form", () => {
    const onClick = vi.fn();
    const onSubmit = vi.fn((event) => event.preventDefault());
    document.querySelector("form").addEventListener("submit", onSubmit);

    addButton(group(), "Minify", onClick).click();

    expect(onClick).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("takes cssbattle's button styling", () => {
    const button = addButton(group(), "Minify", () => {});

    expect(button.classList.contains("button")).toBe(true);
  });

  it("marks the button for the hide-buttons option", () => {
    const button = addButton(group(), "Minify", () => {});

    // options-effect.css matches on [data-hide="true"].
    expect(button.matches('[data-hide="true"]')).toBe(true);
  });
});
