export function minify(code) {
  return code
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
    .replaceAll(/(\D)0+\./g, "$1.")
    .replaceAll(/\+\s+(\S)/g, "+$1")
    .replaceAll(/(\S)\s+\+/g, "$1+")
    .replaceAll(/\>\s*\*/g, ">*")
    .replaceAll(/\*\s*\>/g, "*>")
    .replaceAll(/\&\s*\>/g, "&>")
    .replaceAll(/\}\s*/g, "}")
    .replaceAll(/;\s*\}/g, "}")
    .replace(/;?(\s*})*(<\/style>)?$/, "")
    .replaceAll(/\)*$/g, "")
    .replaceAll(/\"$/g, "")
    .replaceAll(/\'$/g, "")
    .replaceAll(/\s*\"$/g, '"')
    .replaceAll(/\s*\'$/g, "'");
}
