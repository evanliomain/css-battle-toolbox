/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function tick(ms) {
  return vi.advanceTimersByTimeAsync(ms);
}

/** The battle header, dated like cssbattle renders it: "Sep 7, 2026". */
function header(date) {
  document.body.innerHTML = `<div class="Header-module__x1__breadcrumbs"><h2></h2></div>`;
  // jsdom does not implement innerText; the tool only reads it back.
  document.querySelector("h2").innerText = date;
}

describe("options-effect", () => {
  let stored;
  let onChanged;

  async function load() {
    await import("./options-effect.js");
    await tick(0);
  }

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 7, 12));
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stored = {};
    onChanged = [];
    vi.stubGlobal("chrome", {
      storage: {
        sync: { get: vi.fn(() => Promise.resolve(stored)) },
        onChanged: { addListener: vi.fn((cb) => onChanged.push(cb)) },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.history.replaceState(null, "", "/play/123");
    document.body.className = "";
    document.body.removeAttribute("style");
    document.body.innerHTML = "";
  });

  it("puts every stored option on <body> as a class", async () => {
    stored = { hideHeader: true, hideFooter: false };

    await load();

    expect(chrome.storage.sync.get).toHaveBeenCalledWith(null);
    expect(document.body.classList.contains("hideHeader")).toBe(true);
    expect(document.body.classList.contains("hideFooter")).toBe(false);
  });

  it("exposes the numeric options as CSS variables", async () => {
    stored = { nbBrightnessDifference: "3" };

    await load();

    expect(
      document.body.style.getPropertyValue("--nbBrightnessDifference"),
    ).toBe("3");
  });

  it("follows the options as they change", async () => {
    stored = { hideHeader: true };
    await load();

    onChanged[0]({
      hideHeader: { oldValue: true, newValue: false },
      hideFooter: { newValue: true },
      nbBrightnessDifference: { oldValue: "1", newValue: "2" },
    });

    expect(document.body.classList.contains("hideHeader")).toBe(false);
    expect(document.body.classList.contains("hideFooter")).toBe(true);
    expect(
      document.body.style.getPropertyValue("--nbBrightnessDifference"),
    ).toBe("2");
  });

  it("flags today's battle", async () => {
    header("Sep 7, 2026");

    await load();

    expect(document.body.classList.contains("today")).toBe(true);
  });

  it("does not flag another day's battle", async () => {
    header("Sep 6, 2026");

    await load();

    expect(document.body.classList.contains("today")).toBe(false);
  });

  it("reads the date even with stray whitespace around it", async () => {
    header(" Sep 7, 2026\n");

    await load();

    expect(document.body.classList.contains("today")).toBe(true);
  });

  it("does not mistake the same day of another month for today", async () => {
    header("Aug 7, 2026");

    await load();

    expect(document.body.classList.contains("today")).toBe(false);
  });

  it("drops the flag when leaving the battle", async () => {
    header("Sep 7, 2026");
    await load();

    window.history.pushState(null, "", "/daily");
    await tick(300);

    expect(document.body.classList.contains("today")).toBe(false);
  });
});
