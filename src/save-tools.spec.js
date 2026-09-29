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
    window.history.replaceState({}, "", "/play/123");
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

  it("saves once for a burst of keystrokes", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    type("<p>");
    await tick(100);
    type("<p></p>");
    await tick(100);
    type("<p></p><i>");
    await tick(400);

    expect(setItem).toHaveBeenCalledOnce();
    expect(saved()).toBe("<p></p><i>");
  });

  it("saves what is pending when the tab is hidden", async () => {
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    type("<p></p>");
    // Lets the observer run, so the save is pending on the timer this time.
    await tick(0);

    document.dispatchEvent(new Event("visibilitychange"));

    expect(saved()).toBe("<p></p>");
    visibility.mockRestore();
  });

  it("waits for the pause when the tab comes back into view", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    type("<p></p>");

    document.dispatchEvent(new Event("visibilitychange"));

    expect(saved()).toBeNull();
  });

  it("does not save an editor that is only partly rendered", async () => {
    const gap = document.createElement("div");
    gap.className = "cm-gap";
    type("<p></p>");
    document.querySelector("[contenteditable]").append(gap);

    await tick(400);

    // Only the lines in view are in the DOM: saving now would truncate the code.
    expect(saved()).toBeNull();
  });

  it("keeps the last keystrokes when the mount is torn down", async () => {
    type("<p></p>");
    // Same battle under another path: a navigation for the router, but the
    // code still belongs to the id it was typed on.
    window.history.replaceState({}, "", "/play/123/");
    await tick(200);

    expect(saved()).toBe("<p></p>");
  });

  it("does not save a battle's code under the next one", async () => {
    type("<p></p>");
    window.history.replaceState({}, "", "/play/456");
    await tick(200);

    expect(saved()).toBeNull();
    expect(window.localStorage.getItem("cbt-lastCode-456")).toBeNull();
  });

  it("stops watching the editor once the user left the battle", async () => {
    window.history.replaceState({}, "", "/leaderboard");
    await tick(200);

    type("<p></p>");
    window.dispatchEvent(new Event("pagehide"));
    await tick(400);

    expect(window.localStorage.length).toBe(0);
  });
});
