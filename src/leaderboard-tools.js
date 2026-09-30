import { htmlToElement } from "./utils/html-to-element";
import { mount } from "./utils/mount";
import { targetId } from "./utils/spa-router";

mount("leaderboard-tools", {
  selectors: {
    // The rank goes into the second stats box, so wait until both exist.
    statsHstack: () =>
      document
        .querySelectorAll(".leaderboard-stats-box")
        .item(1)
        ?.querySelector(".hstack"),
    outputContent: ".container__item--output > .item__content",
  },
  async init(refs, onCleanup, signal) {
    const config = await chrome.storage.sync.get("hideLeaderboard");
    if ((config.hideLeaderboard ?? false) || signal.aborted) {
      return;
    }
    // Read the battle id per mount: capturing it once at module load meant a
    // client-side navigation kept showing the previous battle's leaderboard.
    return integrateLeaderboard(targetId(), refs, onCleanup, signal);
  },
});

function integrateLeaderboard(id, refs, onCleanup, signal) {
  return scrapeSpaViaIframe(
    `https://cssbattle.dev/leaderboard/target/${id}`,
    ".leader__info__1 .leader__meta",
    [
      { key: "top1", selector: ".leader__info__1 .leader__meta" },
      { key: "top1Name", selector: ".leader__info__1 .name-link" },
      { key: "top1Img", selector: ".leader__info__1 .avatar-link__image img" },
      { key: "top2", selector: ".leader__info__2 .leader__meta" },
      { key: "top2Name", selector: ".leader__info__2 .name-link" },
      { key: "top2Img", selector: ".leader__info__2 .avatar-link__image img" },
      { key: "top3", selector: ".leader__info__3 .leader__meta" },
      { key: "top3Name", selector: ".leader__info__3 .name-link" },
      { key: "top3Img", selector: ".leader__info__3 .avatar-link__image img" },
      {
        key: "selfRank",
        selector: 'tr:has(.avatar-link__image--self) [data-column="Rank"]',
      },
      ...[4, 5, 6, 7, 8, 9, 10].map((i) => ({
        key: `top${i}`,
        selector: `tr.leaderboard__user--${i} [data-column="Meta"]`,
      })),
      ...[4, 5, 6, 7, 8, 9, 10].map((i) => ({
        key: `top${i}Name`,
        selector: `tr.leaderboard__user--${i} .name-link`,
      })),
      ...[4, 5, 6, 7, 8, 9, 10].map((i) => ({
        key: `top${i}Img`,
        selector: `tr.leaderboard__user--${i} .avatar-link__image img`,
      })),
    ],
    signal,
  )
    .then((results) => {
      // Scraping takes seconds; a navigation may have torn this mount down.
      if (signal.aborted) {
        return;
      }
      const tops = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => ({
        chars: results[`top${i}`],
        name: results[`top${i}Name`],
        img: results[`top${i}Img`],
      }));
      const [selfRank] = results.selfRank;

      // Scraped values are other players' text: set them as text and
      // attributes, never parse them as HTML, or a name could inject markup.
      // A player who never played this battle has no rank, and a battle with
      // few players has empty slots: show nothing there rather than "null".
      if (undefined !== selfRank) {
        const rank = htmlToElement(`
            <span style="letter-spacing: 0.3px; font-size: var(--font-size-2); font-family: var(--font-base); font-weight: 500; text-align: left; line-height: 1.4; font-style: normal; text-transform: none; word-break: initial; color: var(--clr-text-light);"></span>
            `);
        rank.textContent = selfRank;
        refs.statsHstack.append(rank);
        onCleanup(() => rank.remove());
      }

      const list = document.createElement("ol");
      list.append(...tops.flatMap(splitTies).map(renderTop));
      refs.outputContent.append(list);
      onCleanup(() => list.remove());
    })
    .catch((error) =>
      console.debug("[cbt] leaderboard-tools scraping failed", error),
    );
}

// Players tied on a rank share its selectors, so each value is a list: one
// entry per player, rather than "dan,eve" in a single one.
function splitTies({ chars, name, img }) {
  return name.map((player, i) => ({
    chars: chars[i],
    name: player,
    img: img[i],
  }));
}

function renderTop({ chars, name, img }) {
  const item = htmlToElement(`
    <li>
    <span></span>
    <img width="15" height="15" style="border-radius: 50%;">
    <span></span>
    </li>`);
  const [charsSpan, nameSpan] = item.querySelectorAll("span");
  charsSpan.textContent = chars ?? "";
  nameSpan.textContent = name;
  const avatar = item.querySelector("img");
  // A player may have no avatar: no image then, rather than a broken one.
  if (undefined === img) {
    avatar.remove();
  } else {
    avatar.setAttribute("src", img);
    avatar.setAttribute("alt", `${name} avatar`);
  }
  return item;
}

/**
 * Loads a same-origin SPA URL in a hidden iframe and extracts selector text.
 *
 * @param {string} url URL of the SPA page (same origin).
 * @param {string} waitingSelector The selector to wait for before extracting.
 * @param {Array<{key: string, selector: string}>} selectors What to extract.
 * @param {AbortSignal} signal Tears the iframe down early.
 * @param {number} [timeoutMs] How long to wait for the selectors to show up.
 * @returns {Promise<Object>} { [key]: string[] }, one entry per matching node
 */
async function scrapeSpaViaIframe(
  url,
  waitingSelector,
  selectors,
  signal,
  timeoutMs = 15000,
) {
  // 1) Create the iframe
  const iframe = document.createElement("iframe");
  // Lets the other tools exclude it when they look up the battle's output iframe.
  iframe.className = "cbt-scraper";
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.src = url;

  // A `finally` removes the iframe on every exit path. It used to leak whenever
  // waitForSelector timed out, which the caller then swallowed.
  signal.addEventListener("abort", () => iframe.remove());

  try {
    // 2) Wait for the initial load
    const loaded = new Promise((resolve, reject) => {
      const onLoad = () => resolve();
      const onError = () => reject(new Error(`Iframe load error for ${url}`));
      iframe.addEventListener("load", onLoad);
      iframe.addEventListener("error", onError);
    });

    document.body.appendChild(iframe);
    await loaded;
    throwIfAborted(signal);

    // 3) Helpers bound to the iframe context
    const rootDoc = iframe.contentDocument;
    const rootWin = iframe.contentWindow;
    if (!rootDoc || !rootWin) {
      throw new Error("Cannot reach the iframe DOM (check the origin matches)");
    }

    // Wait for a selector to show up in the DOM (SPA-friendly)
    const waitForSelector = (selector) =>
      new Promise((resolve, reject) => {
        const found = rootDoc.querySelector(selector);
        if (found) {
          return resolve(found);
        }

        function settle(fn, value) {
          clearTimeout(timer);
          obs.disconnect();
          fn(value);
        }

        const obs = new MutationObserver(() => {
          const el = rootDoc.querySelector(selector);
          if (el) {
            settle(resolve, el);
          }
        });
        obs.observe(rootDoc, { childList: true, subtree: true });

        const timer = setTimeout(() => {
          settle(
            reject,
            new Error(`Timeout waiting for selector: ${selector}`),
          );
        }, timeoutMs);

        const onAbort = () =>
          settle(reject, new Error(`Aborted waiting for: ${selector}`));
        signal.addEventListener("abort", onAbort);
      });

    // 4) For slow SPAs, wait for the network to settle (best-effort)
    // No standard API for that, so just delay a little after load
    await new Promise((r) =>
      rootWin.requestAnimationFrame(() => setTimeout(r, 200)),
    );
    throwIfAborted(signal);

    // 5) Wait for each selector, then extract it
    const result = {};

    await waitForSelector(waitingSelector);
    for (const { key, selector } of selectors) {
      let nodes = [];
      try {
        nodes = rootDoc.querySelectorAll(selector);
      } catch {
        // A selector engine without :has() rejects the self rank selector:
        // leave that one empty, not the whole leaderboard.
      }
      result[key] = Array.from(
        nodes,
        selector.endsWith("img") ? (n) => n.src : (n) => n.textContent.trim(),
      );
    }
    return result;
  } finally {
    iframe.remove();
  }
}

function throwIfAborted(signal) {
  if (signal.aborted) {
    throw new Error("Aborted");
  }
}
