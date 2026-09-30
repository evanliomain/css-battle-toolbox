/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showSnackbar } from "./snackbar";

function toasts() {
  return [...document.querySelectorAll("#cbt-snackbar .Toastify__toast")];
}

describe("showSnackbar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("shows the message in a dark info toast, bottom right, like the site", () => {
    const toast = showSnackbar("Color #F00 copied to clipboard");

    expect(toast.parentElement.className).toBe(
      "Toastify__toast-container Toastify__toast-container--bottom-right",
    );
    expect(toast.classList).toContain("Toastify__toast-theme--dark");
    expect(toast.classList).toContain("Toastify__toast--info");
    expect(toast.classList).toContain("Toastify__slide-enter--bottom-right");
    expect(toast.querySelector('[role="alert"]').textContent.trim()).toBe(
      "Color #F00 copied to clipboard",
    );
    expect(
      toast.querySelector('[role="progressbar"]').style.animationDuration,
    ).toBe("3500ms");
  });

  it("stacks the toasts in a single container", () => {
    showSnackbar("one");
    showSnackbar("two");

    expect(document.querySelectorAll("#cbt-snackbar")).toHaveLength(1);
    expect(toasts().map((toast) => toast.textContent.trim())).toEqual([
      "one",
      "two",
    ]);
  });

  it("slides out after 3.5s, then goes away once the animation ends", () => {
    const toast = showSnackbar("copied");

    vi.advanceTimersByTime(3499);
    expect(toast.classList).toContain("Toastify__slide-enter--bottom-right");

    vi.advanceTimersByTime(1);
    expect(toast.classList).not.toContain(
      "Toastify__slide-enter--bottom-right",
    );
    expect(toast.classList).toContain("Toastify__slide-exit--bottom-right");
    expect(toasts()).toEqual([toast]);

    toast.dispatchEvent(new Event("animationend"));
    expect(toasts()).toEqual([]);
  });

  it("closes on click, without waiting for the timer", () => {
    const toast = showSnackbar("copied");

    toast.click();

    expect(toast.classList).toContain("Toastify__slide-exit--bottom-right");
    toast.dispatchEvent(new Event("animationend"));
    expect(toasts()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows the message as text, not as markup", () => {
    const toast = showSnackbar("<b>1px</b> copied to clipboard");

    expect(toast.querySelector("b")).toBeNull();
    expect(toast.textContent.trim()).toBe("<b>1px</b> copied to clipboard");
  });
});
