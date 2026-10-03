// cssbattle renders on Linux, with other default fonts than a Mac or Windows,
// so whatever hangs on the shape of a font comes out different here.

/**
 * Units read from the font's own metrics. `em` and `rem` are left out: they
 * only follow the font size, 16px everywhere.
 */
const METRIC_UNITS = /(?:\d|\.)r?(?:ch|ex|lh|cap|ic)\b/i;

/** `font`, `font-family`, `font-size`… */
const FONT_PROPERTY = /\bfont(?:-[a-z]+)*\s*:/i;

/**
 * Whether the render of `code` depends on the fonts: then the match measured
 * here can differ from cssbattle's.
 *
 * @param {string} code
 */
export function dependsOnFonts(code) {
  return METRIC_UNITS.test(code) || FONT_PROPERTY.test(code) || hasText(code);
}

/** Text outside the tags, such as the `.` of `<p>.`, which shows a glyph. */
function hasText(code) {
  return /\S/.test(
    code
      .replace(/<style[\s\S]*?(?:<\/style>|$)/gi, "")
      .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
      .replace(/<[^>]*>?/g, ""),
  );
}
