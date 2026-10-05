/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CODE_CHANGED, changeCode } from "./change-code";

function editor() {
  return document.querySelector("[contenteditable]");
}

// changeCode returns nothing, so wait for its promise chain to settle.
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("changeCode", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div contenteditable="true">&lt;p&gt;&lt;/p&gt;</div>`;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("passes the current code to the callback", async () => {
    const cb = vi.fn(() => false);

    changeCode(cb);
    await settle();

    expect(cb).toHaveBeenCalledWith("<p></p>");
  });

  it("writes back what the callback returns", async () => {
    changeCode((code) => code + "<i></i>");
    await settle();

    expect(editor().textContent).toBe("<p></p><i></i>");
  });

  it("waits for an async callback", async () => {
    changeCode(async (code) => code.toUpperCase());
    await settle();

    expect(editor().textContent).toBe("<P></P>");
  });

  it("leaves the code untouched when the callback returns false", async () => {
    const listener = vi.fn();
    document.addEventListener(CODE_CHANGED, listener);

    changeCode(() => false);
    await settle();

    expect(editor().textContent).toBe("<p></p>");
    expect(listener).not.toHaveBeenCalled();
    document.removeEventListener(CODE_CHANGED, listener);
  });

  it("tells the code changed once it is written", async () => {
    const listener = vi.fn(() => editor().textContent);
    document.addEventListener(CODE_CHANGED, listener);

    changeCode((code) => code + "<i></i>");
    await settle();

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveReturnedWith("<p></p><i></i>");
    document.removeEventListener(CODE_CHANGED, listener);
  });

  it("writes an empty code, which is not false", async () => {
    changeCode(() => "");
    await settle();

    expect(editor().textContent).toBe("");
  });
});
