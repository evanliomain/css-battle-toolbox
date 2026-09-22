import { describe, expect, it } from "vitest";
import { ghostCss, OWN } from "./ghost-sheet";

describe("the ghost stylesheet", () => {
  it("cuts the label layer off from the played code", () => {
    const css = ghostCss();

    // The labels are elements of the played document, so `* * { scale: -1 }` —
    // ordinary golf — used to mirror every one of them.
    expect(css).toContain("cbt-labels *,");
    expect(css).toContain("all: initial !important;");
  });

  it("resets the labels before styling them, not after", () => {
    const css = ghostCss();

    // `cbt-labels *` and `cbt-label` have the same specificity, so the reset
    // would wipe the position and the colour if it came last.
    expect(css.indexOf("all: initial")).toBeLessThan(
      css.indexOf("cbt-label {"),
    );
  });

  it("hides the nodes the tool adds to the head", () => {
    const css = ghostCss();
    const rule = css.slice(css.indexOf(`[${OWN}]`));

    // A head is display:none until the player writes head,style{display:block}
    // to show their own code, and the ghost would then paint ours as well.
    expect(rule).toMatch(/^\[data-cbt-own\] \{\s*display: none !important;/);
  });

  it("keeps everything in a layer, so an !important of the player loses", () => {
    expect(ghostCss().startsWith("@layer cbt {")).toBe(true);
  });
});
