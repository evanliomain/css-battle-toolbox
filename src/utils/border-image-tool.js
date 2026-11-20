// Shared by the parts of the border-image tool: the script injected into the
// page, and the content script that injects it.

/** Asks the page script to follow the current editor. */
export const ATTACH_EVENT = "cbt-border-image-attach";

/** Asks the page script to take its overlay down: the battle is gone. */
export const DETACH_EVENT = "cbt-border-image-detach";
