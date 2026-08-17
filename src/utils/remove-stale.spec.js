/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { removeStale } from "./remove-stale";

describe("removeStale", () => {
  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("removes an element with the given id", () => {
    document.body.innerHTML = `<div id="dom-tool"></div>`;

    removeStale("dom-tool");

    expect(document.getElementById("dom-tool")).toBeNull();
  });

  it("does nothing when the id is absent", () => {
    document.body.innerHTML = `<div id="keep"></div>`;

    removeStale("dom-tool");

    expect(document.getElementById("keep")).not.toBeNull();
  });

  it("removes every duplicate sharing an id", () => {
    // Exactly the state a leaked mount leaves behind: ids are no longer unique.
    document.body.innerHTML = `
      <div id="dom-tool">a</div>
      <div id="dom-tool">b</div>
      <div id="dom-tool">c</div>
    `;

    removeStale("dom-tool");

    expect(document.querySelectorAll("#dom-tool")).toHaveLength(0);
  });

  it("handles several ids at once and leaves the rest alone", () => {
    document.body.innerHTML = `
      <div id="dom-tool"></div>
      <div id="dom-outline"></div>
      <div id="untouched"></div>
    `;

    removeStale("dom-tool", "dom-outline", "never-existed");

    expect(document.getElementById("dom-tool")).toBeNull();
    expect(document.getElementById("dom-outline")).toBeNull();
    expect(document.getElementById("untouched")).not.toBeNull();
  });

  it("removes a nested duplicate without touching its surviving parent", () => {
    document.body.innerHTML = `<div id="wrap"><div id="dom-outline"></div></div>`;

    removeStale("dom-outline");

    expect(document.getElementById("dom-outline")).toBeNull();
    expect(document.getElementById("wrap")).not.toBeNull();
  });

  it("gives up instead of spinning when a node will not detach", () => {
    // A node whose remove() is a no-op would otherwise loop forever.
    const stubborn = document.createElement("div");
    stubborn.id = "stuck";
    stubborn.remove = () => {};
    document.body.appendChild(stubborn);

    removeStale("stuck");

    expect(console.debug).toHaveBeenCalledWith(
      expect.stringContaining("stuck"),
    );
  });
});
