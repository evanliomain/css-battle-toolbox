/**
 * Reads the CSS declaration some cssbattle code ends in: its property, and
 * where the value being typed stands. Shared by the snippet tool's completions.
 *
 * Works on the raw text rather than on CodeMirror's syntax tree: the tree lives
 * in the page's bundle, and plain text keeps this a pure function.
 */

/**
 * @typedef {object} Frame
 * @property {string} [name] the function, none for the value itself
 * @property {number} index which comma separated item is being typed
 * @property {string[]} tokens the words of that item, lowercase; closed
 *   functions as `name()`, slashes as `/`
 */

/**
 * @param {string} code everything before the word being typed
 * @returns {{ property: string, stack: Frame[] } | null} the declaration, its
 *   value as the functions still open, or `null` outside a declaration value
 */
export function declarationAt(code) {
  const region = cssBefore(code);
  if (null === region) {
    return null;
  }
  const css = stripCss(region.css);
  // In a <style>, declarations are only valid inside a rule.
  if (null === css || (region.block && depth(css) < 1)) {
    return null;
  }
  const declaration = css.slice(
    Math.max(css.lastIndexOf("{"), css.lastIndexOf("}"), css.lastIndexOf(";")) +
      1,
  );
  const colon = declaration.indexOf(":");
  if (-1 === colon) {
    return null;
  }
  const property = declaration.slice(0, colon).trim().toLowerCase();
  const value = declaration.slice(colon + 1);
  if (value.includes("!")) {
    return null;
  }
  const stack = parseValue(value);
  return null === stack ? null : { property, stack };
}

/**
 * The CSS the code ends in: an unclosed `<style>` block, or a `style`
 * attribute of a tag still open. `null` when the code ends in plain HTML.
 */
function cssBefore(code) {
  const styles = [...code.matchAll(/<style\b[^>]*>/gi)];
  const style = styles.at(-1);
  if (style) {
    const css = code.slice(style.index + style[0].length);
    // cssbattle golfers often leave the <style> unclosed.
    if (!/<\/style/i.test(css)) {
      return { css, block: true };
    }
  }

  const tag = /<[a-z][^<]*$/i.exec(code);
  if (!tag) {
    return null;
  }
  const attribute = /\sstyle\s*=\s*(?:"([^"]*)|'([^']*)|([^\s"'=<>`]*))$/i.exec(
    tag[0],
  );
  // The tag must still be open when the attribute starts, its other values
  // quoted or not.
  if (
    !attribute ||
    !/^(?:[^"'>]|"[^"]*"|'[^']*')*$/.test(tag[0].slice(0, attribute.index))
  ) {
    return null;
  }
  return { css: attribute[1] ?? attribute[2] ?? attribute[3], block: false };
}

function depth(css) {
  return css.split("{").length - css.split("}").length;
}

/**
 * Blanks out comments and strings, so their content is not read as CSS.
 * `null` when the code ends inside one of them: nothing to offer there.
 */
function stripCss(css) {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const char = css[i];
    if (css.startsWith("/*", i)) {
      const end = css.indexOf("*/", i + 2);
      if (-1 === end) {
        return null;
      }
      out += " ";
      i = end + 2;
    } else if ('"' === char || "'" === char) {
      const end = css.indexOf(char, i + 1);
      if (-1 === end) {
        return null;
      }
      out += '""';
      i = end + 1;
    } else {
      out += char;
      i++;
    }
  }
  return out;
}

/**
 * Splits a value into tokens, tracking the functions still open. Each frame
 * holds the tokens of its current comma separated item; closed functions
 * become a `name()` token of their parent.
 *
 * `null` when the value is broken, or when the word being typed would be glued
 * to what precedes it, like `50%red`.
 *
 * @returns {Frame[] | null}
 */
function parseValue(value) {
  const stack = [frame()];
  let word = "";
  const flush = () => {
    if (word) {
      stack.at(-1).tokens.push(word.toLowerCase());
      word = "";
    }
  };
  for (const char of value) {
    if ("(" === char) {
      stack.push(frame(word.toLowerCase()));
      word = "";
    } else if (")" === char) {
      flush();
      if (1 === stack.length) {
        return null;
      }
      const closed = stack.pop();
      stack.at(-1).tokens.push(`${closed.name}()`);
    } else if ("," === char) {
      flush();
      const top = stack.at(-1);
      top.index++;
      top.tokens = [];
    } else if ("/" === char) {
      flush();
      stack.at(-1).tokens.push("/");
    } else if (/\s/.test(char)) {
      flush();
    } else {
      word += char;
    }
  }
  return "" === word ? stack : null;
}

/** @param {string} [name] the function, none for the value itself */
function frame(name) {
  return { name, index: 0, tokens: [] };
}
