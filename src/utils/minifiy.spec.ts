import { describe, expect, it } from "vitest";
import { minify } from "./minify";
import { prettify } from "./prettify";

describe("minify", () => {
  it.each([
    [
      `
<style>
  & {
    scale: 0.070 0.50;
  }
</style>`,
      "<style>&{scale:.07.5",
    ],
    [
      `
<style>
  & {
    scale: 1.07 0.5;
  }
</style>`,
      "<style>&{scale:1.07.5",
    ],
    [
      `
<style>
  & {
    scale: 1.07 1.5;
  }
</style>`,
      "<style>&{scale:1.07 1.5",
    ],
    [
      `
<style>
  & {
    font: 12px '';
  }
</style>`,
      "<style>&{font:12px'",
    ],
    [
      `
<style>
  & {
    font: 12px "";
  }
</style>`,
      '<style>&{font:12px"',
    ],
    [
      `
<style>
& {
  font: 56% a;
}
</style>`,
      "<style>&{font:56%a",
    ],
    [
      `
<style>
  & {
    padding: calc(120px + var(--b));
  }
</style>`,
      "<style>&{padding:calc(120px+var(--b",
    ],
    [
      `
<style>
  & {
    color: transparent;
  }
</style>`,
      "<style>&{color:#0000",
    ],
  ])("#%#", (pretty, minified) => {
    expect(minify(pretty)).toEqual(minified);
    expect(minify(minified)).toEqual(minified);
  });

  describe("minify ° pretty = identity", () => {
    it.each([
      [
        "<style>*{zoom:2;margin:55 75;background:#62306d;border-radius:50%;box-shadow:-9vw 0#f7ec7d;*{margin:0-54 0 54",
        "<style>*{background:#62306d;*{margin:110 222 110 78;border-radius:50%;box-shadow:inset 76Q 0,9pc 0;color:#f7ec7d",
        "<style>*{background:#191210;color:84271C;border-radius:1in;margin:0 65%225-265;box-shadow:25vw 75vh,-31q 231q,-60q 2in,425px 0,590q 9q,615q 33q;*{margin:-125 165",
      ],
    ])("#%#", async (minified) => {
      expect(minify(await prettify(minified))).toEqual(minified);
    });
  });
});
