import { mount } from "./utils/mount";

// Auto close Code Golf objectif.
// The pill is legitimately absent outside Code Golf battles, so this gives up
// quickly instead of polling for the full default timeout.
mount("autoclose-tools", {
  timeout: 5000,
  selectors: {
    closeBtn: 'a[class^="BattleModeInfoPill_closeBtn__"]',
  },
  init({ closeBtn }) {
    closeBtn.click();
  },
});
