/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HIDDEN, HOVER, OUTLINE_FLAG } from "./dom-tools/ghost-sheet";

function stubChrome() {
  return {
    storage: {
      sync: { get: vi.fn(() => Promise.resolve({})) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: { getURL: (p) => `chrome-extension://test/${p}` },
  };
}

/** Builds the output panel and its render iframe, the way cssbattle lays it out. */
function renderOutputPanel(body) {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="container__item--output">
      <div class="item__content"><div class="stats"></div></div>
    </div>
    <div class="target-container"><iframe></iframe></div>`,
  );

  const frame = document.querySelector(".target-container iframe");
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head></head><body>${body}</body></html>`);
  doc.close();

  return { frame, doc };
}

function tool() {
  return document.getElementById("dom-tool");
}

function ghostDoc() {
  return document.querySelector("#dom-outline iframe").contentDocument;
}

function names() {
  return Array.from(
    document.querySelectorAll(".dom-title-name"),
    (name) => name.textContent,
  );
}

/** The panel rows, in tree order: html, body, then the played elements. */
function rows() {
  return Array.from(document.querySelectorAll("#dom-tool [data-id]"));
}

function hover(target) {
  target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
}

function hovered() {
  return Array.from(ghostDoc().querySelectorAll(`[${HOVER}]`), (node) =>
    node.localName,
  );
}

// Fake timers, so the pollers a test leaves running die with it instead of
// firing once the jsdom environment is gone.
function tick(ms = 400) {
  return vi.advanceTimersByTimeAsync(ms);
}

describe("dom-tools", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.stubGlobal("chrome", stubChrome());
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.history.replaceState({}, "", "/play/123");
    document.body.innerHTML = "";
  });

  describe("mounting", () => {
    it("puts the panel after the output stats, and the overlay on the target", async () => {
      renderOutputPanel("<p></p>");

      await import("./dom-tools.js");
      await tick();

      expect(document.querySelector(".stats").nextElementSibling).toBe(tool());
      expect(
        document.querySelector(".target-container").lastElementChild.id,
      ).toBe("dom-outline");
      expect(names()).toEqual(["html", "body", "p"]);
      // Nothing is hidden yet, so there is nothing to show back.
      expect(document.getElementById("dom-show-all").hidden).toBe(true);
    });

    it("clears what a previous mount left on the page", async () => {
      document.body.innerHTML = `<div id="dom-tool"></div><div id="dom-outline"></div>`;
      renderOutputPanel("<p></p>");

      await import("./dom-tools.js");
      await tick();

      expect(document.querySelectorAll("#dom-tool")).toHaveLength(1);
      expect(document.querySelectorAll("#dom-outline")).toHaveLength(1);
      expect(tool().querySelector("[data-dom-tool]")).not.toBeNull();
    });

    it("reaches the render through its window when contentDocument is hidden", async () => {
      const { frame } = renderOutputPanel("<p></p>");
      Object.defineProperty(frame, "contentDocument", { value: null });

      await import("./dom-tools.js");
      await tick();

      expect(names()).toEqual(["html", "body", "p"]);
    });

    it("waits for a render that has no document yet", async () => {
      const { frame } = renderOutputPanel("<p></p>");
      Object.defineProperty(frame, "contentDocument", {
        configurable: true,
        value: null,
      });
      Object.defineProperty(frame, "contentWindow", {
        configurable: true,
        value: null,
      });

      await import("./dom-tools.js");
      await tick();
      expect(tool()).toBeNull();

      delete frame.contentDocument;
      delete frame.contentWindow;
      await tick();

      expect(names()).toEqual(["html", "body", "p"]);
    });

    it("leaves the battle's page as it found it on the way out", async () => {
      const { doc } = renderOutputPanel("<p></p>");

      await import("./dom-tools.js");
      await tick();
      rows()[2].querySelector(".dom-eye").click();
      await tick(100);
      expect(doc.adoptedStyleSheets).toHaveLength(1);

      window.history.replaceState({}, "", "/leaderboard");
      await tick();

      expect(tool()).toBeNull();
      expect(document.getElementById("dom-outline")).toBeNull();
      // A hidden layer must not survive into the next page.
      expect(doc.adoptedStyleSheets).toHaveLength(0);

      // Nothing is listening any more.
      doc.body.insertAdjacentHTML("beforeend", "<i></i>");
      document
        .querySelector(".target-container")
        .classList.add("display-outline");
      await tick();
      expect(tool()).toBeNull();
    });

    it("drops a rebuild still waiting for its frame when it is torn down", async () => {
      const { doc } = renderOutputPanel("<p></p>");
      const cancel = vi.spyOn(globalThis, "cancelAnimationFrame");

      await import("./dom-tools.js");
      // Just before the URL poll at 300ms, so the frame is still pending then.
      await tick(295);
      doc.body.insertAdjacentHTML("beforeend", "<i></i>");
      await tick(0);
      window.history.replaceState({}, "", "/leaderboard");
      await tick(100);

      expect(cancel).toHaveBeenCalledWith(expect.any(Number));
      expect(cancel.mock.calls.at(-1)[0]).not.toBe(0);
      expect(tool()).toBeNull();
    });

    it("stops handling the panel's events once torn down", async () => {
      const { doc } = renderOutputPanel("<p></p>");

      await import("./dom-tools.js");
      await tick();
      const detached = tool();

      window.history.replaceState({}, "", "/leaderboard");
      await tick();
      detached.querySelectorAll(".dom-eye")[2].click();
      await tick(100);

      expect(doc.adoptedStyleSheets ?? []).toHaveLength(0);
    });
  });

  describe("rebuilding", () => {
    it("coalesces a burst of edits into a single rebuild", async () => {
      const { doc } = renderOutputPanel("<p></p>");

      await import("./dom-tools.js");
      await tick();
      const frame = vi.spyOn(globalThis, "requestAnimationFrame");

      doc.body.insertAdjacentHTML("beforeend", "<i></i>");
      await tick(0);
      doc.body.insertAdjacentHTML("beforeend", "<b></b>");
      await tick(0);
      await tick(100);

      expect(frame).toHaveBeenCalledOnce();
      expect(names()).toEqual(["html", "body", "p", "i", "b"]);
    });

    it("follows an edit that only changes a text node", async () => {
      const { doc } = renderOutputPanel("<p>a</p>");

      await import("./dom-tools.js");
      await tick();
      const p = ghostDoc().querySelector("p");

      doc.querySelector("p").firstChild.data = "b";
      await tick(100);

      // A rebuild swaps in a fresh clone of the render.
      expect(ghostDoc().querySelector("p")).not.toBe(p);
      expect(ghostDoc().querySelector("p").textContent).toBe("b");
    });

    it("mirrors the display flags of the host onto the ghost", async () => {
      renderOutputPanel("<p></p>");

      await import("./dom-tools.js");
      await tick();
      const targetContainer = document.querySelector(".target-container");

      targetContainer.classList.add("display-outline");
      await tick(0);
      expect(ghostDoc().documentElement.hasAttribute(OUTLINE_FLAG)).toBe(true);

      targetContainer.classList.remove("display-outline");
      await tick(0);
      expect(ghostDoc().documentElement.hasAttribute(OUTLINE_FLAG)).toBe(
        false,
      );
    });

    it("resizes the overlay with the render", async () => {
      const observers = [];
      vi.stubGlobal(
        "ResizeObserver",
        class {
          constructor(callback) {
            this.callback = callback;
            this.targets = [];
            this.disconnect = vi.fn();
            observers.push(this);
          }
          observe(target) {
            this.targets.push(target);
          }
        },
      );
      const { frame } = renderOutputPanel("<p></p>");

      await import("./dom-tools.js");
      await tick();

      const [observer] = observers;
      const overlay = document.getElementById("dom-outline");
      expect(observer.targets).toEqual([frame, overlay]);

      Object.defineProperty(frame, "clientWidth", { value: 400 });
      Object.defineProperty(frame, "clientHeight", { value: 300 });
      observer.callback([]);
      await tick(100);

      expect(overlay.style.width).toBe("400px");
      expect(overlay.style.height).toBe("300px");

      window.history.replaceState({}, "", "/leaderboard");
      await tick();
      expect(observer.disconnect).toHaveBeenCalled();
    });
  });

  describe("hovering a row", () => {
    it("highlights the matching shape, one at a time", async () => {
      renderOutputPanel("<p></p><i></i>");

      await import("./dom-tools.js");
      await tick();

      hover(rows()[2].querySelector(".dom-title-name"));
      expect(hovered()).toEqual(["p"]);

      // Still over the same row: nothing to repaint.
      hover(rows()[2].querySelector(".dom-detail-size"));
      expect(hovered()).toEqual(["p"]);

      hover(rows()[3].querySelector(".dom-title-name"));
      expect(hovered()).toEqual(["i"]);
    });

    it("clears the highlight off the rows and when the pointer leaves", async () => {
      renderOutputPanel("<p></p>");

      await import("./dom-tools.js");
      await tick();

      hover(rows()[2]);
      hover(document.getElementById("dom-show-all"));
      expect(hovered()).toEqual([]);

      hover(rows()[2]);
      tool().dispatchEvent(new MouseEvent("mouseleave"));
      expect(hovered()).toEqual([]);

      // Leaving again, with nothing lit, is harmless.
      tool().dispatchEvent(new MouseEvent("mouseleave"));
      expect(hovered()).toEqual([]);
    });

    it("clears the highlight over a row it does not know", async () => {
      renderOutputPanel("<p></p>");

      await import("./dom-tools.js");
      await tick();

      const stray = document.createElement("ul");
      stray.dataset.id = "not-a-row";
      tool().append(stray);

      hover(rows()[2]);
      hover(stray);

      expect(hovered()).toEqual([]);
    });

    it("ignores an event that comes from a text node", async () => {
      renderOutputPanel("<p></p>");

      await import("./dom-tools.js");
      await tick();

      hover(rows()[2]);
      const text = document.createTextNode("x");
      tool().append(text);
      hover(text);

      // A text node has no closest(), so it reads as being over no row.
      expect(hovered()).toEqual([]);
    });

    it("forgets the highlight on a rebuild", async () => {
      const { doc } = renderOutputPanel("<p></p>");

      await import("./dom-tools.js");
      await tick();

      hover(rows()[2]);
      doc.body.insertAdjacentHTML("beforeend", "<i></i>");
      await tick(100);

      // The fresh clone carries no highlight, and the next hover starts clean.
      expect(hovered()).toEqual([]);
      hover(rows()[2]);
      expect(hovered()).toEqual(["p"]);
    });
  });

  describe("switching layers off", () => {
    it("counts the hidden layers on the show-all button", async () => {
      renderOutputPanel("<p></p><i></i>");

      await import("./dom-tools.js");
      await tick();

      rows()[2].querySelector(".dom-eye").click();
      await tick(100);
      const showAll = document.getElementById("dom-show-all");
      expect(showAll.hidden).toBe(false);
      expect(showAll.textContent).toBe("1 layer hidden — show all");
      expect(ghostDoc().querySelector("p").hasAttribute(HIDDEN)).toBe(true);

      rows()[3].querySelector(".dom-eye").click();
      await tick(100);
      expect(showAll.textContent).toBe("2 layers hidden — show all");
    });

    it("shows every layer again from the show-all button", async () => {
      const { doc } = renderOutputPanel("<p></p><i></i>");

      await import("./dom-tools.js");
      await tick();
      rows()[2].querySelector(".dom-eye").click();
      rows()[3].querySelector(".dom-eye").click();
      await tick(100);

      document.getElementById("dom-show-all").click();
      await tick(100);

      expect(doc.adoptedStyleSheets).toHaveLength(0);
      expect(document.getElementById("dom-show-all").hidden).toBe(true);
      expect(ghostDoc().querySelectorAll(`[${HIDDEN}]`)).toHaveLength(0);
      expect(document.querySelector(".dom-element--off")).toBeNull();
    });

    it("does nothing on a click that misses every switch", async () => {
      const { doc } = renderOutputPanel("<p></p>");

      await import("./dom-tools.js");
      await tick();
      const frame = vi.spyOn(globalThis, "requestAnimationFrame");

      rows()[2].querySelector(".dom-title-name").click();
      const text = document.createTextNode("x");
      tool().append(text);
      text.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await tick(100);

      expect(frame).not.toHaveBeenCalled();
      expect(doc.adoptedStyleSheets ?? []).toHaveLength(0);
    });

    it("switches a layer off from a click on the icon of its eye", async () => {
      const { doc } = renderOutputPanel("<p></p>");

      await import("./dom-tools.js");
      await tick();

      // The click lands on the icon, inside the button.
      rows()[2].querySelector(".dom-eye svg").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await tick(100);

      expect(doc.adoptedStyleSheets).toHaveLength(1);
    });
  });
});
