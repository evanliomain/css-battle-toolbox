export function round(n, precision = 2) {
  if ("number" === typeof n) {
    return n
      .toFixed(precision)
      .replace(/([0-9]*\.[1-9]*)(0*)$/, "$1")
      .replace(/\.$/, "");
  }
  return n;
}
