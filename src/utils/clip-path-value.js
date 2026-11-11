/**
 * Finds the clip-path value the caret stands in, in some cssbattle code, so the
 * clip-path tool knows what to draw and what to rewrite.
 */

import { declarationAt } from "./css-declaration";

const PROPERTIES = ["clip-path", "-webkit-clip-path"];

/** The word the caret may stand in, glued values like `50%0` included. */
const WORD = /[^\s,()/:;{}"'<>!]*$/;

/**
 * @param {string} code the whole code of the editor
 * @param {number} pos the caret
 * @returns {{ from: number, to: number, text: string } | null} the value, from
 *   just after its colon to its end, or `null` when the caret is elsewhere
 */
export function clipPathAt(code, pos) {
  const before = code.slice(0, pos);
  const declaration = declarationAt(before.replace(WORD, ""));
  if (null === declaration || !PROPERTIES.includes(declaration.property)) {
    return null;
  }
  const from = before.lastIndexOf(":") + 1;
  const to = valueEnd(code, pos);
  return { from, to, text: code.slice(from, to) };
}

/**
 * Where the value ends: its semicolon, the end of its rule or of its `style`
 * attribute, or `!important`. Parentheses are skipped, so an unclosed
 * function stops at the first of those that follows.
 */
function valueEnd(code, pos) {
  let depth = 0;
  for (let i = pos; i < code.length; i++) {
    const char = code[i];
    if ("(" === char) {
      depth++;
    } else if (")" === char && depth > 0) {
      depth--;
    } else if (";}\"'<>".includes(char) || ("!" === char && 0 === depth)) {
      return i;
    }
  }
  return code.length;
}
