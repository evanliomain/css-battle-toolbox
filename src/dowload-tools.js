import { doAsync } from "./utils/do-async";
import { download } from "./utils/download";

doAsync(() => {
  const pillToday = document.querySelector(
    ".home-daily-target-panel .hstack > div:has(.target-today) .pill",
  );

  if (null === pillToday) {
    return false;
  }
  pillToday.style.cursor = "pointer";
  pillToday.addEventListener("click", (e) => {
    const imgUrl = document.querySelector(
      ".home-daily-target-panel .hstack > div:has(.target-today) img",
    ).src;
    download(imgUrl);
  });
  return true;
})();
