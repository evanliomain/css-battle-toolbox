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
    scale: 1 0.5;
  }
</style>`,
      "<style>&{scale:1 .5",
    ],
    [
      `
<style>
  & {
    scale: 1 .5;
  }
</style>`,
      "<style>&{scale:1 .5",
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
    scale: 0.50500000 1.5;
  }
</style>`,
      "<style>&{scale:.505 1.5",
    ],
    [
      `
<style>
  & {
    scale: 0.5000000005;
  }
</style>`,
      "<style>&{scale:.5000000005",
    ],
    [
      `
<style>
& {
  box-shadow: 83Q 0.5Q;
}
</style>`,
      `<style>&{box-shadow:83Q.5Q`,
    ],
    [
      `
<style>
& {
  box-shadow: 83px 0.5px;
}
</style>`,
      `<style>&{box-shadow:83px.5px`,
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
      "<style>&{padding:calc(120px + var(--b",
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
    [
      `
<style>
  & {
    background: white
  }
  p {
    background: red;
  }
</style>`,
      "<style>&{background:white}p{background:red",
    ],
    [
      `
<style>
  & {
    margin: 10 20
  }
  p {
    background: red;
  }
</style>`,
      "<style>&{margin:10 20}p{background:red",
    ],
    [
      `
<style>
& {
  background: conic-gradient(from 0.41turn, #4a7d7b 0 0);
}
</style>
`,
      `<style>&{background:conic-gradient(from.41turn,#4a7d7b 0 0`,
    ],
    [
      `
  <style>
& {
  outline: solid 0.6lh #0b2429;
}
</style>
      `,
      `<style>&{outline:solid.6lh#0b2429`,
    ],
    [
      ` <p> 
      <style>
        & {
          background: red;
        }
      </style>`,
      ` <p> <style>&{background:red`,
    ],
    [
      `<style>
* {
  height: min(100% - 5ch);
}
</style>`,
      `<style>*{height:min(100% - 5ch`,
    ],
    [
      `<style>
* {
  margin: 10% -10;
  height: min(100% - 20ch);
}
</style>`,
      `<style>*{margin:10%-10;height:min(100% - 20ch`,
    ],
    [
      `<style>
* {
  border: solid #394257 0.63em;
}
</style>`,
      "<style>*{border:solid#394257.63em",
    ],
    [`solid #fafaf0 0.63em;`, "solid#fafaf0.63em"],
    [`solid #fafa00 0.63em;`, "solid#fafa00.63em"],
    [`solid #faf000 0.63em;`, "solid#faf000.63em"],
    [`solid #fa0000 0.63em;`, "solid#fa0000.63em"],
    [`solid #f00000 0.63em;`, "solid#f00000.63em"],
    [`solid #000 0.63em;`, "solid#000.63em"],
    [`solid #0000 0.63em;`, "solid#0000.63em"],
    [`solid #000000 0.63em;`, "solid#000000.63em"],
    [`solid #f00 0.63em;`, "solid#f00.63em"],
    [`solid #00f 0.63em;`, "solid#00f.63em"],
    [`solid #f00a 0.63em;`, "solid#f00a.63em"],
    [`solid transparent 0.63em;`, "solid#0000.63em"],
    [`transparent 0.0 0.1ch`, "#0000.0.1ch"],
    [`transparent 0 0.1ch`, "#0000.0.1ch"],
    [
      `<style>
* {
  font: 14Q "";
  color: red;
}
</style>
      `,
      '<style>*{font:14Q"";color:red',
    ],
    ['font: 14Q "";color: red;', 'font:14Q"";color:red'],
    ['font: 14px "";color: red;', 'font:14px"";color:red'],
    ['font: 14rem "";color: red;', 'font:14rem"";color:red'],
    ["box-shadow: -0.56lh 11Q;", "box-shadow:-.56lh 11Q"],
    // Remove spaces between ~ and *
    ["~*", "~*"],
    ["~ *", "~*"],
    ["~  *", "~*"],
    ["~     *", "~*"],
    ["~\t*", "~*"],
    ["~ \n  *", "~*"],
    ["p ~ *{color:red", "p ~*{color:red"],
    ["p ~ *>a{color:red", "p ~*>a{color:red"],
    ["p ~ * ~ *{color:red", "p ~* ~*{color:red"],
    // Keep the spaces around + and - in math functions: calc(1px+1em) is invalid
    ["width: calc(0px + 1em)", "width:calc(0px + 1em"],
    ["width: calc(1em  -  0.5px)", "width:calc(1em - .5px"],
    ["width: calc(2 * 3 - 1px)", "width:calc(2*3 - 1px"],
    ["width: calc((1px + 2em) * 2)", "width:calc((1px + 2em)*2"],
    ["width: calc(var(--a) - 1px)", "width:calc(var(--a) - 1px"],
    ["width: max(1px, 100% - 2em)", "width:max(1px,100% - 2em"],
    ["width: calc(1px+1em)", "width:calc(1px+1em"],
    // Out of math functions, + is no operator
    ["p:nth-child(2n + 1) + p{color:red", "p:nth-child(2n+1)+p{color:red"],
    ["margin: 10% -10", "margin:10%-10"],
    // Fold calc() on constants, and drop px in quirks mode
    ["<style>*{height: calc(2 * 3px)", "<style>*{height:6"],
    // Keep the space between a digit and 2 quotes nowhere
    ['font: 0 "";color: red;', 'font:0"";color:red'],
    // Remove html comments
    ["<p><!-- a comment --></p>", "<p></p>"],
    // Collapse the spaces between 2 words
    ["border: solid  red", "border:solid red"],
    // Trim every leading 0
    ["margin: 1 00.5", "margin:1 .5"],
    ["margin: -00.5", "margin:-.5"],
    // Remove spaces around parentheses
    ["translate: calc(1px) 1px", "translate:calc(1px)1px"],
    ["translate: calc(1px );", "translate:calc(1px"],
    // Remove spaces around /
    ["font: 9Q /19", "font:9Q/19"],
    ["font: 9Q/ 19", "font:9Q/19"],
    // Remove the space before :
    ["color :red", "color:red"],
    // Remove spaces around > after & and before *
    ["<style>& > *{color:red}", "<style>&>*{color:red"],
    ["& > p{color:red", "&>p{color:red"],
    // Trim space between a letter and 2 quotes, but only at the end or before them
    ["font: 14px '';color: red;", "font:14px'';color:red"],
    ["content: '';color: red;", "content:'';color:red"],
    // Keep the spaces inside a string
    ['content: "a ";color: red;', 'content:"a ";color:red'],
    ["content: 'a ';color: red;", "content:'a ';color:red"],
    // Trim space between a number with a unit in capitals and a number with dot
    ["box-shadow: 83PX 0.5PX", "box-shadow:83PX.5PX"],
    [
      `<style>
p ~   * {
  color: red;
}
</style>`,
      "<style>p ~*{color:red",
    ],
    [
      `<style>
* {
  margin: 10;
}
p ~
  * {
  background: red;
}
</style>`,
      "<style>*{margin:10}p ~*{background:red",
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
        "<style>*{border-radius:99Q 99Q 85Q 85Q;margin:0 10-43;box-shadow:inset 0 83Q.5Q 59Q#fade8b}&{background:#61a74e;margin:81 130 124",
        "<style>*{margin:90 115;color:3B3F58;box-shadow:.56lh 11Q,-.56lh 11Q,0 33ch;*{background:#28be;margin:-60 50 90;font:9Q/19",
      ],
    ])("#%#", async (minified) => {
      expect(minify(await prettify(minified))).toEqual(minified);
    });
  });
});
