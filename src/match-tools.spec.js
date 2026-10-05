/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./utils/render-code", () => ({
  renderCode: vi.fn(),
  holdRenderer: vi.fn(() => Promise.resolve({ ok: true })),
  releaseRenderer: vi.fn(() => Promise.resolve()),
}));
vi.mock("./utils/screen-colors", () => ({
  targetAsShown: vi.fn(() => Promise.resolve(TARGET)),
}));
vi.mock("./utils/pixel-match", async (importOriginal) => ({
  ...(await importOriginal()),
  matchImages: vi.fn(),
}));

const TARGET = { kind: "target" };
const RENDER = { kind: "render" };
const DIFF = { kind: "diff" };

function badge() {
  return document.getElementById("cbt-match");
}

function wrongPixels() {
  return document.getElementById("cbt-match-pixels");
}

function tool() {
  return document.getElementById("cbt-match-tool");
}

function toggle() {
  return document.getElementById("cbt-match-switch");
}

function editor() {
  return document.querySelector("[contenteditable]");
}

function hint() {
  return badge().getAttribute("data-hint");
}

function tick(ms) {
  return vi.advanceTimersByTimeAsync(ms);
}

/** Leaves /play/<id>, which tears every play-page tool down. */
function navigateAway() {
  window.history.pushState({}, "", "/leaderboard");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Types in the editor: the code changes, then the key is pressed. */
function type(code, event = new KeyboardEvent("keydown", { key: "a" })) {
  editor().textContent = code;
  editor().dispatchEvent(event);
}

describe("match-tools", () => {
  let renderer;
  let matchImages;
  let targetImageData;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    document.body.className = "";
    document.body.innerHTML = `
      <div class="Editor-module__abc">
        <div class="item__header">
          <div class="header__extra-info"><div class="hstack"><span id="other"></span></div></div>
        </div>
      </div>
      <div contenteditable="true"><p></p></div>
      <div class="container__item--target"><img src="https://cssutils.com/icon.png"><img class="levelpage__target" src="/targets/12.png"></div>
      <div class="target-container"></div>`;
  });

  afterEach(async () => {
    // Tears the mount down: a mount left behind would answer the next tests.
    navigateAway();
    await tick(0);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    window.history.replaceState({}, "", "/play/123");
    delete document.visibilityState;
    document.body.innerHTML = "";
  });

  async function mountTool({ match = 1, config = { enableMatch: true } } = {}) {
    vi.stubGlobal("chrome", {
      storage: {
        sync: {
          get: vi.fn(() => Promise.resolve(config)),
          set: vi.fn(() => Promise.resolve()),
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });
    ({ matchImages } = await import("./utils/pixel-match"));
    ({ targetAsShown: targetImageData } = await import(
      "./utils/screen-colors"
    ));
    renderer = await import("./utils/render-code");
    // The mocked modules outlive the test: start them afresh.
    renderer.renderCode.mockReset().mockResolvedValue(RENDER);
    renderer.holdRenderer.mockClear();
    renderer.releaseRenderer.mockClear();
    targetImageData.mockReset().mockResolvedValue(TARGET);
    matchImages.mockReset().mockReturnValue({
      match,
      diffPixels: Math.round((1 - match) * 120000),
      diff: DIFF,
    });
    await import("./match-tools.js");
    await tick(150);
  }

  function renders() {
    return renderer.renderCode.mock.calls.map(([code]) => code);
  }

  describe("the switch", () => {
    it("is off by default: no renderer, no render, nothing but the switch", async () => {
      await mountTool({ config: {} });
      await tick(0);

      expect(toggle().getAttribute("aria-checked")).toBe("false");
      expect(toggle().classList.contains("button--primary")).toBe(false);
      expect(toggle().classList.contains("button--mini")).toBe(true);
      expect(tool().classList.contains("is-on")).toBe(false);
      expect(renderer.holdRenderer).not.toHaveBeenCalled();

      type("<b></b>");
      await tick(500);
      expect(renderer.renderCode).not.toHaveBeenCalled();
    });

    it("explains the banner, and that the result is approximate", async () => {
      await mountTool({ config: {} });

      const label = toggle();
      expect(label.getAttribute("data-hint")).toBe(
        "Live match estimate, approximate. While on, your code is rendered in a hidden tab through Chrome's debugger: that is why Chrome shows a debugging banner.",
      );
      expect(label.getAttribute("aria-label")).toBe(
        label.getAttribute("data-hint"),
      );
      expect(toggle().getAttribute("role")).toBe("switch");
    });

    it("stays as the user left it", async () => {
      await mountTool();
      await tick(0);

      expect(toggle().getAttribute("aria-checked")).toBe("true");
      expect(toggle().classList.contains("button--primary")).toBe(true);
      expect(tool().classList.contains("is-on")).toBe(true);
      expect(renderer.holdRenderer).toHaveBeenCalledOnce();
    });

    it("switched on, keeps it so, gets the renderer and measures at once", async () => {
      await mountTool({ config: {} });
      editor().textContent = "<b></b>";

      toggle().click();
      await tick(0);

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        enableMatch: true,
      });
      expect(tool().classList.contains("is-on")).toBe(true);
      expect(renderer.holdRenderer).toHaveBeenCalledOnce();
      expect(renders()).toEqual(["<b></b>"]);
      expect(badge().textContent).toBe("≈100%");
    });

    it("switched off, keeps it so, lets the renderer go and forgets the match", async () => {
      await mountTool();
      type("<b></b>");
      await tick(500);

      toggle().click();
      await tick(0);

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        enableMatch: false,
      });
      expect(tool().classList.contains("is-on")).toBe(false);
      expect(renderer.releaseRenderer).toHaveBeenCalledOnce();
      expect(badge().textContent).toBe("—");
      expect(hint()).toBe("Type to measure the match");

      // On again: the same code is measured again.
      toggle().click();
      await tick(0);
      expect(renders()).toEqual(["<b></b>", "<b></b>"]);
    });

    it("switched off, drops the measure still waiting for the pause", async () => {
      await mountTool();

      type("<b></b>");
      toggle().click();
      await tick(500);

      expect(renderer.renderCode).not.toHaveBeenCalled();
    });

    it("switched off, drops the render on its way", async () => {
      await mountTool({ match: 0.5 });
      let finish;
      renderer.renderCode.mockImplementationOnce(
        () => new Promise((resolve) => (finish = resolve)),
      );
      type("<b></b>");
      await tick(500);

      toggle().click();
      finish(RENDER);
      await tick(0);

      expect(matchImages).not.toHaveBeenCalled();
      expect(badge().textContent).toBe("—");
    });

    it("follows the switch of another tab", async () => {
      await mountTool({ config: {} });
      const [[onChange]] = chrome.storage.onChanged.addListener.mock.calls;

      onChange({ enableMatch: { newValue: true } });
      expect(toggle().getAttribute("aria-checked")).toBe("true");
      expect(renderer.holdRenderer).toHaveBeenCalledOnce();
      // Switched elsewhere: no edit here, so no render.
      expect(renderer.renderCode).not.toHaveBeenCalled();

      onChange({ enableMatch: { newValue: false } });
      expect(toggle().getAttribute("aria-checked")).toBe("false");
      expect(renderer.releaseRenderer).toHaveBeenCalledOnce();
    });

    it("measures nothing when switched on while the option hides it", async () => {
      await mountTool({ config: { hideMatch: true } });
      editor().textContent = "<b></b>";

      toggle().click();
      await tick(0);

      expect(renderer.holdRenderer).not.toHaveBeenCalled();
      expect(renderer.renderCode).not.toHaveBeenCalled();
    });
  });

  describe("before any edit", () => {
    it("shows a dash, asking to type", async () => {
      await mountTool();

      expect(badge().textContent).toBe("—");
      expect(hint()).toBe("Type to measure the match");
      expect(badge().getAttribute("aria-label")).toBe(hint());
    });

    it("sits first in the editor header without the minified count", async () => {
      await mountTool();

      expect(document.querySelector(".hstack").firstElementChild).toBe(tool());
    });

    it("sits right after the minified count", async () => {
      document
        .querySelector(".hstack")
        .insertAdjacentHTML(
          "afterbegin",
          `<span id="nb-minified-characters"></span>`,
        );

      await mountTool();

      expect(
        document.getElementById("nb-minified-characters").nextElementSibling,
      ).toBe(tool());
    });

    it("gets the renderer ready from the page load, without rendering", async () => {
      await mountTool();
      await tick(0);

      expect(renderer.holdRenderer).toHaveBeenCalledOnce();
      expect(renderer.renderCode).not.toHaveBeenCalled();
    });

    it("never gets the renderer ready while the option hides the match", async () => {
      await mountTool({ config: { enableMatch: true, hideMatch: true } });
      await tick(0);

      expect(renderer.holdRenderer).not.toHaveBeenCalled();
    });

    it("gets the renderer ready, or lets it go, as the option changes", async () => {
      await mountTool({ config: { enableMatch: true, hideMatch: true } });
      const [[onChange]] = chrome.storage.onChanged.addListener.mock.calls;

      onChange({ strDefaultCode: { newValue: "" } });
      expect(renderer.holdRenderer).not.toHaveBeenCalled();

      onChange({ hideMatch: { newValue: false } });
      onChange({ hideMatch: { newValue: false } });
      expect(renderer.holdRenderer).toHaveBeenCalledOnce();

      onChange({ hideMatch: { newValue: true } });
      expect(renderer.releaseRenderer).toHaveBeenCalledOnce();
    });

    it("stops following the option once the battle is left", async () => {
      await mountTool();
      const [[onChange]] = chrome.storage.onChanged.addListener.mock.calls;

      navigateAway();
      await tick(0);

      expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledWith(
        onChange,
      );
    });

    it("gets no renderer when the battle is left before the option is read", async () => {
      let answer;
      vi.stubGlobal("chrome", {
        storage: {
          sync: {
            get: vi.fn(() => new Promise((resolve) => (answer = resolve))),
          },
          onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
        },
      });
      ({ matchImages } = await import("./utils/pixel-match"));
      renderer = await import("./utils/render-code");
      renderer.holdRenderer.mockClear();
      renderer.releaseRenderer.mockClear();
      await import("./match-tools.js");
      await tick(150);

      navigateAway();
      await tick(0);
      answer({ enableMatch: true });
      await tick(0);

      expect(renderer.holdRenderer).not.toHaveBeenCalled();
      expect(renderer.releaseRenderer).not.toHaveBeenCalled();
    });

    it("still mounts when the renderer cannot get ready", async () => {
      const { holdRenderer } = await import("./utils/render-code");
      holdRenderer.mockRejectedValueOnce(new Error("no debugger"));

      await mountTool();
      await tick(0);

      expect(badge()).not.toBeNull();
      expect(console.debug).toHaveBeenCalledWith(
        "[cbt] match-tools: no renderer",
        expect.any(Error),
      );
    });

    it("renders nothing on its own, however long it waits", async () => {
      await mountTool();
      await tick(60000);

      expect(renderer.renderCode).not.toHaveBeenCalled();
    });

    it("renders nothing when the editor changes without an edit", async () => {
      await mountTool();

      // cssbattle re-rendering its editor.
      editor().textContent = "<a></a>";
      await tick(60000);

      expect(renderer.renderCode).not.toHaveBeenCalled();
    });
  });

  describe("after an edit", () => {
    it("renders the code, once the typing stops", async () => {
      await mountTool();

      type("<b></b>");
      await tick(499);
      expect(renderer.renderCode).not.toHaveBeenCalled();

      await tick(1);
      expect(renders()).toEqual(["<b></b>"]);
    });

    it("measures once for a burst of keystrokes", async () => {
      await mountTool();

      type("<b>");
      await tick(300);
      type("<b></b>");
      await tick(300);
      type("<b></b><i>");
      await tick(500);

      expect(renders()).toEqual(["<b></b><i>"]);
    });

    it.each(["paste", "cut", "drop"])("measures after a %s", async (kind) => {
      await mountTool();

      type("<b></b>", new Event(kind));
      await tick(500);

      expect(renders()).toEqual(["<b></b>"]);
    });

    it("measures after the extension rewrites the code", async () => {
      await mountTool();
      const { notifyCodeChanged } = await import("./utils/change-code");

      editor().textContent = "<b></b>";
      notifyCodeChanged();
      await tick(500);

      expect(renders()).toEqual(["<b></b>"]);
    });

    it("compares the render with the target", async () => {
      await mountTool();

      type("<b></b>");
      await tick(500);

      expect(targetImageData).toHaveBeenCalledWith(
        "https://cssbattle.dev/targets/12.png",
      );
      expect(matchImages).toHaveBeenCalledWith(TARGET, RENDER);
    });

    it("tells the output the wrong pixels", async () => {
      await mountTool({ match: 0.995 });
      const listener = vi.fn();
      document.addEventListener("cbt:match-measured", listener);

      type("<b></b>");
      await tick(500);

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0][0].detail).toEqual({
        match: 0.995,
        diffPixels: 600,
        diff: DIFF,
      });
      document.removeEventListener("cbt:match-measured", listener);
    });

    it("renders nothing more for an edit that leaves the code as it was", async () => {
      await mountTool();

      type("<b></b>");
      await tick(500);
      type("<b></b>");
      await tick(500);

      expect(renders()).toEqual(["<b></b>"]);
    });

    it("measures each new code", async () => {
      await mountTool();

      type("<b></b>");
      await tick(500);
      type("<i></i>");
      await tick(500);

      expect(renders()).toEqual(["<b></b>", "<i></i>"]);
    });
  });

  describe("the badge", () => {
    it("shows 100% only with no wrong pixel, in green", async () => {
      await mountTool({ match: 1 });

      type("<b></b>");
      await tick(500);

      expect(badge().textContent).toBe("≈100%");
      expect(badge().classList.contains("is-perfect")).toBe(true);
    });

    it("never rounds a few wrong pixels up to 100%", async () => {
      await mountTool({ match: 0.9998 });

      type("<b></b>");
      await tick(500);

      // 24 wrong pixels: what cssbattle may show as 99.9%.
      expect(badge().textContent).toBe("≈99.98%");
      expect(badge().classList.contains("is-perfect")).toBe(false);
      expect(hint()).toContain("24 wrong pixels");
    });

    it("counts the wrong pixels from 99%, out of 120,000", async () => {
      await mountTool({ match: 0.99 });

      type("<b></b>");
      await tick(500);

      expect(wrongPixels().hidden).toBe(false);
      expect(wrongPixels().textContent).toBe("1200 px");
      expect(wrongPixels().getAttribute("data-hint")).toBe(
        "Wrong pixels out of 120,000",
      );
      expect(wrongPixels().getAttribute("aria-label")).toBe(
        "Wrong pixels out of 120,000",
      );
    });

    it("shows no count at 100%, with no wrong pixel", async () => {
      await mountTool({ match: 1 });

      type("<b></b>");
      await tick(500);

      expect(wrongPixels().hidden).toBe(true);
    });

    it("counts a single wrong pixel", async () => {
      await mountTool({ match: 1 - 1 / 120000 });

      type("<b></b>");
      await tick(500);

      expect(wrongPixels().hidden).toBe(false);
      expect(wrongPixels().textContent).toBe("1 px");
    });

    it("leaves the wrong pixels uncounted below 99%", async () => {
      await mountTool({ match: 1 - 1201 / 120000 });

      type("<b></b>");
      await tick(500);

      expect(wrongPixels().hidden).toBe(true);
    });

    it("counts nothing before a measure, nor after a failed one", async () => {
      await mountTool({ match: 1 });
      expect(wrongPixels().hidden).toBe(true);

      type("<b></b>");
      await tick(500);
      renderer.renderCode.mockRejectedValueOnce(new Error("gone"));
      type("<i></i>");
      await tick(500);

      expect(wrongPixels().hidden).toBe(true);
    });

    it("drops the trailing zeros", async () => {
      await mountTool({ match: 0.99979 });

      type("<b></b>");
      await tick(500);

      expect(badge().textContent).toBe("≈99.979%");
    });

    it("shows a single wrong pixel, to five decimals", async () => {
      await mountTool({ match: 1 - 1 / 120000 });

      type("<b></b>");
      await tick(500);

      expect(badge().textContent).toBe("≈99.99917%");
      expect(hint()).toContain("Estimated match: 99.99917%, 1 wrong pixels.");
    });

    it("explains the match and the score of the minified code", async () => {
      await mountTool({ match: 0.995 });

      type("<b>  </b>");
      await tick(500);

      expect(hint()).toBe(
        "Estimated match: 99.5%, 600 wrong pixels. Estimated score: 599.99 for 7 characters once minified. Approximate: cssbattle's renderer may differ from this computer's.",
      );
      expect(badge().getAttribute("aria-label")).toBe(hint());
    });

    it("says why it is even more approximate for code that depends on the fonts", async () => {
      await mountTool({ match: 0.5 });

      type("<style>*{margin:5ch}");
      await tick(500);

      expect(badge().textContent).toBe("≈50%");
      expect(hint()).toContain("its own Linux fonts");
    });

    it("drops the font reason once the code no longer needs it", async () => {
      await mountTool();

      type("<style>*{margin:5ch}");
      await tick(500);
      type("<style>*{margin:5px}");
      await tick(500);

      expect(badge().textContent).toBe("≈100%");
      expect(hint()).not.toContain("fonts");
      expect(hint()).toContain("Approximate");
    });

    it("toggles the pixel diff of the output on a click", async () => {
      document
        .querySelector(".target-container")
        .insertAdjacentHTML(
          "beforeend",
          `<input id="output-pixel-diff-input" type="checkbox">`,
        );
      await mountTool();

      badge().click();

      expect(document.getElementById("output-pixel-diff-input").checked).toBe(
        true,
      );
      expect(renderer.renderCode).not.toHaveBeenCalled();
    });

    it("does nothing on a click without the pixel diff", async () => {
      await mountTool();

      expect(() => badge().click()).not.toThrow();
    });
  });

  describe("when it cannot measure", () => {
    it("says why when the render fails", async () => {
      await mountTool({ match: 0.5 });
      type("<b></b>");
      await tick(500);
      renderer.renderCode.mockRejectedValueOnce(
        new Error("Debugging was cancelled"),
      );

      type("<i></i>");
      await tick(500);

      expect(badge().textContent).toBe("—");
      expect(badge().classList.contains("is-perfect")).toBe(false);
      expect(hint()).toBe(
        "The match could not be measured: Debugging was cancelled",
      );
      expect(console.debug).toHaveBeenCalledWith(
        "[cbt] match-tools:",
        expect.any(Error),
      );
    });

    it("measures the same code again once the render works", async () => {
      await mountTool();
      renderer.renderCode.mockRejectedValueOnce(new Error("busy"));

      type("<b></b>");
      await tick(500);
      type("<b></b>");
      await tick(500);

      expect(renders()).toEqual(["<b></b>", "<b></b>"]);
      expect(badge().textContent).toBe("≈100%");
    });

    it("says why when the target cannot be read", async () => {
      await mountTool();
      targetImageData.mockRejectedValueOnce(new Error("offline"));

      type("<b></b>");
      await tick(500);

      expect(hint()).toBe("The match could not be measured: offline");
      expect(renderer.renderCode).not.toHaveBeenCalled();
    });

    it("renders nothing while the option hides it", async () => {
      await mountTool({ config: { enableMatch: true, hideMatch: true } });

      type("<b></b>");
      await tick(500);

      expect(renderer.renderCode).not.toHaveBeenCalled();
    });

    it("renders nothing while the tab is hidden, and drops the edit", async () => {
      await mountTool();
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });

      type("<b></b>");
      await tick(500);
      delete document.visibilityState;
      await tick(60000);

      expect(renderer.renderCode).not.toHaveBeenCalled();
    });

    it("renders nothing while the editor is partly rendered", async () => {
      await mountTool();
      type("<b></b>");
      await tick(500);
      renderer.renderCode.mockClear();
      editor().innerHTML = `<div class="cm-line">a</div><div class="cm-gap"></div>`;

      editor().dispatchEvent(new KeyboardEvent("keydown"));
      await tick(500);

      expect(renderer.renderCode).not.toHaveBeenCalled();
    });
  });

  describe("one render at a time", () => {
    it("measures an edit made meanwhile right after, with the latest code", async () => {
      await mountTool();
      let finish;
      renderer.renderCode.mockImplementationOnce(
        () => new Promise((resolve) => (finish = resolve)),
      );

      type("<b></b>");
      await tick(500);
      type("<i></i>");
      await tick(500);
      type("<u></u>");
      await tick(500);
      expect(renders()).toEqual(["<b></b>"]);

      finish(RENDER);
      await tick(0);

      expect(renders()).toEqual(["<b></b>", "<u></u>"]);
    });
  });

  describe("on navigation", () => {
    it("removes the badge, releases the renderer, and stops listening", async () => {
      await mountTool();
      await tick(0);

      navigateAway();
      await tick(0);

      expect(badge()).toBeNull();
      expect(renderer.releaseRenderer).toHaveBeenCalledOnce();

      type("<b></b>");
      await tick(500);
      const { notifyCodeChanged } = await import("./utils/change-code");
      notifyCodeChanged();
      await tick(500);
      expect(renderer.renderCode).not.toHaveBeenCalled();
    });

    it("lets a release that fails be", async () => {
      await mountTool();
      await tick(0);
      renderer.releaseRenderer.mockRejectedValueOnce(new Error("worker gone"));

      navigateAway();
      await tick(0);

      expect(badge()).toBeNull();
    });

    it("drops a measure still pending", async () => {
      await mountTool();
      type("<b></b>");

      navigateAway();
      await tick(500);

      expect(renderer.renderCode).not.toHaveBeenCalled();
    });

    it("drops a measure that ends after it", async () => {
      await mountTool();
      const listener = vi.fn();
      document.addEventListener("cbt:match-measured", listener);
      let finish;
      renderer.renderCode.mockImplementationOnce(
        () => new Promise((resolve) => (finish = resolve)),
      );
      type("<b></b>");
      await tick(500);
      type("<i></i>");
      await tick(500);

      navigateAway();
      finish(RENDER);
      await tick(500);

      expect(matchImages).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();
      expect(renders()).toEqual(["<b></b>"]);
      document.removeEventListener("cbt:match-measured", listener);
    });
  });
});
