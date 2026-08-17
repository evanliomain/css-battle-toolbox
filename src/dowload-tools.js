import { download } from "./utils/download";
import { mount } from "./utils/mount";
import { isDailyPage } from "./utils/spa-router";

const TODAY = ".home-daily-target-panel .hstack > div:has(.target-today)";

mount("dowload-tools", {
  when: isDailyPage,
  selectors: {
    pillToday: `${TODAY} .pill`,
    img: `${TODAY} img`,
  },
  init({ pillToday, img }, onCleanup) {
    pillToday.style.cursor = "pointer";
    onCleanup(() => pillToday.style.removeProperty("cursor"));

    const onClick = () => download(img.src);
    pillToday.addEventListener("click", onClick);
    onCleanup(() => pillToday.removeEventListener("click", onClick));
  },
});
