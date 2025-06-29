export function minify(code) {
  return (
    code
    .replaceAll(' ', '&nbsp;')
      .trim()
      // Remove comments
      .replaceAll(/<!--.*-->/g, "")
      // transform transparent into #0000
      .replaceAll(/transparent/g, "#0000")
      // Replace border-*-width:0 or none with border-*:0;
      .replaceAll(/border-(top|right|bottom|left)-width:\s*(0|none)/g, "border-$1:$2;")
      // Remove extra space
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
      .replaceAll(/\s*([{}:;,])\s*/g, "$1")
      // Trim leading 0
      .replaceAll(/(\D)0+\./g, "$1.")
      // Trim trailing 0
      .replaceAll(/\.(\d*)([1-9])0+(\D)/g, ".$1$2$3")
      .replaceAll(/\+\s+(\S)/g, "+$1")
      .replaceAll(/(\S)\s+\+/g, "$1+")
      .replaceAll(/\>\s*\*/g, ">*")
      .replaceAll(/\*\s*\>/g, "*>")
      .replaceAll(/\&\s*\>/g, "&>")
      .replaceAll(/\}\s*/g, "}")
      .replaceAll(/;\s*\}/g, "}")
      .replaceAll(/;;+/g, ";")
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
      .replaceAll(/([a-z]) (\.\d)/g, "$1$2")
      .replaceAll('&nbsp;', ' ')
  );
}
