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
      {
        key: "isTop1",
        selector: ".leader__info__1:has(.avatar-link__image--self)",
      },
      { key: "top2", selector: ".leader__info__2 .leader__meta" },
      { key: "top2Name", selector: ".leader__info__2 .name-link" },
      { key: "top2Img", selector: ".leader__info__2 .avatar-link__image img" },
      {
        key: "isTop2",
        selector: ".leader__info__2:has(.avatar-link__image--self)",
      },
      { key: "top3", selector: ".leader__info__3 .leader__meta" },
      { key: "top3Name", selector: ".leader__info__3 .name-link" },
      { key: "top3Img", selector: ".leader__info__3 .avatar-link__image img" },
      {
        key: "isTop3",
        selector: ".leader__info__3:has(.avatar-link__image--self)",
      },
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
      const tops = [
        { chars: results.top1, name: results.top1Name, img: results.top1Img },
        { chars: results.top2, name: results.top2Name, img: results.top2Img },
        { chars: results.top3, name: results.top3Name, img: results.top3Img },
        { chars: results.top4, name: results.top4Name, img: results.top4Img },
        { chars: results.top5, name: results.top5Name, img: results.top5Img },
        { chars: results.top6, name: results.top6Name, img: results.top6Img },
        { chars: results.top7, name: results.top7Name, img: results.top7Img },
        { chars: results.top8, name: results.top8Name, img: results.top8Img },
        { chars: results.top9, name: results.top9Name, img: results.top9Img },
        {
          chars: results.top10,
          name: results.top10Name,
          img: results.top10Img,
        },
      ];

      const rank = htmlToElement(`
            <span style="letter-spacing: 0.3px; font-size: var(--font-size-2); font-family: var(--font-base); font-weight: 500; text-align: left; line-height: 1.4; font-style: normal; text-transform: none; word-break: initial; color: var(--clr-text-light);">
            ${results.selfRank}
            </span>
            `);
      refs.statsHstack.append(rank);
      onCleanup(() => rank.remove());

      const list = htmlToElement(
        `<ol>${tops
          .map(
            ({ chars, name, img }) => `
            <li>
            <span>${chars}</span>
            <img src="${img}" alt="${name} avatar" width="15" height="15" style="border-radius: 50%;">
            <span>${name}</span>
            </li>`,
          )
          .join("")}</ol>`,
      );
      refs.outputContent.append(list);
      onCleanup(() => list.remove());
    })
    .catch(() => {});
}

/**
 * Loads a same-origin SPA URL in a hidden iframe and extracts selector text.
 *
 * @param {string} url URL of the SPA page (same origin).
 * @param {string} waitingSelector The selector to wait for before extracting.
 * @param {Array<{key: string, selector: string}>} selectors What to extract.
 * @param {AbortSignal} [signal] Tears the iframe down early.
 * @param {number} [timeoutMs] How long to wait for the selectors to show up.
 * @returns {Promise<Object>} { [key]: string | string[] | null }
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
  signal?.addEventListener("abort", () => iframe.remove(), { once: true });

  try {
    // 2) Wait for the initial load
    const loaded = new Promise((resolve, reject) => {
      const onLoad = () => resolve();
      const onError = () => reject(new Error(`Iframe load error for ${url}`));
      iframe.addEventListener("load", onLoad, { once: true });
      iframe.addEventListener("error", onError, { once: true });
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
          signal?.removeEventListener("abort", onAbort);
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
        signal?.addEventListener("abort", onAbort, { once: true });
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
    for (const sel of selectors) {
      try {
        const nodes = rootDoc.querySelectorAll(sel.selector);
        if (nodes.length > 1 && !sel.selector.endsWith("img")) {
          result[sel.key] = Array.from(nodes, (n) => n.textContent.trim());
        } else if (nodes.length > 1 && sel.selector.endsWith("img")) {
          result[sel.key] = Array.from(nodes, (n) => n.src);
        } else if (nodes.length === 1 && !sel.selector.endsWith("img")) {
          result[sel.key] = nodes[0].textContent.trim();
        } else if (nodes.length === 1 && sel.selector.endsWith("img")) {
          result[sel.key] = nodes[0].src;
        } else {
          result[sel.key] = null;
        }
      } catch {
        result[sel.key] = null;
      }
    }
    return result;
  } finally {
    iframe.remove();
  }
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new Error("Aborted");
  }
}
