// Shared by both halves of the clip-path tool: the content script, and the
// script it injects into the page.

/** Asks the page script to follow the current editor. */
export const ATTACH_EVENT = "cbt-clip-path-attach";

/** Asks the page script to take its overlay down: the battle is gone. */
export const DETACH_EVENT = "cbt-clip-path-detach";

/**
 * The render, not the extension's own iframes: unit-tools' calculator,
 * leaderboard-tools' scraper and dom-tools' ghost.
 */
export const RENDER =
  "iframe:not(#calcFrame):not(.cbt-scraper):not(.cbt-ghost)";

/** Where the render sits, and where the overlay goes over it. */
export const RENDER_CONTAINER = ".target-container";

/** What the bar of ready-made shapes follows, below the output. */
export const BAR_ANCHOR =
  ".container__item--output .item__content :first-child";
