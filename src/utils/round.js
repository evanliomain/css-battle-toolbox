export function round(n, precision = 2) {
  if ("number" === typeof n) {
    return n.toFixed(precision);
  }
  return n;
}
