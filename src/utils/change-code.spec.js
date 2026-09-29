/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeCode } from "./change-code";

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
    changeCode(() => false);
    await settle();

    expect(editor().textContent).toBe("<p></p>");
  });

  it("writes an empty code, which is not false", async () => {
    changeCode(() => "");
    await settle();

    expect(editor().textContent).toBe("");
  });
});
