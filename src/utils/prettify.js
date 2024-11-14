import * as prettier from "prettier";
import * as prettierPluginCss from "prettier/plugins/postcss";
import { chain } from "taninsam";

export async function prettify(code) {
  return await formatHTMLWithCSS(code);
}

async function formatHTMLWithCSS(html) {
  // Step 1: Find and extract the contents of the tag <style>
  const styleRegex = /<style[^>]*>(.*?)(<\/style>)?$/i;
  const match = html.match(styleRegex);

  if (match) {
    // Step 2: Format the CSS content
    const cssContent = await formatCSS(await formatCSS(match[1]));

    // Step 3: Replace the old CSS content with the formatted content
    html = html.replace(styleRegex, `\n<style>\n${cssContent}</style>`);
  }
  // Return the formatted HTML
  return html.replace(/^\n/m, "");
}

async function formatCSS(css) {
  return (
    chain(css)
      // Remove spaces
      .chain(replace(/\s+/g, " "))
      // delete unnecessary new lines
      .chain(trim())
      // Close the hugs if they are open without closure
      .chain(replaceAll(/([^\'])'$/g, "$1 ''"))
      .chain(replaceAll(/([^\"])"$/g, '$1 ""'))
      .chain(closeBrackets("(", ")"))
      .chain(closeBrackets())
      // Add missing semi-colon at the end of the properties
      .chain(replace(/([^;\}])(\s*})/g, "$1;$2"))
      .chain(replaceAll(/(\S)#/g, "$1 #"))
      .chain(replaceAll(/(\d)\-/g, "$1 -"))
      .chain(replaceAll(/%(\S)/g, "% $1"))
      .chain(replaceAll(/\/(\S)/g, "/ $1"))
      .chain(replaceAll(/(\S)\//g, "$1 /"))
      .chain(replaceAll(/(\d+)([a-zA-Z]+)\.(\d)/g, "$1$2 .$3"))
      // Prettify css with prettier
      .chain(awaitFn(prettifyCss))
      .chain(then(replaceAll(/\+(\s)+(\d)/g, "+$2")))
      .chain(then(replaceAll(/#0000([^a-fA-F0-9])/g, "transparent$1")))
      .value()
  );
}

function closeBrackets(open = "{", close = "}") {
  return (css) => {
    let openedBraces = 0;
    let formattedCSS = "";
    for (let i = 0; i < css.length; i++) {
      if (css[i] === open) {
        openedBraces++;
        formattedCSS += open;
      } else if (css[i] === close) {
        if (openedBraces > 0) {
          openedBraces--;
          formattedCSS += close;
        }
      } else {
        formattedCSS += css[i];
      }
    }

    // Fermer les accolades restantes
    while (openedBraces > 0) {
      formattedCSS += close;
      openedBraces--;
    }
    return formattedCSS;
  };
}

async function prettifyCss(cssCode) {
  return await prettier.format(cssCode, {
    parser: "css",
    plugins: [prettierPluginCss],
  });
}

function replace(regexp, replacement) {
  return (str) => str.replace(regexp, replacement);
}
function replaceAll(regexp, replacement) {
  return (str) => str.replaceAll(regexp, replacement);
}

function trim() {
  return (str) => str.trim();
}

function awaitFn(f) {
  return async (input) => await f(input);
}

function then(f) {
  return (promise) => promise.then(f);
}
