/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOILERPLATE } from "./utils/saved-code";

function line(text) {
  const div = document.createElement("div");
  div.className = "cm-line";
  div.textContent = text;
  return div;
}

/** Replaces the editor content, as CodeMirror does on each edit. */
function type(...lines) {
  document.querySelector("[contenteditable]").replaceChildren(...lines.map(line));
}

function saved() {
  return window.localStorage.getItem("cbt-lastCode-123");
}

// Fake timers, so the polls a test leaves running die with it instead of
// firing once the jsdom environment is gone.
function tick(ms) {
  return vi.advanceTimersByTimeAsync(ms);
}

describe("save-tools", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    document.body.innerHTML = `<div class="cm-content" contenteditable="true"></div>`;
    await import("./save-tools.js");
    await tick(150);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.localStorage.clear();
    document.body.innerHTML = "";
  });

  it("saves the code once the user pauses", async () => {
    type("<p></p>", "<style>p{margin:0}</style>");
    expect(saved()).toBeNull();

    await tick(400);

    expect(saved()).toBe("<p></p>\n<style>p{margin:0}</style>");
  });

  it("saves what is pending when the page goes away", async () => {
    type("<p></p>");
    window.dispatchEvent(new Event("pagehide"));

    expect(saved()).toBe("<p></p>");
  });

  it("does not save before anything changed", async () => {
    window.dispatchEvent(new Event("pagehide"));

    expect(saved()).toBeNull();
  });

  it("never overwrites saved code with the boilerplate", async () => {
    window.localStorage.setItem("cbt-lastCode-123", "<p></p>");

    // `textContent` of the lines, joined, is what the boilerplate check reads.
    document
      .querySelector("[contenteditable]")
      .replaceChildren(document.createTextNode(BOILERPLATE));
    await tick(400);

    expect(saved()).toBe("<p></p>");
  });
});
