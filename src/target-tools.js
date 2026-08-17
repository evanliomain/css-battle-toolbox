import "./target-tools.css";
import { htmlToElement } from "./utils/html-to-element";
import { mount } from "./utils/mount";

mount("target-tools", {
  selectors: {
    img: ".container__item--target img",
    // Both buttons go here. It used to be looked up per button with a bare
    // `return`, so a missing header silently skipped them instead of retrying.
    container: ".container__item--target .item__header :first-child",
  },
  init({ container, img }, onCleanup) {
    const buttons = [
      addCopyImageUrl(container, img),
      addLinkToPreviewer(container, img),
    ];
    onCleanup(() => buttons.forEach((button) => button.remove()));
  },
});

function addCopyImageUrl(container, img) {
  const btn = htmlToElement(template());
  container.insertAdjacentElement("beforeend", btn);
  btn.addEventListener("click", () => {
    // Copy the image url to the clipboard
    navigator.clipboard.writeText(img.getAttribute("src"));
  });
  return btn;
}

function addLinkToPreviewer(container, img) {
  const btn = htmlToElement(templateLink(previewerUrl(img)));
  container.insertAdjacentElement("beforeend", btn);
  // Refresh the href from the live img just before navigating, so the link never
  // points at the previous battle's target after a client-side navigation.
  btn.addEventListener("click", () => {
    btn.href = previewerUrl(img);
  });
  return btn;
}

function previewerUrl(img) {
  const imageUrl = img.getAttribute("src");
  return `https://cssutils.com/cssbattle-previewer/?mode=custom&image=${encodeURIComponent(imageUrl)}`;
}

function template() {
  return `
  <button
    type="button"
    id="cbt-copy-image-url"
    class="button button--mini hint--bottom"
    style="margin-right: 0;"
    aria-label="Copy image url"
    data-hint="Copy image url"
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" x="0" y="0"
    height="20"
    width="20"
    >
      <path
        d="M 32.71 5.57 H 17.15 a 3.85 3.85 0 0 0 -3.85 3.85 v 3.75 h -4 A 3.85 3.85 0 0 0 5.44 17 V 32.58 a 3.86 3.86 0 0 0 3.85 3.85 H 24.85 a 3.85 3.85 0 0 0 3.85 -3.85 V 28.83 h 4 A 3.85 3.85 0 0 0 36.56 25 V 9.42 A 3.86 3.86 0 0 0 32.71 5.57 Z m -7.09 27 a 0.77 0.77 0 0 1 -0.77 0.77 H 9.29 a 0.78 0.78 0 0 1 -0.77 -0.77 V 17 a 0.77 0.77 0 0 1 0.77 -0.77 H 24.85 a 0.76 0.76 0 0 1 0.77 0.77 V 32.58 Z M 33.48 25 a 0.77 0.77 0 0 1 -0.77 0.77 h -4 V 17 a 3.85 3.85 0 0 0 -3.85 -3.85 H 16.38 V 9.42 a 0.77 0.77 0 0 1 0.77 -0.77 H 32.71 a 0.78 0.78 0 0 1 0.77 0.77 Z" />
    </svg>
  </button>
  `;
}

function templateLink(url) {
  return `
  <a
    id="cbt-link-to-previewer-url"
    class="button button--mini hint--bottom"
    style="margin-right: 0; padding: 5px"
    aria-label="See in the previewer"
    data-hint="See in the previewer"
    href="${url}"
    target="_blank"
  >
    <img
      src="https://cssutils.com/cssbattle-previewer/cssbattle_previewer.png"
      aria-hidden="true"
      style="height:1em; width:1em;"
    >
  </a>
  `;
}
