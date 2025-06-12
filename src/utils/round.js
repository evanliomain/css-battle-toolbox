export function round(n, precision = 2) {
  if ("number" === typeof n) {
    return n.toFixed(precision).replace(".00", "");
  }
  return n;
}
