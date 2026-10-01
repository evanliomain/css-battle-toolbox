import { describe, expect, it } from "vitest";
import { colorSlotAt } from "./css-color-slot";

/** In a rule of an unclosed <style>, like most cssbattle golf. */
const rule = (declaration) => `<p></p><style>p{${declaration}`;

describe("colorSlotAt", () => {
  describe("where CSS is", () => {
    it.each([
      ["an unclosed <style>", "<style>p{color:"],
      ["a <style> with attributes", '<style media="all">p{color:'],
      ["an uppercase <STYLE>", "<STYLE>p{color:"],
      ["a nested rule", "<style>p{&:hover{color:"],
      ["the next declaration", "<style>p{width:9px;color:"],
      ["the next rule", "<style>i{color:red}p{color:"],
      ["the last of several <style>", "<style>i{}</style><style>p{color:"],
      ["a double quoted style attribute", '<p style="color:'],
      ["a single quoted style attribute", "<p style='color:"],
      ["an unquoted style attribute", "<p style=color:"],
      ["spaces around the equal sign", '<p style = "color:'],
      ["a single quoted value before", "<p title='a>b' style=\"color:"],
      ["a style attribute after others", '<p id="a>b" class=x style="color:'],
      ["the next declaration of an attribute", '<p style="width:9px;color:'],
      [
        "a style attribute after a closed <style>",
        '<style>p{}</style><p style="color:',
      ],
      ["a comment before", "<style>p{/* a:b; */color:"],
      ["a string before", '<style>p{content:"}";color:'],
    ])("accepts a color in %s", (_, code) => {
      expect(colorSlotAt(code)).toBe(true);
    });

    it.each([
      ["plain HTML", "<p>color:"],
      ["an empty code", ""],
      ["a closed <style>", "<style>p{color:red}</style>color:"],
      ["a <style> outside any rule", "<style>color:"],
      ["a <style> whose rule is closed", "<style>p{}color:"],
      ["a <style> tag not closed yet", "<style media=color:"],
      ["another attribute", '<p title="color:'],
      ["a closed style attribute", '<p style="color:red">color:'],
      ["a closed tag", "<p style=a>color:"],
      ["an attribute after the style attribute", '<p style="color:" title="'],
      ["a comment opened by /*/", "<style>p{/*/color:"],
      ["a declaration in a single quoted string", "<style>p{content:'a;color:"],
      ["a quote before the style attribute", '<p title="a style="color:'],
      ["a comment", "<style>p{/* color:"],
      ["a string", '<style>p{content:"color:'],
      ["a single quoted string", "<style>p{content:'color:"],
    ])("refuses a color in %s", (_, code) => {
      expect(colorSlotAt(code)).toBe(false);
    });
  });

  describe("which declaration", () => {
    it.each([
      ["a color property", "color:"],
      ["spaces around the colon", "color :  "],
      ["an uppercase property", "COLOR:"],
      ["a custom property", "--color:"],
      ["a custom property with a value", "--c:red "],
      ["a prefixed property", "-webkit-text-stroke:1px "],
    ])("accepts %s", (_, declaration) => {
      expect(colorSlotAt(rule(declaration))).toBe(true);
    });

    it.each([
      ["a property being typed", "colo"],
      ["a property followed by a space", "color "],
      ["an empty property", ":"],
      ["a custom property with a space", "--a b:"],
      ["a custom property after a word", "a--c:"],
      ["a selector being typed", "a"],
      ["a property without colors", "width:"],
      ["an unknown property", "colour:"],
      ["a property with a digit", "c0lor:"],
      ["a bare --", "--:"],
      ["an !important value", "color:red !"],
      ["after !important", "border:1px !important "],
      ["a pseudo class being typed", "a:hover{"],
    ])("refuses %s", (_, declaration) => {
      expect(colorSlotAt(rule(declaration))).toBe(false);
    });
  });

  describe("where in the value", () => {
    it.each([
      ["a shorthand", "border:10px solid "],
      ["the start of a shorthand", "border:"],
      ["background", "background:url(a.png) no-repeat "],
      ["background after a position and size", "background:0 0/9px "],
      ["the last background layer", "background:url(a.png),"],
      ["the second shadow", "box-shadow:0 0 5px red,1px 1px "],
      ["a text shadow", "text-shadow:1px 1px "],
      ["a second border color", "border-color:red "],
      ["a fourth border color", "border-color:red blue #000 "],
      ["a second scrollbar color", "scrollbar-color:red "],
      ["an outline", "outline:2px dashed "],
      ["a gradient", "background:linear-gradient("],
      ["a gradient after a space", "background:linear-gradient( "],
      ["a comment as a separator", "border:1px/**/"],
      ["cross-fade() after a percentage", "background:cross-fade(50% "],
      ["a gradient in a custom property", "--c:linear-gradient("],
      ["drop-shadow() in a custom property", "--c:drop-shadow("],
      ["a second border-block color", "border-block-color:red "],
      ["a second border-inline color", "border-inline-color:red "],
      ["a gradient's second stop", "background:linear-gradient(red 50%,"],
      ["a gradient after a direction", "background:linear-gradient(45deg,"],
      [
        "a gradient after a keyword direction",
        "background:linear-gradient(to right,",
      ],
      ["a radial gradient", "background:radial-gradient(circle at 50%,"],
      ["a conic gradient", "background:conic-gradient(from 90deg,"],
      ["a repeating gradient", "background:repeating-linear-gradient("],
      ["a prefixed gradient", "background:-webkit-linear-gradient("],
      ["an uppercase gradient", "background:LINEAR-GRADIENT("],
      ["a gradient in background-image", "background-image:linear-gradient("],
      ["a gradient in a mask", "mask:radial-gradient("],
      [
        "a second gradient",
        "background:linear-gradient(red,blue),linear-gradient(",
      ],
      ["a gradient in image-set", "background:image-set(linear-gradient("],
      ["image()", "background:image("],
      ["image() after an image", "background:image(url(a.png),"],
      ["cross-fade()", "background:cross-fade("],
      ["cross-fade() second image", "background:cross-fade(red 50%,"],
      ["a gradient in cross-fade()", "background:cross-fade(linear-gradient("],
      ["drop-shadow()", "filter:drop-shadow(2px 2px "],
      ["drop-shadow() first", "filter:drop-shadow("],
      ["drop-shadow() after another filter", "filter:blur(2px) drop-shadow("],
      ["drop-shadow() in backdrop-filter", "backdrop-filter:drop-shadow("],
      ["color-mix()", "color:color-mix(in srgb,"],
      ["color-mix() second color", "color:color-mix(in srgb,red 30%,"],
      ["light-dark()", "color:light-dark("],
      ["light-dark() second color", "color:light-dark(red,"],
      ["relative color", "color:rgb(from "],
      ["relative oklch", "color:oklch(from "],
      ["a var() fallback", "color:var(--c,"],
      ["a var() fallback in a shorthand", "border:1px solid var(--c,"],
      ["a gradient in a var() fallback", "background:var(--c,linear-gradient("],
      [
        "a color-mix in a gradient",
        "background:linear-gradient(color-mix(in srgb,",
      ],
      ["after a closed function", "border:calc(1px + 2px) solid "],
      ["-webkit-text-fill-color", "-webkit-text-fill-color:"],
      ["fill", "fill:url(#a) "],
      ["caret", "caret:"],
      ["text-decoration", "text-decoration:underline wavy "],
      ["column-rule", "column-rule:1px solid "],
    ])("accepts %s", (_, declaration) => {
      expect(colorSlotAt(rule(declaration))).toBe(true);
    });

    it.each([
      ["after the color of a shorthand", "border:10px solid red "],
      ["after a hex color", "color:#fff "],
      ["after an uppercase named color", "color:RED "],
      ["after transparent", "color:transparent "],
      ["after currentcolor", "border:1px solid currentColor "],
      ["after a system color", "color:Canvas "],
      ["after a color function", "color:rgb(0 0 0) "],
      ["after color-mix()", "color:color-mix(in srgb,red,blue) "],
      ["a fifth border color", "border-color:red blue red blue "],
      ["a third border-block color", "border-block-color:red red "],
      ["right after a slash", "background:0 0/"],
      ["after a slash", "background:0 0/ "],
      ["after a spaced slash", "background:0 0 / "],
      ["a comma in a filter", "filter:blur(1px),drop-shadow("],
      ["rgb() first channel", "color:rgb(255 "],
      ["after hsl()", "color:hsl(0 0% 0%) "],
      ["a third scrollbar color", "scrollbar-color:red blue "],
      ["a second color in a shadow", "box-shadow:0 0 red "],
      ["a comma in a single color", "color:red,"],
      ["a comma in a shorthand", "border:1px solid,"],
      ["a gradient's stop position", "background:linear-gradient(red "],
      ["a gradient's direction", "background:linear-gradient(to right "],
      ["a gradient's angle", "background:linear-gradient(45deg "],
      ["a gradient's color hint", "background:linear-gradient(red,50% "],
      ["a gradient after a slash", "background:linear-gradient(red / "],
      ["a gradient in a color property", "color:linear-gradient("],
      ["a gradient in a width", "width:linear-gradient("],
      ["a gradient in drop-shadow()", "filter:drop-shadow(linear-gradient("],
      ["image-set() itself", "background:image-set("],
      ["image() after its color", "background:image(red "],
      ["cross-fade() after its color", "background:cross-fade(red "],
      ["cross-fade() after an image", "background:cross-fade(url(a.png) "],
      ["cross-fade() in a color property", "color:cross-fade("],
      ["background-image itself", "background-image:"],
      ["filter itself", "filter:"],
      ["drop-shadow() after its color", "filter:drop-shadow(red "],
      ["drop-shadow() in background", "background:drop-shadow("],
      ["color-mix() method", "color:color-mix("],
      ["color-mix() after a color", "color:color-mix(in srgb,red "],
      ["color-mix() in a width", "width:color-mix(in srgb,"],
      ["light-dark() after a color", "color:light-dark(red "],
      ["rgb() channels", "color:rgb("],
      ["relative color channels", "color:rgb(from red "],
      ["a var() name", "color:var("],
      ["a var() fallback after a color", "color:var(--c,red "],
      ["a var() fallback in a width", "width:var(--c,"],
      ["url()", "background:url("],
      ["calc()", "border:calc("],
      ["a bare parenthesis", "color:("],
      ["a stray closing parenthesis", "color:)"],
      ["a word glued before", "color:50%"],
      ["a quoted string glued before", "border:1px solid ''"],
    ])("refuses %s", (_, declaration) => {
      expect(colorSlotAt(rule(declaration))).toBe(false);
    });
  });
});
