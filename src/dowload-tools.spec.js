/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/daily"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const IMG = "https://cssbattle.dev/targets/today.png";

function pill() {
  return document.querySelector(".pill");
}

/** Leaves /daily, which tears the tool down. */
function navigateAway() {
  window.history.pushState({}, "", "/play/123");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// Fake timers, so the polls a test leaves running die with it instead of
// firing once the jsdom environment is gone.
function tick(ms) {
  return vi.advanceTimersByTimeAsync(ms);
}

describe("dowload-tools", () => {
  let download;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // The download itself is covered by utils/download.spec.js.
    download = vi.fn();
    vi.doMock("./utils/download", () => ({ download }));
    document.body.innerHTML = `
      <div class="home-daily-target-panel">
        <div class="hstack">
          <div><span class="pill">Yesterday</span><img src="https://cssbattle.dev/targets/yesterday.png" /></div>
          <div><span class="target-today"></span><span class="pill">Today</span><img src="${IMG}" /></div>
        </div>
      </div>`;
  });

  afterEach(() => {
    vi.doUnmock("./utils/download");
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.history.replaceState({}, "", "/daily");
    document.body.innerHTML = "";
  });

  it("downloads today's target when its pill is clicked", async () => {
    await import("./dowload-tools.js");
    await tick(150);

    expect(document.querySelectorAll(".pill")[1].style.cursor).toBe("pointer");
    document.querySelectorAll(".pill")[1].click();

    expect(download).toHaveBeenCalledExactlyOnceWith(IMG);
  });

  it("leaves the other days alone", async () => {
    await import("./dowload-tools.js");
    await tick(150);

    pill().click();

    expect(pill().style.cursor).toBe("");
    expect(download).not.toHaveBeenCalled();
  });

  it("does nothing outside the daily page", async () => {
    window.history.replaceState({}, "", "/play/123");

    await import("./dowload-tools.js");
    await tick(150);

    expect(document.querySelectorAll(".pill")[1].style.cursor).toBe("");
  });

  it("unhooks the pill once the user leaves the daily page", async () => {
    await import("./dowload-tools.js");
    await tick(150);
    const today = document.querySelectorAll(".pill")[1];

    navigateAway();
    today.click();

    expect(today.style.cursor).toBe("");
    expect(download).not.toHaveBeenCalled();
  });
});
