/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  loadSavedCode,
  readEditorCode,
  saveCode,
  savedCodeKey,
} from "./saved-code";

/** Builds a `.cm-content` the way CodeMirror renders it: one div per line. */
function cmEditor(html) {
  document.body.innerHTML = `<div class="cm-content" contenteditable="true">${html}</div>`;
  return document.querySelector("[contenteditable]");
}

describe("saved-code", () => {
  afterEach(() => {
    window.localStorage.clear();
    document.body.innerHTML = "";
  });

  it("keys the code on the target id of the URL", () => {
    expect(savedCodeKey()).toBe("cbt-lastCode-123");
  });

  it("reads back what it saved", () => {
    saveCode("<p></p>");

    expect(window.localStorage.getItem("cbt-lastCode-123")).toBe("<p></p>");
    expect(loadSavedCode()).toBe("<p></p>");
    expect(loadSavedCode("124")).toBeNull();
  });

  it("keeps the line breaks between CodeMirror lines, empty ones included", () => {
    const editor = cmEditor(`
      <div class="cm-line"><span>&lt;p&gt;</span>&lt;/p&gt;</div><div class="cm-line"><br></div><div class="cm-line">&lt;style&gt;</div>`);

    expect(readEditorCode(editor)).toBe("<p></p>\n\n<style>");
  });

  it("leaves CodeMirror widgets out of the code", () => {
    const editor = cmEditor(`
      <div class="cm-line">a<span contenteditable="false"><b>widget</b></span>b</div>`);

    expect(readEditorCode(editor)).toBe("ab");
  });

  it("refuses to read an editor that is only partly rendered", () => {
    const editor = cmEditor(`
      <div class="cm-line">a</div><div class="cm-gap"></div><div class="cm-line">z</div>`);

    expect(readEditorCode(editor)).toBeNull();
  });

  it("falls back to the raw text outside CodeMirror", () => {
    const editor = cmEditor("<b>plain</b>");

    expect(readEditorCode(editor)).toBe("plain");
  });
});
