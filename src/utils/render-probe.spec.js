/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAPTURE_TAB } from "./capture-tab";
import { createProbe, PREFIX, PROBE_ID } from "./render-probe";

const DATA_URL = "data:image/png;base64,shot";
/** A render painted all over, in white. */
const IMAGE = { data: new Uint8ClampedArray(400 * 300 * 4).fill(255) };

/** What a capture shows before the document is painted: the iframe's background. */
function unpainted({ at } = {}) {
  const data = new Uint8ClampedArray(400 * 300 * 4).fill(255);
  for (let offset = 0; offset < data.length; offset += 4) {
    const x = (offset / 4) % 400;
    const y = Math.floor(offset / 4 / 400);
    if (undefined === at || (x === at[0] && y === at[1])) {
      data.set([1, 2, 3], offset);
    }
  }
  return { data };
}

let renders;

let contexts;
let shot;
let swatchColor;
let shownAtCapture;

function stubImaging({ density = 1 } = {}) {
  Object.defineProperty(window, "devicePixelRatio", {
    configurable: true,
    value: density,
  });
  shot = { width: window.innerWidth * density, close: vi.fn() };
  swatchColor = [153, 153, 255];
  renders = [];
  contexts = [];
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: vi.fn(() => {
        shownAtCapture = probe().classList.contains("is-shown");
        return Promise.resolve({ dataUrl: DATA_URL });
      }),
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ blob: () => Promise.resolve("blob") })),
  );
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(() => Promise.resolve(shot)),
  );
  vi.stubGlobal("requestAnimationFrame", (callback) => {
    callback();
    return 0;
  });
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(width, height) {
        this.size = [width, height];
      }
      getContext(type, options) {
        const context = {
          type,
          options,
          canvas: this,
          drawImage: vi.fn(),
          getImageData: vi.fn((x, y, width) =>
            1 === width
              ? { data: [...swatchColor, 255] }
              : (renders.shift() ?? IMAGE),
          ),
        };
        contexts.push(context);
        return context;
      }
    },
  );
}

function anchor(left, top) {
  const element = document.createElement("div");
  element.getBoundingClientRect = () => ({ left, top });
  return element;
}

function expectResult(result, image, sRGB) {
  expect(result.image).toBe(image);
  expect(result.sRGB).toBe(sRGB);
}

function probe() {
  return document.getElementById(PROBE_ID);
}

function frame() {
  return probe().querySelector("iframe");
}

function render(instance, code, at = anchor(100, 50)) {
  return instance.render(code, at);
}

describe("createProbe", () => {
  let written;

  beforeEach(() => {
    stubImaging();
    shownAtCapture = undefined;
    // jsdom cannot write a document into an iframe.
    written = [];
    const calls = [];
    vi.spyOn(
      HTMLIFrameElement.prototype,
      "contentDocument",
      "get",
    ).mockReturnValue({
      open: () => calls.push("open"),
      write: (html) => calls.push(html),
      close: () => {
        calls.push("close");
        written.push(calls.splice(0));
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("adds one hidden, sandboxed iframe and its swatch", () => {
    createProbe();

    expect(document.querySelectorAll(`#${PROBE_ID}`)).toHaveLength(1);
    expect(probe().getAttribute("aria-hidden")).toBe("true");
    expect(probe().classList.contains("is-shown")).toBe(false);
    // Same-origin to be written in, like cssbattle's output; no scripts.
    expect(frame().getAttribute("sandbox")).toBe("allow-same-origin");
    expect(frame().getAttribute("scrolling")).toBe("no");
    expect(probe().querySelector(".cbt-probe-swatch > div")).not.toBeNull();
  });

  it("reads one canvas back for every render", () => {
    createProbe();

    expect(contexts).toHaveLength(1);
    expect(contexts[0].canvas.size).toEqual([400, 300]);
    expect(contexts[0].type).toBe("2d");
    expect(contexts[0].options).toEqual({ willReadFrequently: true });
  });

  it("writes cssbattle's prefix and the code, as cssbattle does", async () => {
    await render(createProbe(), "<p>a&b#</p>");

    expect(written).toEqual([
      ["open", "<style>body{overflow:hidden}</style><p>a&b#</p>", "close"],
    ]);
    expect(PREFIX).toBe("<style>body{overflow:hidden}</style>");
  });

  it("shows the probe over the output only for the capture", async () => {
    const instance = createProbe();

    const result = await render(instance, "<p>");

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: CAPTURE_TAB,
    });
    expect(shownAtCapture).toBe(true);
    expect(probe().classList.contains("is-shown")).toBe(false);
    expect(probe().style.left).toBe("100px");
    expect(probe().style.top).toBe("50px");
    expectResult(result, IMAGE, true);
  });

  it("cuts the 400×300 render out of the capture, then frees it", async () => {
    await render(createProbe(), "<p>");

    const [context] = contexts;
    expect(fetch).toHaveBeenCalledWith(DATA_URL);
    expect(createImageBitmap).toHaveBeenCalledWith("blob");
    expect(context.drawImage).toHaveBeenNthCalledWith(
      1,
      shot,
      100,
      50,
      400,
      300,
      0,
      0,
      400,
      300,
    );
    expect(context.getImageData).toHaveBeenNthCalledWith(1, 0, 0, 400, 300);
    expect(shot.close).toHaveBeenCalledOnce();
  });

  it("reads the middle of the swatch, right of the render", async () => {
    await render(createProbe(), "<p>");

    const [context] = contexts;
    expect(context.drawImage).toHaveBeenNthCalledWith(
      2,
      shot,
      502,
      52,
      1,
      1,
      0,
      0,
      1,
      1,
    );
    expect(context.getImageData).toHaveBeenNthCalledWith(2, 0, 0, 1, 1);
  });

  it("draws one device pixel per CSS pixel on a dense screen", async () => {
    stubImaging({ density: 2 });
    const instance = createProbe();

    await render(instance, "<p>", anchor(100.3, 50.2));

    // Snapped to the device pixel grid.
    expect(probe().style.left).toBe("100.5px");
    expect(probe().style.top).toBe("50px");
    expect(frame().style.zoom).toBe("0.5");
    expect(probe().querySelector(".cbt-probe-swatch").style.zoom).toBe("0.5");
    expect(contexts[0].drawImage).toHaveBeenNthCalledWith(
      1,
      shot,
      201,
      100,
      400,
      300,
      0,
      0,
      400,
      300,
    );
  });

  it.each([
    [[152, 154, 254], true],
    [[164, 165, 255], false],
    [[153, 153, 253], false],
  ])("tells the swatch %o from sRGB: %s", async (color, sRGB) => {
    const instance = createProbe();
    swatchColor = color;

    expectResult(await render(instance, "<p>"), IMAGE, sRGB);
  });

  it.each([
    ["left of the viewport", -1, 0],
    ["above the viewport", 0, -1],
    // 400 + 4 for the swatch, in a 1024 wide viewport.
    ["past the right edge", 621, 0],
    // 300 high, in a 768 high viewport.
    ["past the bottom edge", 0, 469],
  ])("renders nothing %s", async (_, left, top) => {
    const instance = createProbe();

    await expect(instance.render("<p>", anchor(left, top))).resolves.toBeNull();
    expect(written).toEqual([]);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it("fits a dense screen by its device size, right against the edges", async () => {
    stubImaging({ density: 2 });
    const instance = createProbe();

    // (400 + 4) / 2 = 202 wide, 150 high, in a 1024×768 viewport.
    expectResult(await render(instance, "<p>", anchor(822, 618)), IMAGE, true);
    await expect(instance.render("<p>", anchor(823, 0))).resolves.toBeNull();
    await expect(instance.render("<p>", anchor(0, 619))).resolves.toBeNull();
  });

  it("fits right in the top left corner of the viewport", async () => {
    const instance = createProbe();

    expectResult(await render(instance, "<p>", anchor(0, 0)), IMAGE, true);
  });

  it("waits two frames, so the document is on screen, before the capture", async () => {
    const frames = [];
    vi.stubGlobal("requestAnimationFrame", (callback) => frames.push(callback));
    const instance = createProbe();

    const done = render(instance, "<p>");
    await Promise.resolve();
    expect(frames).toHaveLength(1);
    frames.shift()();
    await Promise.resolve();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);
    frames.shift()();

    expectResult(await done, IMAGE, true);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce();
  });

  it("fits right in the corner of the viewport", async () => {
    const instance = createProbe();

    expectResult(await render(instance, "<p>", anchor(620, 468)), IMAGE, true);
  });

  it("shoots again until the document is painted", async () => {
    const instance = createProbe();
    renders = [unpainted(), unpainted({ at: [399, 299] })];

    expectResult(await render(instance, "<p>"), IMAGE, true);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(3);
    expect(shot.close).toHaveBeenCalledTimes(3);
    expect(probe().classList.contains("is-shown")).toBe(false);
  });

  it.each([
    [0, 0],
    [399, 0],
    [0, 299],
    [399, 299],
    [200, 150],
  ])("takes the document as not painted at %i,%i", async (x, y) => {
    const instance = createProbe();
    renders = [unpainted({ at: [x, y] })];

    await render(instance, "<p>");

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("takes a color next to the background as painted", async () => {
    const instance = createProbe();
    const image = unpainted();
    for (let offset = 2; offset < image.data.length; offset += 4) {
      image.data[offset] = 4;
    }
    renders = [image];

    expectResult(await render(instance, "<p>"), image, true);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce();
  });

  it("gives up after five captures of a document never painted", async () => {
    const instance = createProbe();
    renders = Array.from({ length: 6 }, () => unpainted());

    await expect(render(instance, "<p>")).rejects.toThrow(
      "The probe was never painted",
    );
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(5);
    expect(shot.close).toHaveBeenCalledTimes(5);
    expect(probe().classList.contains("is-shown")).toBe(false);
  });

  it("hides the probe again when the capture fails", async () => {
    const instance = createProbe();
    chrome.runtime.sendMessage.mockResolvedValue({ error: "Denied" });

    await expect(render(instance, "<p>")).rejects.toThrow("Denied");
    expect(probe().classList.contains("is-shown")).toBe(false);
  });

  it("frees the capture when it cannot be read", async () => {
    const instance = createProbe();
    contexts[0].drawImage.mockImplementation(() => {
      throw new Error("read");
    });

    await expect(render(instance, "<p>")).rejects.toThrow("read");
    expect(shot.close).toHaveBeenCalledOnce();
    expect(probe().classList.contains("is-shown")).toBe(false);
  });

  it("is removed by destroy", () => {
    createProbe().destroy();

    expect(probe()).toBeNull();
  });
});
