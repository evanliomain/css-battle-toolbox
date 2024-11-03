export function minify(code) {
  return (
    code
      .trim()
      .replaceAll(/<!--.*-->/g, "")
      .replaceAll(/transparent/g, "#0000")
      .replaceAll(/\s+/g, " ")
      .replaceAll(/\s*\#/g, "#")
      .replaceAll(/:\s*/g, ":")
      .replaceAll(/,\s*/g, ",")
      .replaceAll(/\s*;\s*/g, ";")
      .replaceAll(/%\s*/g, "%")
      .replaceAll(/\(\s*/g, "(")
      .replaceAll(/\s*\)\s*/g, ")")
      .replaceAll(/>\s*/g, ">")
      .replaceAll(/\s*\/\s*/g, "/")
      .replaceAll(/\s+(\d)/g, " $1")
      .replaceAll(/\s*\{\s*/g, "{")
      .replaceAll(/\s+\*\s+/g, " * ")
      .replaceAll(/\s+\-/g, " -")
      .replaceAll(/(\d) \-/g, "$1-")
      // Trim leading 0
      .replaceAll(/(\D)0+\./g, "$1.")
      // Trim trailing 0
      .replaceAll(/\.(\d)*([1-9])0+/g, ".$1$2")
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
  );
}
