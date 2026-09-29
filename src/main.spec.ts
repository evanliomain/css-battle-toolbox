/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("main (popup)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("lists the external tools in #app", async () => {
    document.body.innerHTML = `<div id="app"></div>`;

    await import("./main");

    const app = document.getElementById("app")!;
    expect(app.querySelector("h1")?.textContent).toBe("External tools");
    const links = Array.from(app.querySelectorAll("a"));
    expect(links.map((a) => a.textContent?.trim())).toEqual([
      "Color mixer",
      "Unit golf",
      "Css battle previewer",
      "Matrix Transform",
      "Border image helper",
      "Fancy border",
      "Clip-path",
    ]);
    // A popup closes on blur: every tool must open in its own tab.
    expect(links.every((a) => "_blank" === a.target)).toBe(true);
  });

  it("does nothing on a page without #app", async () => {
    document.body.innerHTML = `<main></main>`;

    await expect(import("./main")).resolves.toBeDefined();

    expect(document.body.innerHTML).toBe("<main></main>");
  });
});
