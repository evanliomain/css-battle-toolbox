import { MATH, optimizeCss } from "./css-optimize";

// Stand for the spaces around a + or - of a calc(), no regex below matches them
const BEFORE = "\u0000";
const AFTER = "\u0001";

export function minify(code) {
  return (
    markMathOperators(optimizeCss(code))
      .replaceAll(" ", "&nbsp;")
      .trim()
      // Remove comments
      .replaceAll(/<!--.*-->/g, "")
      // transform transparent into #0000
      .replaceAll(/transparent/g, "#0000")
      // Remove extra space
      .replaceAll(/\s+/g, " ")
      // Replace 0 alone by .0
      .replaceAll(/\s0\s+0\./g, " .0.")
      // Trim leading 0 before space remove
      .replaceAll(/(\s)0+\./g, "$1.")
      // Trim leading 0 after a minus sign: -0.56 => -.56
      .replaceAll(/(-)0+\./g, "$1.")
      .replaceAll(/\s*\#/g, "#")
      .replaceAll(/:\s*/g, ":")
      .replaceAll(/,\s*/g, ",")
      .replaceAll(/\s*;\s*/g, ";")
      // Remove all space after %
      .replaceAll(/%\s*/g, "%")
      // Add a space between % and -, when - is followed by a space
      .replaceAll(/%\-\s/g, "% - ")
      .replaceAll(/\(\s*/g, "(")
      .replaceAll(/\s*\)\s*/g, ")")
      .replaceAll(/>\s*/g, ">")
      .replaceAll(/\s*\/\s*/g, "/")
      .replaceAll(/\s+(\d)/g, " $1")
      .replaceAll(/\s*\{\s*/g, "{")
      .replaceAll(/\s+\*\s+/g, " * ")
      // Remove multiple space before - to keep 1 space
      .replaceAll(/\s+\-/g, " -")
      // Remove space between a digit and -
      .replaceAll(/(\d) \-/g, "$1-")
      .replaceAll(/\s*([{}:;,])\s*/g, "$1")
      // Trim trailing 0
      .replaceAll(/\.(\d*)([1-9])0+(\D)/g, ".$1$2$3")
      .replaceAll(/\+\s+(\S)/g, "+$1")
      .replaceAll(/(\S)\s+\+/g, "$1+")
      .replaceAll(/\>\s*\*/g, ">*")
      .replaceAll(/~\s*\*/g, "~*")
      .replaceAll(/\*\s*\>/g, "*>")
      .replaceAll(/\&\s*\>/g, "&>")
      .replaceAll(/\}\s*/g, "}")
      .replaceAll(/;\s*\}/g, "}")
      .replace(/;?(\s*})*(<\/style>)?$/, "")
      .replaceAll(/\)*$/g, "")
      .replaceAll(/\"\"$/g, '"')
      .replaceAll(/\'\'$/g, "'")
      .replaceAll(/\s*\"$/g, '"')
      .replaceAll(/\s*\'$/g, "'")
      // Trim space between a letter and 2 quotes
      .replaceAll(/([a-zA-Z])\s+\"\"/g, '$1""')
      .replaceAll(/([a-zA-Z])\s+\'\'/g, "$1''")
      // Trim space between a digit and 2 quotes: font:0 "" => font:0""
      .replaceAll(/(\d)\s+(""|'')/g, "$1$2")

      // Trim space between 2 number with dot: 1.1 .4 => 1.1.4
      .replaceAll(/\.(\d+)\s+\.(\d)/g, ".$1.$2")
      // Trim space between 2 number with dot and unit: 83Q .5Q => 83Q.5Q
      .replaceAll(/(\d+)([a-zA-Z]+)\s+\.(\d)/g, "$1$2.$3")
      // Trim space between 1 hexa color and 1 number with dot: #FA1234 .4 => #FA1234.4
      .replaceAll(/(#[a-fA-F0-9]{6})\s+\.(\d)/g, "$1.$2")
      .replaceAll(/(#[a-fA-F0-9]{4})\s+\.(\d)/g, "$1.$2")
      .replaceAll(/(#[a-fA-F0-9]{3})\s+\.(\d)/g, "$1.$2")
      .replaceAll(/([a-z]) (\.\d)/g, "$1$2")
      // A + or - of a calc() needs its spaces: calc(1px+1em) is invalid
      .replaceAll(new RegExp(`${BEFORE}([+-])${AFTER}\\s*`, "g"), " $1 ")
      .replaceAll("&nbsp;", " ")
  );
}

/**
 * Marks the + and - operators of the math functions, spaced on both sides, so
 * that the minifier keeps their spaces, and glues their *.
 */
function markMathOperators(code) {
  // Whether each open parenthesis is the one of a math function
  const stack = [];
  let out = "";
  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    if ('"' === char || "'" === char) {
      const end = code.indexOf(char, i + 1);
      const close = -1 === end ? code.length : end + 1;
      out += code.slice(i, close);
      i = close - 1;
      continue;
    }
    if ("(" === char) {
      const name = /[-\w]*$/.exec(code.slice(0, i))[0].toLowerCase();
      stack.push(MATH.has(name) || ("" === name && true === stack.at(-1)));
    } else if (")" === char) {
      stack.pop();
    } else if (true === stack.at(-1)) {
      const operator = /^\s+([+-])\s+/.exec(code.slice(i));
      if (null !== operator) {
        // The space after the operator stays, for the minifier to trim 0.5
        out += `${BEFORE}${operator[1]}${AFTER} `;
        i += operator[0].length - 1;
        continue;
      }
      // * needs no space
      const times = /^\s*\*\s*/.exec(code.slice(i));
      if (null !== times && "" !== times[0].trim()) {
        out += "*";
        i += times[0].length - 1;
        continue;
      }
    }
    out += char;
  }
  return out;
}
