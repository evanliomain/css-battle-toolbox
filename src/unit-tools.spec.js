/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stubChrome() {
  return {
    storage: {
      sync: { get: vi.fn(() => Promise.resolve({})) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: { getURL: (p) => `chrome-extension://test/${p}` },
  };
}

// Fake timers, so the polls a test leaves running die with it instead of
// firing once the jsdom environment is gone.
function tick(ms = 0) {
  return vi.advanceTimersByTimeAsync(ms);
}

function calcFrame() {
  return document.getElementById("calcFrame");
}

function calcDiv() {
  return calcFrame().contentWindow.document.getElementById("calcDiv");
}

/**
 * jsdom does no layout, so every box measures 0. The tool measures a unit by
 * setting `font` and `width` on its hidden div, so this resolves that width
 * the way a browser would, against the 400x300 frame.
 *
 * @param {string[]} unsupported Units that lay out as 0, like a browser that does not know them.
 */
function fakeLayout(unsupported = []) {
  const div = calcDiv();
  div.getBoundingClientRect = () => {
    const style = div.getAttribute("style") ?? "";
    const [, size = "16", line = "18"] =
      /font:([\d.]+)px(?:\/([\d.]+)px)?/.exec(style) ?? [];
    const fontSize = Number(size);
    const units = {
      px: 1,
      vw: 4,
      vh: 3,
      in: 96,
      cm: 96 / 2.54,
      mm: 96 / 25.4,
      pt: 96 / 72,
      pc: 16,
      em: fontSize,
      ex: fontSize / 2,
      q: 96 / 101.6,
      ch: fontSize / 2,
      lh: Number(line),
      cap: fontSize * 0.7,
    };
    const match = /width:([\d.]+)([a-z]+);/.exec(style);
    const unit = match?.[2];
    if (!match || !(unit in units) || unsupported.includes(unit)) {
      return { width: 0 };
    }
    return { width: Number(match[1]) * units[unit] };
  };
}

function type(id, value) {
  const input = document.getElementById(id);
  input.value = value;
  input.dispatchEvent(new Event("input"));
}

/** The result grid, as [value, offset] pairs. */
function results() {
  const spans = [...document.querySelectorAll("#unit-minify-result span")];
  const pairs = [];
  for (let i = 0; i < spans.length; i += 2) {
    pairs.push([spans[i].textContent.trim(), spans[i + 1].textContent.trim()]);
  }
  return pairs;
}

function editor() {
  return document.querySelector("[contenteditable]");
}

/** jsdom has no `innerText`, which is what the tool reads the code from. */
function setCode(code) {
  editor().textContent = code;
  editor().innerText = code;
}

describe("unit-tools", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal("chrome", stubChrome());
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    document.body.innerHTML = `
      <div contenteditable="true"></div>
      <div class="container__item--target">
        <div class="item__content"><div class="target"></div></div>
      </div>`;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    // The next test's router starts from wherever this one left the URL.
    window.history.replaceState({}, "", "/play/123");
    document.body.innerHTML = "";
  });

  async function load(unsupported) {
    await import("./unit-tools.js");
    await tick();
    fakeLayout(unsupported);
  }

  describe("mounting", () => {
    it("adds the panel after the target and a hidden measuring frame", async () => {
      await load();

      const target = document.querySelector(".item__content > div");
      expect(target.nextElementSibling.id).toBe("unit-golf-tool");
      expect(calcFrame().style.zIndex).toBe("-1");
      expect(calcDiv()).not.toBeNull();
    });

    it("reaches the frame document through contentWindow when contentDocument is not exposed", async () => {
      vi.spyOn(
        HTMLIFrameElement.prototype,
        "contentDocument",
        "get",
      ).mockReturnValue(null);

      await load();

      expect(calcDiv()).not.toBeNull();
    });

    it("removes the panel and the frame when leaving the battle", async () => {
      await load();

      window.history.pushState({}, "", "/");
      await tick(300);

      expect(document.getElementById("unit-golf-tool")).toBeNull();
      expect(calcFrame()).toBeNull();
    });
  });

  describe("converting a length", () => {
    it("lists the equivalents shortest first, exact ones before close ones", async () => {
      await load();

      type("unit-input-background", "96px");

      const found = results();
      expect(found.slice(0, 3)).toEqual([
        ["1in", ""],
        ["6pc", ""],
        ["6em", ""],
      ]);
      // 96px is not a round number of lh, so the closest value shows how far off it is.
      expect(found).toContainEqual(["5.33lh", "-0.06px"]);
    });

    it("treats a bare number as pixels and ignores whitespace", async () => {
      await load();

      type("unit-input-background", " 9 6 ");

      expect(results()[0]).toEqual(["1in", ""]);
    });

    it("measures font-relative units against the font field", async () => {
      await load();

      type("font-input-background", "10px/20px''");
      type("unit-input-background", "20px");

      expect(results()).toContainEqual(["2em", ""]);
      expect(results()).toContainEqual(["1lh", ""]);
    });

    it("trades precision for length within the tolerance", async () => {
      await load();

      type("unit-input-background", "96px");
      expect(results()).toContainEqual(["101.6q", ""]);

      // 102q is 0.38px too wide: fine once the tolerance allows it.
      type("tolerance-input-background", "0.4");
      expect(results()).toContainEqual(["102q", "+0.38px"]);
    });

    it("pushes values off by more than the tolerance to the end", async () => {
      await load();

      type("tolerance-input-background", "0");
      type("unit-input-background", "96px");

      const found = results();
      const offsets = found.map(([, offset]) => offset);
      const firstInexact = offsets.findIndex((offset) => "" !== offset);
      expect(firstInexact).toBeGreaterThan(0);
      expect(offsets.slice(firstInexact).every((o) => "" !== o)).toBe(true);
    });

    it("shows nothing for a zero length", async () => {
      await load();

      type("unit-input-background", "0");

      expect(results()).toEqual([]);
    });

    it("still converts to the other units when the browser does not know one", async () => {
      await load(["cap"]);

      type("unit-input-background", "96px");

      expect(results()[0]).toEqual(["1in", ""]);
    });
  });

  describe("converting an angle", () => {
    it.each([
      ["90deg", ["90deg", "1.57rad", "100grad", "0.25turn"]],
      ["100grad", ["90deg", "1.57rad", "100grad", "0.25turn"]],
      ["1rad", ["57.3deg", "1rad", "63.66grad", "0.16turn"]],
      ["0.5turn", ["180deg", "3.14rad", "200grad", "0.5turn"]],
    ])("converts %s to every angle unit", async (input, expected) => {
      await load();

      type("unit-input-background", input);

      expect(results()).toEqual(expected.map((value) => [value, ""]));
    });

    it("shows nothing when the angle unit is not at the end", async () => {
      await load();

      type("unit-input-background", "10deg5");

      expect(results()).toEqual([]);
    });
  });

  describe("rewriting the code", () => {
    it("replaces each px value by its shortest exact equivalent", async () => {
      await load();
      setCode("<p style='width:96px;height:0px;margin:24px'></p>");

      document.getElementById("minifyAllPx").click();
      await tick();

      // 0px measures nothing, so it is left as is.
      expect(editor().textContent).toBe(
        "<p style='width:1in;height:0px;margin:6vw'></p>",
      );
    });

    it("keeps a px value that has no shorter equivalent", async () => {
      await load();
      setCode("<p style='width:7px'></p>");

      document.getElementById("minifyAllPx").click();
      await tick();

      expect(editor().textContent).toBe("<p style='width:7px'></p>");
    });

    it("turns every other unit back into px", async () => {
      await load();
      setCode("<p style='width:1in;margin:2em 3vw;top:0em'></p>");

      document.getElementById("maxifyAllPx").click();
      await tick();

      // in is not in the list of units it rewrites, and 0em measures nothing.
      expect(editor().textContent).toBe(
        "<p style='width:1in;margin:32px 12px;top:0em'></p>",
      );
    });
  });
});
