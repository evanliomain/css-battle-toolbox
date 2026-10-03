import { describe, expect, it } from "vitest";
import { optimizeCss } from "./css-optimize";
import { minify } from "./minify";

const style = (css) => `<style>*{${css}`;

describe("optimizeCss", () => {
  describe("shortens the values", () => {
    it.each([
      // Units on a zero length
      ["margin: 0px 0em", "margin:0"],
      ["box-shadow: 0px 0Q 0vw red", "box-shadow:0 0 0 red"],
      [
        "background: linear-gradient(red 0px, blue)",
        "background:linear-gradient(red 0,blue",
      ],
      // Useless signs and leading zeros
      ["margin: +5px -0px", "margin:5 0"],
      ["z-index: 01", "z-index:1"],
      ["box-shadow: -0.0px 1px", "box-shadow:0 1px"],
      // Scientific notation, when shorter
      ["width: 10000px", "width:1e4"],
      ["box-shadow: 10000Q 0", "box-shadow:1e4Q 0"],
      ["opacity: 0.0001", "opacity:1e-4"],
      ["box-shadow: 2.5e1px 0", "box-shadow:25px 0"],
      ["box-shadow: 1e4px 0", "box-shadow:1e4px 0"],
      // !important
      ["color: red !important", "color:red!important"],
      ["color: red ! important", "color:red!important"],
      // * in a function
      ["height: calc(2 * var(--a))", "height:calc(2*var(--a"],
      // Quotes
      ['font-family: "Arial"', "font-family:Arial"],
      [
        "font-family: 'Times New Roman', serif",
        "font-family:Times New Roman,serif",
      ],
      ['font: 12px "Arial"', "font:12px Arial"],
      ['font: 0 "";color: red', 'font:0"";color:red'],
      // Quirks mode lengths
      ["margin: 10px 20px", "margin:10 20"],
      ["font-size: 12px", "font-size:12"],
      ["clip: rect(1px, 2px, 3px, 4px)", "clip:rect(1,2,3,4"],
      ["margin: 10px 0.5px", "margin:10 .5"],
      ["margin:10px.5px", "margin:10 .5"],
      // Repeated sides
      ["margin: 10px 10px 10px 10px", "margin:10"],
      ["margin: 1 2 3 2", "margin:1 2 3"],
      ["padding: 1 2 1 2", "padding:1 2"],
      ["inset: 0 0 0 0", "inset:0"],
      [
        "margin: calc((1px + 2em) * 2) calc((1px + 2em) * 2)",
        "margin:calc((1px + 2em)*2",
      ],
      [
        "border-radius: 1em 1em 1em 1em / 2em 3em 2em 3em",
        "border-radius:1em/2em 3em",
      ],
      // Default arguments
      [
        "transform: translate(10px, 0) scale(2, 2)",
        "transform:translate(10px)scale(2",
      ],
      ["transform: translate(10px, 0px)", "transform:translate(10px"],
      ["translate: 10px 0 0", "translate:10px"],
      ["scale: 2 2 1", "scale:2"],
      // Initial values of the shorthands
      ["border: none", "border:0"],
      ["border-top: none", "border-top:0"],
      ["background: red none repeat scroll 0 0", "background:red"],
      ["background: none", "background:0"],
      ["background: red left top", "background:red"],
      ["background: red top left", "background:red"],
      [
        "background: red, blue 0% 0% padding-box border-box",
        "background:red,blue",
      ],
      ["border: 1px solid currentColor", "border:1px solid"],
      ["outline: currentcolor solid", "outline:solid"],
      [
        "box-shadow: 0 0 5px currentColor, 1px 1px red",
        "box-shadow:0 0 5px,1px 1px red",
      ],
      // Keywords as numbers
      ["font-weight: bold", "font-weight:700"],
      ["font-weight: normal", "font-weight:400"],
      ["font: bold 12px a", "font:700 12px a"],
      // Angles
      ["rotate: 360deg", "rotate:1turn"],
      ["rotate: 720deg", "rotate:2turn"],
      ["rotate: 0.25turn", "rotate:90deg"],
      ["rotate: -360deg", "rotate:-1turn"],
      ["transform: rotate(400grad)", "transform:rotate(1turn"],
      // Hex colors without #, in quirks mode
      ["color: #84271C", "color:84271C"],
      ["color: #120EAE", "color:120EAE"],
      ["color: #A20E1E", "color:A20E1E"],
      ["color: #112200", "color:112200"],
      ["color: #001122", "color:001122"],
      ["color: #10000a", "color:10000a"],
      ["color: #fff", "color:fff"],
      ["color: #fff !important", "color:fff!important"],
      ["background-color: #84271c", "background-color:84271c"],
      ["border-color: #fff #84271C", "border-color:fff 84271C"],
      ["border-color: #fff #000", "border-color:fff#000"],
      ["border-top-color: #84271C", "border-top-color:84271C"],
      ["border-right-color: #84271C", "border-right-color:84271C"],
      ["border-bottom-color: #84271C", "border-bottom-color:84271C"],
      ["border-left-color: #84271C", "border-left-color:84271C"],
      // calc() on constants
      ["height: calc(2 * 3px)", "height:6"],
      ["height: calc(100px - 10px)", "height:90"],
      ["box-shadow: calc(100px - 10px) 0", "box-shadow:90px 0"],
      ["width: calc((1px + 2px) * 3)", "width:9"],
      ["width: calc(calc(2px * 3) / 4)", "width:1.5"],
      ["width: calc(-1 * -10px)", "width:10"],
      ["width: calc(50% * 2)", "width:100%"],
      ["transform: translate(calc(2 * 3px), 0)", "transform:translate(6px"],
      ["width: min(calc(2 * 3px), 10%)", "width:min(6px,10%"],
      ["rotate: calc(180deg * 2)", "rotate:1turn"],
    ])("%s → %s", (css, minified) => {
      expect(minify(style(css))).toEqual(style(minified));
      expect(minify(style(minified))).toEqual(style(minified));
    });
  });

  describe("leaves the values that would change", () => {
    it.each([
      // 0% is not always 0, a unitless 0 is a number in calc() and in flex
      "background: 0% 50%",
      "width: calc(0px + 1em)",
      "flex: 1 0px",
      "transition: 0s",
      "rotate: 0deg",
      // No quirk outside lengths, shorthands and functions
      "line-height: 10px",
      "border: 10px solid red",
      "background: red 10px 20px",
      "translate: 10px 10px",
      "margin-inline: 10px",
      // 1e4 is no integer
      "z-index: 10000",
      "scale: 10000",
      // Not shorter
      "rotate: 90deg",
      "rotate: 180deg",
      "box-shadow: 100px 0",
      // calc() that cannot be folded, or would turn negative or inexact
      "width: calc(100% - 10px)",
      "height: calc(10px - 20px)",
      "width: calc(1px / 3)",
      "width: calc(1px / 0)",
      "width: calc(2px*3px)",
      "z-index: calc(3 / 2)",
      "width: calc(1px 2px)",
      "width: calc(1px + a)",
      "width: calc(1px +)",
      // Quotes that are needed
      'font-family: "serif"',
      'font-family: "1a"',
      'content: "a"',
      "font: 12px ''",
      // Hex colors quirks mode would read otherwise, or not at all
      "color: #f008",
      "color: #ff000080",
      "color: #1ea",
      "color: #123",
      "color: #1e0",
      "color: #120E1E",
      "color: #1E2A3B",
      "color: #fffggg",
      "color: red",
      "outline-color: #84271C",
      "border-block-color: #84271C",
      "border: 1px solid #84271C",
      "background: #84271C",
      "box-shadow: 0 0 #84271C",
      // Hashless colors are no numbers
      "color: 001122",
      "box-shadow: 10000a 0",
      // var() may hold several values
      "margin: var(--a) var(--a)",
      "transform: scale(var(--a), var(--a))",
      // Custom properties have no type
      "--a: 0px",
      "--a: calc(2 * 3px)",
      // Not the whole value
      "border: currentColor",
      "outline: none",
      "border-radius: 1em 2em 3em 4em",
      "margin: 1 2 3 4",
      "background: linear-gradient(red, blue) 0 0/50%",
      "transform: translate(0, 10px)",
      "transform: scale(2, 3)",
      "font: bold large serif",
      "background: url(a.png) 0 0",
    ])("%s", (css) => {
      const code = `<style>*{${css}}`;
      expect(optimizeCss(code)).toEqual(code);
    });
  });

  describe("rules and selectors", () => {
    it.each([
      [
        "<style>*{color:red;;;background:blue}",
        "<style>*{color:red;background:blue",
      ],
      ["<style>*{}p{color:red}", "<style>p{color:red"],
      ["<style>*{*{}}p{color:red}", "<style>p{color:red"],
      ["<style>*{margin:0}*{", "<style>*{margin:0"],
      // A } closing nothing
      ["<style>*{margin:0}}p{margin:0", "<style>*{margin:0}}p{margin:0"],
      // A ; or a quote in a string
      [
        '<style>*{content:"a\\";b";margin:10px',
        '<style>*{content:"a\\";b";margin:10',
      ],
      // Unclosed functions and parentheses
      [
        "<style>*{transform:translate(10px, 0",
        "<style>*{transform:translate(10px",
      ],
      [
        "<style>*{margin:0px calc((1px + 2em",
        "<style>*{margin:0 calc((1px + 2em",
      ],
      ["<style>div > p{color:red}", "<style>div >p{color:red"],
      ["<style>p ~ *{color:red}", "<style>p ~*{color:red"],
      ['<style>[a="b"]{color:red}', "<style>[a=b]{color:red"],
      ["<style>[a ^= 'b-c']{color:red}", "<style>[a^=b-c]{color:red"],
      ['<style>[a="1b"]{color:red}', '<style>[a="1b"]{color:red'],
      ['<style>[a="b c"]{color:red}', '<style>[a="b c"]{color:red'],
      [
        "<style>p:nth-child(2n+1){color:red}",
        "<style>p:nth-child(odd){color:red",
      ],
      [
        "<style>p:nth-last-of-type( 2n + 1 ){color:red}",
        "<style>p:nth-last-of-type(odd){color:red",
      ],
      [
        "<style>p:nth-child(even){color:red}",
        "<style>p:nth-child(2n){color:red",
      ],
      ["<style>*{margin:10px;*{width:10px", "<style>*{margin:10;*{width:10"],
      [
        "<style>@keyframes a{from{rotate:360deg}}",
        "<style>@keyframes a{from{rotate:1turn",
      ],
      ["<style>*{margin:10px}</style><p>", "<style>*{margin:10}</style><p>"],
      // Several style blocks, and style attributes
      ['<p style="margin:10px 10px"></p>', '<p style="margin:10"></p>'],
      [
        "<p style='font-family: \"Arial\"'></p>",
        "<p style='font-family:Arial'></p>",
      ],
      [
        '<style>*{margin:10px}</style><p style="width: 0px"><style>p{width:0px',
        '<style>*{margin:10}</style><p style="width:0"><style>p{width:0',
      ],
    ])("%s → %s", (code, minified) => {
      expect(minify(code)).toEqual(minified);
      expect(minify(minified)).toEqual(minified);
    });

    it("leaves the code out of the styles", () => {
      const code = '<p a="b">margin: 10px; width: calc(2 * 3px)</p>';
      expect(optimizeCss(code)).toEqual(code);
    });

    it("leaves a declaration it does not understand", () => {
      const code = "<style>*{grid-template-columns:[a] 10px;color:red\\9";
      expect(optimizeCss(code)).toEqual(code);
    });

    it.each([
      "<style>*{margin:10px/* a; b */;padding:0",
      "<style>*{margin:10px/* a",
      "<style>*{margin:10px /* a */ 10px",
    ])("leaves a declaration with a comment: %s", (code) => {
      expect(optimizeCss(code)).toEqual(code);
    });

    it("leaves a code without any style", () => {
      expect(optimizeCss("margin: 10px 10px")).toEqual("margin: 10px 10px");
    });
  });

  describe("keeps the minified tricks", () => {
    it.each([
      "<style>&{scale:.07.5",
      "<style>*{box-shadow:.5.0.1ch red",
      "<style>*{box-shadow:83Q.5Q",
      "<style>*{outline:solid.6lh#0b2429",
      "<style>*{margin:10%-10;height:min(100% - 20ch",
      "<style>*{font:12px'",
      "<style>*{padding:calc(120px + var(--b",
      "<style>*{box-shadow:-9vw 0#f7ec7d;*{margin:0-54 0 54",
    ])("%s", (minified) => {
      expect(minify(minified)).toEqual(minified);
    });

    it("re-spaces a changed value for the minifier to compact", () => {
      expect(
        optimizeCss("<style>*{box-shadow:.5.0.1ch red,0 0 currentColor"),
      ).toEqual("<style>*{box-shadow: 0.5.0.1ch red, 0 0");
      expect(
        minify("<style>*{box-shadow:.5.0.1ch red,0 0 currentColor"),
      ).toEqual("<style>*{box-shadow:.5.0.1ch red,0 0");
    });
  });
});
