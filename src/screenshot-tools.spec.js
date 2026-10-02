/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./utils/download", () => ({
  download: vi.fn(() => Promise.resolve()),
  getFormattedDate: () => "2026-10-01",
}));

const DATA_URL = "data:image/png;base64,shot";
const BLOB_URL = "blob:https://cssbattle.dev/shot";

function stubChrome({ config = {}, response = { dataUrl: DATA_URL } } = {}) {
  return {
    storage: {
      sync: { get: vi.fn(() => Promise.resolve(config)) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: {
      getURL: (p) => `chrome-extension://test/${p}`,
      sendMessage: vi.fn(() => Promise.resolve(response)),
    },
  };
}

/** Everything a capture goes through that jsdom does not have. */
function stubImaging({ shotWidth = 2048 } = {}) {
  const shot = { width: shotWidth, close: vi.fn() };
  const canvases = [];
  const png = new Blob(["png"], { type: "image/png" });

  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ blob: () => Promise.resolve("raw") })),
  );
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(() => Promise.resolve(shot)),
  );
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(width, height) {
        this.width = width;
        this.height = height;
        this.drawImage = vi.fn();
        this.convertToBlob = vi.fn(() => Promise.resolve(png));
        canvases.push(this);
      }
      getContext() {
        return { drawImage: this.drawImage };
      }
    },
  );
  vi.stubGlobal(
    "ClipboardItem",
    class {
      constructor(items) {
        this.items = items;
      }
    },
  );
  const clipboard = {
    // Waits on the image, as Chrome does with a promise in a ClipboardItem.
    write: vi.fn(async ([item]) => {
      clipboard.written = await item.items["image/png"];
    }),
  };
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: clipboard,
  });
  URL.createObjectURL = vi.fn(() => BLOB_URL);
  URL.revokeObjectURL = vi.fn();

  return { shot, canvases, png, clipboard };
}

function rect(left, top, width, height) {
  return () => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  });
}

/** The output panel as cssbattle lays it out, with dom-tools' panel under it. */
function renderOutputPanel({ domTool = true } = {}) {
  document.body.innerHTML = `
    <div class="container__item--output">
      <div class="item__header">
        <div class="hstack"><span class="header__title">Output</span></div>
        <div class="header__extra-info">
          <div class="hstack"><label><input type="checkbox" /></label></div>
        </div>
      </div>
      <div class="item__content">
        <div class="target-container"><iframe></iframe></div>
        ${domTool ? `<div id="dom-tool"></div>` : ""}
      </div>
    </div>`;
  $(".target-container").getBoundingClientRect = rect(500, 100, 400, 300);
  if (domTool) {
    $("#dom-tool").getBoundingClientRect = rect(480, 420, 440, 200);
  }
}

function $(selector) {
  return document.querySelector(selector);
}

function button() {
  return document.getElementById("output-screenshot");
}

function tick(ms = 400) {
  return vi.advanceTimersByTimeAsync(ms);
}

async function mountTool(options) {
  vi.stubGlobal("chrome", stubChrome(options));
  await import("./screenshot-tools.js");
  await tick();
}

async function shoot() {
  button().click();
  await tick();
}

describe("screenshot-tools", () => {
  let download;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    ({ download } = await import("./utils/download"));
    download.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete navigator.clipboard;
    delete URL.createObjectURL;
    delete URL.revokeObjectURL;
    document.body.innerHTML = "";
    document.body.className = "";
    window.history.replaceState({}, "", "/play/123");
  });

  describe("button", () => {
    it("sits at the left end of the header, out of the output tools' strip", async () => {
      renderOutputPanel();
      await mountTool();

      expect(button().parentElement).toBe($(".item__header > .hstack"));
      expect(button().nextElementSibling).toBe($(".header__title"));
      expect($(".header__extra-info #output-screenshot")).toBeNull();
    });

    it("looks like cssbattle's own buttons", async () => {
      renderOutputPanel();
      await mountTool();

      expect([...button().classList]).toEqual(
        expect.arrayContaining(["button", "button--mini"]),
      );
      expect(button().textContent).toBe("📷");
      expect(button().getAttribute("aria-label")).toBe("Screenshot the output");
    });

    it("replaces a button left over by a previous mount", async () => {
      renderOutputPanel();
      $(".item__header > .hstack").insertAdjacentHTML(
        "afterbegin",
        `<button id="output-screenshot"></button>`,
      );
      await mountTool();

      expect(document.querySelectorAll("#output-screenshot")).toHaveLength(1);
    });

    it("goes away when leaving the battle", async () => {
      renderOutputPanel();
      await mountTool();

      window.history.replaceState({}, "", "/leaderboard");
      await tick(300);

      expect(button()).toBeNull();
    });
  });

  describe("capture", () => {
    it("crops the output and the DOM panel out of the tab, in device pixels", async () => {
      renderOutputPanel();
      const { shot, canvases } = stubImaging({ shotWidth: 2048 });
      await mountTool();

      await shoot();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce();
      expect(fetch).toHaveBeenCalledWith(DATA_URL);
      // The tab is 1024px wide in jsdom, captured at twice that.
      const [canvas] = canvases;
      expect([canvas.width, canvas.height]).toEqual([880, 1040]);
      expect(canvas.drawImage).toHaveBeenCalledWith(
        shot,
        960,
        200,
        880,
        1040,
        0,
        0,
        880,
        1040,
      );
      expect(canvas.convertToBlob).toHaveBeenCalledWith({ type: "image/png" });
      expect(shot.close).toHaveBeenCalledOnce();
    });

    it("takes the output alone without the DOM panel", async () => {
      renderOutputPanel({ domTool: false });
      const { canvases } = stubImaging({ shotWidth: 1024 });
      await mountTool();

      await shoot();

      expect(canvases[0].drawImage).toHaveBeenCalledWith(
        expect.anything(),
        500,
        100,
        400,
        300,
        0,
        0,
        400,
        300,
      );
    });

    it("leaves out a DOM panel with no size", async () => {
      renderOutputPanel();
      $("#dom-tool").getBoundingClientRect = rect(0, 0, 0, 0);
      const { canvases } = stubImaging({ shotWidth: 1024 });
      await mountTool();

      await shoot();

      expect([canvases[0].width, canvases[0].height]).toEqual([400, 300]);
    });

    it("keeps to the viewport", async () => {
      renderOutputPanel();
      $(".target-container").getBoundingClientRect = rect(-20, -10, 400, 300);
      $("#dom-tool").getBoundingClientRect = rect(800, 600, 400, 400);
      const { canvases } = stubImaging({ shotWidth: 1024 });
      await mountTool();

      await shoot();

      expect(canvases[0].drawImage).toHaveBeenCalledWith(
        expect.anything(),
        0,
        0,
        1024,
        768,
        0,
        0,
        1024,
        768,
      );
    });

    it("hides the hints and toasts while the tab is captured", async () => {
      renderOutputPanel();
      stubImaging();
      await mountTool();
      const seen = [];
      chrome.runtime.sendMessage.mockImplementation(() => {
        seen.push(document.body.classList.contains("cbt-capturing"));
        return Promise.resolve({ dataUrl: DATA_URL });
      });

      await shoot();

      expect(seen).toEqual([true]);
      expect(document.body.classList.contains("cbt-capturing")).toBe(false);
    });

    it("turns the button off until the shot is done", async () => {
      renderOutputPanel();
      stubImaging();
      await mountTool();

      button().click();
      expect(button().disabled).toBe(true);

      await tick();
      expect(button().disabled).toBe(false);
    });
  });

  describe("action", () => {
    it("downloads the PNG by default, named after the battle", async () => {
      renderOutputPanel();
      const { png, clipboard } = stubImaging();
      await mountTool();

      await shoot();

      expect(URL.createObjectURL).toHaveBeenCalledWith(png);
      expect(download).toHaveBeenCalledWith(BLOB_URL, "123-2026-10-01.png");
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(BLOB_URL);
      expect(clipboard.write).not.toHaveBeenCalled();
    });

    it("copies the PNG to the clipboard", async () => {
      renderOutputPanel();
      const { png, clipboard } = stubImaging();
      await mountTool({ config: { strScreenshotAction: "copy" } });

      await shoot();

      expect(clipboard.written).toBe(png);
      expect(download).not.toHaveBeenCalled();
      expect($("#cbt-snackbar").textContent).toContain(
        "Screenshot copied to clipboard",
      );
    });

    it("copies and downloads the PNG", async () => {
      renderOutputPanel();
      const { png, clipboard } = stubImaging();
      await mountTool({ config: { strScreenshotAction: "both" } });

      await shoot();

      expect(clipboard.written).toBe(png);
      expect(download).toHaveBeenCalledWith(BLOB_URL, "123-2026-10-01.png");
    });

    it("reads the setting on each shot", async () => {
      renderOutputPanel();
      const { clipboard } = stubImaging();
      await mountTool();
      chrome.storage.sync.get.mockResolvedValue({
        strScreenshotAction: "copy",
      });

      await shoot();

      expect(clipboard.write).toHaveBeenCalledOnce();
      expect(download).not.toHaveBeenCalled();
    });

    it("frees the image even when the download throws", async () => {
      renderOutputPanel();
      stubImaging();
      vi.spyOn(console, "error").mockImplementation(() => {});
      download.mockRejectedValueOnce(new Error("disk full"));
      await mountTool();

      await shoot();

      expect(URL.revokeObjectURL).toHaveBeenCalledWith(BLOB_URL);
    });
  });

  describe("failure", () => {
    beforeEach(() => {
      vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("says so when the tab cannot be captured", async () => {
      renderOutputPanel();
      stubImaging();
      await mountTool({ response: { error: "Missing <all_urls>" } });

      await shoot();

      expect(console.error).toHaveBeenCalledWith(
        "[cbt] screenshot-tools:",
        new Error("Missing <all_urls>"),
      );
      expect($("#cbt-snackbar").textContent).toContain("Screenshot failed");
      expect(download).not.toHaveBeenCalled();
      expect(document.body.classList.contains("cbt-capturing")).toBe(false);
      expect(button().disabled).toBe(false);
    });

    it("captures nothing when the output is out of view", async () => {
      renderOutputPanel({ domTool: false });
      $(".target-container").getBoundingClientRect = rect(0, -400, 400, 300);
      stubImaging();
      await mountTool();

      await shoot();

      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        "[cbt] screenshot-tools:",
        new Error("The output is out of view"),
      );
    });
  });
});
