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
    runtime: {
      getURL: (p) => `chrome-extension://test/${p}`,
      openOptionsPage: vi.fn(),
    },
  };
}

/** Builds the output panel and its render iframe, the way cssbattle lays it out. */
function renderOutputPanel(body) {
  document.body.innerHTML = `
      <div class="container__item--output">
        <div class="item__content"><div class="stats"></div></div>
      </div>
      <div class="target-container"><iframe></iframe></div>`;

  const doc = document.querySelector(
    ".target-container iframe",
  ).contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head></head><body>${body}</body></html>`);
  doc.close();

  return doc;
}

/** Lets the doAsync poll (100ms) and any settle delay run. */
function tick(ms = 400) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("tools inject into a cssbattle-shaped DOM", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("chrome", stubChrome());
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("editor-buttons adds Minify and Prettify to the editor button group", async () => {
    document.body.innerHTML = `
      <div class="container__item--editor">
        <div class="btn-group">
          <button>a</button><button>b</button><button>c</button><button>d</button>
        </div>
      </div>`;

    await import("./editor-buttons.js");
    await tick();

    const labels = [...document.querySelectorAll(".btn-group button")].map(
      (b) => b.innerText ?? b.textContent,
    );
    expect(labels).toContain("Minify");
    expect(labels).toContain("Prettify");
  });

  it("editor-buttons injects exactly once, not twice", async () => {
    document.body.innerHTML = `
      <div class="container__item--editor"><div class="btn-group"></div></div>`;

    await import("./editor-buttons.js");
    await tick();

    const minify = [...document.querySelectorAll(".btn-group button")].filter(
      (b) => "Minify" === (b.innerText ?? b.textContent),
    );
    expect(minify).toHaveLength(1);
  });

  it("character-tools inserts the minified-character counter", async () => {
    document.body.innerHTML = `
      <div class="Editor-module__abc">
        <div class="item__header">
          <div class="header__extra-info"><div class="hstack"></div></div>
        </div>
      </div>
      <div contenteditable>div{width:100px}</div>`;

    await import("./character-tools.js");
    await tick();

    const counter = document.getElementById("nb-minified-characters");
    expect(counter).not.toBeNull();
  });

  it("target-tools adds the copy-url and previewer buttons", async () => {
    document.body.innerHTML = `
      <div class="container__item--target">
        <div class="item__header"><div class="first"></div></div>
        <img src="https://cssbattle.dev/targets/1.png" />
      </div>`;

    await import("./target-tools.js");
    await tick();

    expect(document.getElementById("cbt-copy-image-url")).not.toBeNull();
    expect(document.getElementById("cbt-link-to-previewer-url")).not.toBeNull();
  });

  it("dom-tools injects the panel and the outline overlay", async () => {
    renderOutputPanel("<p>hi</p>");

    await import("./dom-tools.js");
    await tick();

    expect(document.getElementById("dom-tool")).not.toBeNull();
    expect(document.querySelector("#dom-outline iframe")).not.toBeNull();
    expect(
      [...document.querySelectorAll(".dom-title-name")].map(
        (name) => name.textContent,
      ),
    ).toEqual(["html", "body", "p"]);
  });

  it("dom-tools never writes to the played document", async () => {
    // The whole point of the ghost iframe: the outlines cost the player's own
    // DOM nothing — no inline transform, no data-id, no stamped attribute.
    const iframeDoc = renderOutputPanel(
      "<div style='transform:rotate(30deg)'><span></span></div>",
    );
    const before = iframeDoc.documentElement.outerHTML;

    await import("./dom-tools.js");
    await tick();

    expect(iframeDoc.documentElement.outerHTML).toBe(before);
  });

  it("dom-tools follows the played code as it changes", async () => {
    const iframeDoc = renderOutputPanel("<p></p>");

    await import("./dom-tools.js");
    await tick();

    iframeDoc.body.insertAdjacentHTML("beforeend", "<span></span>");
    // Rebuilds are coalesced on a frame, so the panel catches up one tick later.
    await tick(100);

    expect(
      [...document.querySelectorAll(".dom-title-name")].map(
        (name) => name.textContent,
      ),
    ).toEqual(["html", "body", "p", "span"]);
  });

  it("dom-tools switches a layer off without touching the played markup", async () => {
    const iframeDoc = renderOutputPanel("<p></p>");
    const before = iframeDoc.documentElement.outerHTML;

    await import("./dom-tools.js");
    await tick();

    const eyes = [...document.querySelectorAll(".dom-eye")];
    expect(eyes).toHaveLength(3);

    eyes[2].click();
    await tick(100);

    const sheets = iframeDoc.adoptedStyleSheets ?? [];
    expect(sheets).toHaveLength(1);
    expect(sheets[0].cssRules[0].cssText).toContain("opacity: 0");
    // The render changed; not one node of the player's document did.
    expect(iframeDoc.documentElement.outerHTML).toBe(before);
    expect(document.querySelector(".dom-element--off")).not.toBeNull();

    [...document.querySelectorAll(".dom-eye")][2].click();
    await tick(100);

    expect(iframeDoc.adoptedStyleSheets ?? []).toHaveLength(0);
    expect(iframeDoc.documentElement.outerHTML).toBe(before);
  });

  it("dom-tools keeps drawing the contour of a layer that is off", async () => {
    renderOutputPanel("<p></p>");

    await import("./dom-tools.js");
    await tick();

    [...document.querySelectorAll(".dom-eye")][2].click();
    await tick(100);

    const ghostDoc = document.querySelector(
      "#dom-outline iframe",
    ).contentDocument;
    const ghost = ghostDoc.querySelector("p");

    // Still stamped with its depth, so it still gets an outline — the rule that
    // hides it is the one thing the ghost never receives.
    expect(ghost.hasAttribute("data-cbt-depth")).toBe(true);
    expect(ghost.hasAttribute("data-cbt-hidden")).toBe(true);
    expect(ghostDoc.documentElement.outerHTML).not.toContain(
      "opacity: 0 !important",
    );
  });

  it("dom-tools holds a layer off across an edit, and forgets a dropped one", async () => {
    const iframeDoc = renderOutputPanel("<p></p>");

    await import("./dom-tools.js");
    await tick();

    [...document.querySelectorAll(".dom-eye")][2].click();
    await tick(100);

    iframeDoc.body.insertAdjacentHTML("beforeend", "<span></span>");
    await tick(100);

    expect(iframeDoc.adoptedStyleSheets ?? []).toHaveLength(1);
    expect(document.querySelector(".dom-element--off")).not.toBeNull();

    // The hidden node itself is gone from the code now.
    iframeDoc.body.innerHTML = "";
    await tick(100);

    expect(iframeDoc.adoptedStyleSheets ?? []).toHaveLength(0);
  });

  it("dom-tools shows every layer again in one click", async () => {
    const iframeDoc = renderOutputPanel("<p></p><span></span>");

    await import("./dom-tools.js");
    await tick();

    const eyes = [...document.querySelectorAll(".dom-eye")];
    eyes[2].click();
    eyes[3].click();
    await tick(100);

    const showAll = document.getElementById("dom-show-all");
    expect(showAll.hidden).toBe(false);
    expect(showAll.textContent).toContain("2 layers hidden");

    showAll.click();
    await tick(100);

    expect(iframeDoc.adoptedStyleSheets ?? []).toHaveLength(0);
    expect(document.getElementById("dom-show-all").hidden).toBe(true);
  });

  it("dom-tools survives a doctype and a comment in the played code", async () => {
    renderOutputPanel("<!-- a note --><p></p>");

    await import("./dom-tools.js");
    await tick();

    expect(document.getElementById("dom-tool")).not.toBeNull();
  });

  it("does nothing on a non-play page", async () => {
    document.body.innerHTML = `
      <div class="container__item--editor"><div class="btn-group"></div></div>`;
    // /leaderboard is not a battle, so the editor tools must stay out of it.
    window.history.replaceState({}, "", "/leaderboard");

    await import("./editor-buttons.js");
    await tick();

    expect(document.querySelectorAll(".btn-group button")).toHaveLength(0);

    window.history.replaceState({}, "", "/play/123");
  });
});
