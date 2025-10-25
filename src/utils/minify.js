export function minify(code) {
  return (
    code
      .replaceAll(" ", "&nbsp;")
      .trim()
      // Remove comments
      .replaceAll(/<!--.*-->/g, "")
      // transform transparent into #0000
      .replaceAll(/transparent/g, "#0000")
      // Remove extra space
      .replaceAll(/\s+/g, " ")
      // Trim leading 0 before space remove
      .replaceAll(/(\s)0+\./g, "$1.")
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
      // Trim space between 2 number with dot: 1.1 .4 => 1.1.4
      .replaceAll(/\.(\d+)\s+\.(\d)/g, ".$1.$2")
      // Trim space between 2 number with dot and unit: 83Q .5Q => 83Q.5Q
      .replaceAll(/(\d+)([a-zA-Z]+)\s+\.(\d)/g, "$1$2.$3")
      // Trim space between 1 hexa color and 1 number with dot: #FA1234 .4 => #FA1234.4
      .replaceAll(/(#[a-fA-F0-9]{6})\s+\.(\d)/g, "$1.$2")
      .replaceAll(/(#[a-fA-F0-9]{4})\s+\.(\d)/g, "$1.$2")
      .replaceAll(/(#[a-fA-F0-9]{3})\s+\.(\d)/g, "$1.$2")
      .replaceAll(/([a-z]) (\.\d)/g, "$1$2")
      .replaceAll("&nbsp;", " ")
  );
}
