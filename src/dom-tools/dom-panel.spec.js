/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { DOM_COLOR } from "../utils/dom-color";
import { buildPanel, setHover } from "./dom-panel";
import { DEPTH, HIDDEN, HOVER } from "./ghost-sheet";

/** A ghost-like document, parsed from the given body. */
function ghostRoot(body, head = "") {
  const doc = document.implementation.createHTMLDocument("");
  doc.documentElement.innerHTML = `<head>${head}</head><body>${body}</body>`;
  return doc.documentElement;
}

function panel(root, off = []) {
  const main = document.createElement("div");
  document.body.insertAdjacentElement("beforeend", main);
  const hidden = new Set(off);
  const entries = buildPanel(root, main, hidden);
  return { main, entries };
}

function names(main) {
  return Array.from(
    main.querySelectorAll(".dom-title-name"),
    (name) => name.textContent,
  );
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("the tree panel", () => {
  it("lists every element that paints a box, and none that cannot", () => {
    const root = ghostRoot(
      "<div><p></p><script></script><template></template></div>",
      "<title>t</title><style></style><meta><link><base>",
    );
    const { main, entries } = panel(root);

    expect(names(main)).toEqual(["html", "body", "div", "p"]);
    expect(entries.map((entry) => entry.element.localName)).toEqual(
      names(main),
    );
  });

  it("numbers the paths before skipping, so they match :nth-child", () => {
    const root = ghostRoot("<style></style><p></p>");
    const { entries } = panel(root);
    const p = entries.find((entry) => "p" === entry.element.localName);

    expect(p.path).toBe(":root>:nth-child(2)>:nth-child(2)");
    expect(root.querySelector(p.path.replace(":root", "html"))).toBe(
      p.element,
    );
  });

  it("gives every row an id of its own", () => {
    const { main, entries } = panel(ghostRoot("<i></i><i></i>"));

    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      Array.from(main.querySelectorAll("[data-id]"), (row) => row.dataset.id),
    ).toEqual(ids);
  });

  it("stamps each ghost element with a depth that cycles through the colours", () => {
    let body = "";
    for (let i = 0; i < DOM_COLOR.length; i++) {
      body = `<div>${body}</div>`;
    }
    const { entries } = panel(ghostRoot(body));

    entries.forEach(({ element, depth }) => {
      expect(element.getAttribute(DEPTH)).toBe(
        String(depth % DOM_COLOR.length),
      );
    });
    // html, body, then eight nested divs: the deepest wraps back to the first colour.
    expect(entries.at(-1).depth).toBe(1 + DOM_COLOR.length);
    expect(entries.at(-1).element.getAttribute(DEPTH)).toBe("1");
  });

  it("shows the id, the classes and the other attribute names", () => {
    const { main } = panel(
      ghostRoot(
        `<p id="a" class="b c" style="color:red" data-x="1" title="t" hidden></p>`,
      ),
    );
    const row = main.querySelectorAll(".dom-title")[2];

    expect(row.querySelector(".dom-title-id").textContent).toBe("#a");
    expect(row.querySelector(".dom-title-class").textContent).toBe(".b.c");
    // Neither style nor data-*: those are either noise or the tool's own marks.
    expect(row.querySelector(".dom-title-attributes").textContent).toBe(
      "[title] [hidden]",
    );
  });

  it("escapes what comes from the player's code", () => {
    const root = ghostRoot("<p></p>");
    const p = root.querySelector("p");
    p.id = `"><img src=x onerror=alert(1)>`;
    p.className = "a&b";

    const { main } = panel(root);

    expect(main.querySelector("img")).toBeNull();
    const row = main.querySelectorAll(".dom-title")[2];
    expect(row.querySelector(".dom-title-id").textContent).toBe(`#${p.id}`);
    expect(row.querySelector(".dom-title-class").textContent).toBe(".a&b");
  });

  it("gives the border box, fractions included", () => {
    const { main } = panel(
      ghostRoot(
        `<div style="width:10.5px;height:20px;padding:1px;border:2px solid"></div>`,
      ),
    );

    expect(main.querySelectorAll(".dom-detail-size")[2].textContent).toBe(
      "W 16.5 x H 26",
    );
  });

  it("falls back on the rect for a box whose size is auto", () => {
    const root = ghostRoot("<span></span>");
    vi.spyOn(root.querySelector("span"), "getBoundingClientRect").mockReturnValue(
      { width: 12.345, height: 7 },
    );

    const { main } = panel(root);

    expect(main.querySelectorAll(".dom-detail-size")[2].textContent).toBe(
      "W 12.35 x H 7",
    );
  });

  it("flags a box that is not displayed", () => {
    const { main } = panel(ghostRoot(`<p style="display:none"></p>`));
    const element = main.querySelectorAll(".dom-element")[2];

    expect(element.classList.contains("dom-element--hidden")).toBe(true);
    expect(element.querySelector(".dom-detail-size").textContent).toBe(
      "display: none",
    );
  });

  it("spells the margins out only when there are some", () => {
    const { main } = panel(
      ghostRoot(
        `<p></p><p style="margin:5px"></p><p style="margin:1px 2px 3px 4px"></p><p style="margin:-3px"></p>`,
      ),
    );
    const margin = (index) =>
      main
        .querySelectorAll(".dom-element")
        [index].querySelector(".dom-detail-margin")?.textContent ?? null;

    expect(margin(2)).toBeNull();
    expect(margin(3)).toBe("M 5");
    expect(margin(4)).toBe("M 1 2 3 4");
    // A negative margin has no band to draw.
    expect(margin(5)).toBeNull();
  });

  it("marks a layer that is switched off, in the panel and on the ghost", () => {
    const root = ghostRoot("<p></p><i></i>");
    const { main, entries } = panel(root, [
      ":root>:nth-child(2)>:nth-child(1)",
    ]);
    const [p, i] = entries.slice(2);
    const eyes = main.querySelectorAll(".dom-eye");

    expect(p.element.hasAttribute(HIDDEN)).toBe(true);
    expect(i.element.hasAttribute(HIDDEN)).toBe(false);
    expect(eyes[2].getAttribute("aria-pressed")).toBe("true");
    expect(eyes[2].getAttribute("aria-label")).toBe("Show this layer");
    expect(eyes[2].dataset.eye).toBe(p.path);
    expect(eyes[3].getAttribute("aria-pressed")).toBe("false");
    expect(eyes[3].getAttribute("aria-label")).toBe("Hide this layer");
    expect(
      main.querySelectorAll(".dom-element")[2].classList.contains(
        "dom-element--off",
      ),
    ).toBe(true);
  });

  it("stops after 2000 nodes, and says so", () => {
    const root = ghostRoot("<i></i>".repeat(2100));
    // A real style resolution per node makes this test take seconds.
    vi.spyOn(globalThis, "getComputedStyle").mockReturnValue({
      display: "block",
    });
    const { main, entries } = panel(root);

    expect(entries).toHaveLength(2000);
    expect(main.querySelectorAll("[data-id]")).toHaveLength(2000);
    expect(main.querySelector(".dom-truncated").textContent).toBe(
      "Stopped after 2000 nodes.",
    );
    // Thousands of rows to parse: slow on a loaded machine.
  }, 30000);

  it("does not say it stopped when everything fits", () => {
    const { main } = panel(ghostRoot("<i></i>"));

    expect(main.querySelector(".dom-truncated")).toBeNull();
  });
});

describe("the hover highlight", () => {
  it("paints the box model with the widest margin as its band", () => {
    const root = ghostRoot(`<p style="margin:1px 8px 3px -20px"></p>`);
    const p = root.querySelector("p");

    setHover(p, true);

    expect(p.hasAttribute(HOVER)).toBe(true);
    expect(p.style.getPropertyValue("--cbt-margin")).toBe("8px");
  });

  it("clears it again", () => {
    const root = ghostRoot(`<p style="margin:4px"></p>`);
    const p = root.querySelector("p");

    setHover(p, true);
    setHover(p, false);

    expect(p.hasAttribute(HOVER)).toBe(false);
    expect(p.style.getPropertyValue("--cbt-margin")).toBe("");
  });
});
