export function htmlToElement(html) {
  return new DOMParser().parseFromString(html, "text/html").body
    .firstElementChild;
}