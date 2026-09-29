/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OPTIONS_HTML from "./options.html?raw";

const KEY = "toolbox.theme";
const root = document.documentElement;

function $(id) {
  return document.getElementById(id);
}

function pageBody() {
  return new DOMParser().parseFromString(OPTIONS_HTML, "text/html").body
    .innerHTML;
}

/** Runs the <head> script, as the browser does before parsing the body. */
async function load({ search = "", body = pageBody() } = {}) {
  window.history.replaceState(null, "", `/options.html${search}`);
  document.body.innerHTML = body;
  await import("./options-ui.js");
}

async function open(options) {
  await load(options);
  document.dispatchEvent(new Event("DOMContentLoaded"));
}

function pick(id) {
  // jsdom checks the radio and fires `change`, as a real click does.
  $(id).click();
}

function filterBy(text) {
  $("optionFilter").value = text;
  $("optionFilter").dispatchEvent(new Event("input"));
}

function isShown(el) {
  return !el.hidden;
}

/** The option row holding a given field. */
function item(id) {
  return $(id).closest(".opt-item");
}

function fieldset(headingId) {
  return $(headingId).closest("fieldset");
}

function heights({ header = 0, panelHead = 0 }) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function () {
      const height = "HEADER" === this.tagName ? header : panelHead;
      return { height };
    },
  );
}

class FakeResizeObserver {
  static instances = [];

  constructor(cb) {
    this.cb = cb;
    this.observe = vi.fn();
    FakeResizeObserver.instances.push(this);
  }
}

describe("options-ui", () => {
  let documentListeners;
  let windowListeners;

  beforeEach(() => {
    vi.resetModules();
    documentListeners = vi.spyOn(document, "addEventListener");
    windowListeners = vi.spyOn(window, "addEventListener");
    FakeResizeObserver.instances = [];
  });

  afterEach(() => {
    // document and window outlive the module: unbind the previous page's handlers.
    documentListeners.mock.calls.forEach(([type, handler]) =>
      document.removeEventListener(type, handler),
    );
    windowListeners.mock.calls.forEach(([type, handler]) =>
      window.removeEventListener(type, handler),
    );
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.localStorage.clear();
    root.removeAttribute("data-theme");
    root.removeAttribute("style");
    document.body.innerHTML = "";
  });

  describe("theme", () => {
    it("applies the saved theme before the page renders", async () => {
      window.localStorage.setItem(KEY, "dark");

      await load();

      expect(root.getAttribute("data-theme")).toBe("dark");
    });

    it("checks the radio of the current theme", async () => {
      window.localStorage.setItem(KEY, "light");

      await open();

      expect($("theme-light").checked).toBe(true);
      expect($("theme-auto").checked).toBe(false);
      expect($("theme-dark").checked).toBe(false);
    });

    it("follows the system theme by default", async () => {
      await open();

      expect(root.hasAttribute("data-theme")).toBe(false);
      expect($("theme-auto").checked).toBe(true);
    });

    it("ignores an unknown saved theme", async () => {
      window.localStorage.setItem(KEY, "purple");

      await open();

      expect(root.hasAttribute("data-theme")).toBe(false);
      expect($("theme-auto").checked).toBe(true);
    });

    it("follows the system theme when the storage is blocked", async () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new DOMException("denied", "SecurityError");
      });

      await open();

      expect(root.hasAttribute("data-theme")).toBe(false);
      expect($("theme-auto").checked).toBe(true);
    });

    it("saves the chosen theme", async () => {
      await open();

      pick("theme-dark");

      expect(root.getAttribute("data-theme")).toBe("dark");
      expect(window.localStorage.getItem(KEY)).toBe("dark");

      pick("theme-auto");

      expect(root.hasAttribute("data-theme")).toBe(false);
      expect(window.localStorage.getItem(KEY)).toBe("auto");
    });

    it("ignores the change event of a radio being unchecked", async () => {
      await open();

      $("theme-dark").dispatchEvent(new Event("change"));

      expect(root.hasAttribute("data-theme")).toBe(false);
      expect(window.localStorage.getItem(KEY)).toBeNull();
    });

    it("still switches the theme when it cannot be saved", async () => {
      await open();
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("full", "QuotaExceededError");
      });

      pick("theme-light");

      expect(root.getAttribute("data-theme")).toBe("light");
    });

    describe("forced by ?theme=", () => {
      it("wins over the saved theme", async () => {
        window.localStorage.setItem(KEY, "dark");

        await open({ search: "?theme=light" });

        expect(root.getAttribute("data-theme")).toBe("light");
        expect($("theme-light").checked).toBe(true);
      });

      it("previews another theme without saving it", async () => {
        window.localStorage.setItem(KEY, "dark");
        await open({ search: "?theme=light" });

        pick("theme-auto");

        expect(root.hasAttribute("data-theme")).toBe(false);
        expect(window.localStorage.getItem(KEY)).toBe("dark");
      });

      it("is ignored when unknown", async () => {
        window.localStorage.setItem(KEY, "dark");

        await load({ search: "?theme=sepia" });

        expect(root.getAttribute("data-theme")).toBe("dark");
      });

      it("is ignored when the query cannot be read", async () => {
        window.localStorage.setItem(KEY, "dark");
        vi.stubGlobal(
          "URLSearchParams",
          class {
            constructor() {
              throw new TypeError("unsupported");
            }
          },
        );

        await load({ search: "?theme=light" });

        expect(root.getAttribute("data-theme")).toBe("dark");
      });
    });
  });

  describe("sticky offsets", () => {
    it("parks the headings under the measured header", async () => {
      heights({ header: 96, panelHead: 48 });

      await open();

      expect(root.style.getPropertyValue("--header-h")).toBe("80px");
      expect(root.style.getPropertyValue("--panel-head-h")).toBe("32px");
    });

    it("re-measures on resize when ResizeObserver is missing", async () => {
      heights({ header: 96, panelHead: 48 });
      await open();

      heights({ header: 136, panelHead: 48 });
      window.dispatchEvent(new Event("resize"));

      expect(root.style.getPropertyValue("--header-h")).toBe("120px");
    });

    it("keeps the last good offset while the page is not rendered", async () => {
      heights({ header: 96, panelHead: 48 });
      await open();

      heights({ header: 0, panelHead: 0 });
      window.dispatchEvent(new Event("resize"));

      expect(root.style.getPropertyValue("--header-h")).toBe("80px");
      expect(root.style.getPropertyValue("--panel-head-h")).toBe("32px");
    });

    it("watches the header and a panel head with ResizeObserver", async () => {
      vi.stubGlobal("ResizeObserver", FakeResizeObserver);
      heights({ header: 96, panelHead: 48 });
      await open();

      const [observer] = FakeResizeObserver.instances;
      expect(observer.observe).toHaveBeenCalledWith(
        document.querySelector("header"),
      );
      expect(observer.observe).toHaveBeenCalledWith(
        document.querySelector(".panel-head"),
      );
      expect(window.addEventListener).not.toHaveBeenCalledWith(
        "resize",
        expect.any(Function),
      );

      heights({ header: 136, panelHead: 64 });
      observer.cb();

      expect(root.style.getPropertyValue("--header-h")).toBe("120px");
      expect(root.style.getPropertyValue("--panel-head-h")).toBe("48px");
    });

    it("copes with a page that has neither header nor panel head", async () => {
      vi.stubGlobal("ResizeObserver", FakeResizeObserver);
      heights({ header: 96, panelHead: 48 });

      await open({ body: MINIMAL_BODY });

      expect(FakeResizeObserver.instances[0].observe).not.toHaveBeenCalled();
      expect(root.style.getPropertyValue("--header-h")).toBe("");
      expect(root.style.getPropertyValue("--panel-head-h")).toBe("");
    });
  });

  describe("filter", () => {
    it("shows only the options that match every word", async () => {
      await open();

      filterBy("  Invert   DIFFERENCE ");

      expect(isShown(item("invertDifference"))).toBe(true);
      expect(isShown(item("x2Difference"))).toBe(false);
      expect(isShown(item("hideDifference"))).toBe(false);
    });

    it("hides a section, a matrix head or a subhead left without rows", async () => {
      await open();
      const output = fieldset("ph-output");
      const subhead = output.querySelector(".subhead");

      filterBy("invert difference");

      expect(isShown(output)).toBe(true);
      expect(isShown(output.querySelector(".mx-head"))).toBe(false);
      expect(isShown(subhead)).toBe(true);
      expect(isShown(fieldset("ph-layout"))).toBe(false);

      filterBy("slide and compare");

      expect(isShown(output.querySelector(".mx-head"))).toBe(true);
      expect(isShown(subhead)).toBe(false);
    });

    it("says so when nothing matches", async () => {
      await open();
      expect(isShown($("filterEmpty"))).toBe(false);

      filterBy("no such option");

      expect(isShown($("filterEmpty"))).toBe(true);
      document
        .querySelectorAll("form fieldset")
        .forEach((fs) => expect(isShown(fs)).toBe(false));
    });

    it("clears on Escape", async () => {
      await open();
      filterBy("no such option");

      $("optionFilter").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape" }),
      );

      expect($("optionFilter").value).toBe("");
      expect(isShown($("filterEmpty"))).toBe(false);
      document
        .querySelectorAll(".opt-item")
        .forEach((el) => expect(isShown(el)).toBe(true));
    });

    it("leaves the filter alone on other keys, or on Escape when empty", async () => {
      await open();
      filterBy("grid");

      $("optionFilter").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter" }),
      );

      expect($("optionFilter").value).toBe("grid");
      expect(isShown(item("hideHeader"))).toBe(false);

      // Typed but not applied: Escape on an empty field must not re-filter.
      $("optionFilter").value = "";
      $("optionFilter").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape" }),
      );

      expect(isShown(item("hideHeader"))).toBe(false);
    });

    it("matches an option on its text when it has no data-search", async () => {
      await open({ body: MINIMAL_BODY });

      filterBy("footer");

      expect(isShown(document.querySelector(".opt-item"))).toBe(true);
      expect(isShown($("filterEmpty"))).toBe(false);
    });

    it("hides a subhead that no group follows", async () => {
      await open({ body: MINIMAL_BODY });

      filterBy("footer");

      expect(isShown(document.querySelector(".subhead"))).toBe(false);
    });
  });

  it("never submits the form", async () => {
    await open();
    const submit = new Event("submit", { cancelable: true });

    $("optionsForm").dispatchEvent(submit);

    expect(submit.defaultPrevented).toBe(true);
  });
});

/** Just what the script needs, to reach the branches the real page never hits. */
const MINIMAL_BODY = `
  <input id="optionFilter" />
  <div id="filterEmpty" hidden></div>
  <form id="optionsForm">
    <fieldset>
      <label class="opt-item">Hide the footer</label>
      <p class="subhead">Nothing after me</p>
    </fieldset>
  </form>`;
