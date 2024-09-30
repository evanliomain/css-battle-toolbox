import { doAsync } from "./utils/do-async";

// Remove sponsor
doAsync(removeAds)();

// Remove Global stats
document
  .querySelector(".container__item--output .item__content > :nth-child(2)")
  .remove();

doAsync(removeTwitter)();

// Remove ads
function removeAds() {
  const node = document.querySelector(
    ".container__item--target .item__content > .inner-header",
  );
  if (null === node) {
    return false;
  }
  node.remove();
  document
    .querySelector(
      ".container__item--target .item__content .sponsor-containerr",
    )
    .remove();
  return true;
}

function removeTwitter() {
  const node = document.querySelector(
    ".container__item--output .item__content .score-container > div div:has(a)",
  );
  if (null === node) {
    return false;
  }

  node.remove();
  return true;
}
