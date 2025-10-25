import { doAsync } from "./utils/do-async";
import { htmlToElement } from "./utils/html-to-element";

doAsync(init)();

function init() {
  chrome.storage.sync
    .get("hideLeaderboard")
    .then((config) => config.hideLeaderboard ?? false)
    .then((hideLeaderboard) => {
      if (!hideLeaderboard) {
        return initIntegrateLeaderboard();
      }
    });

  return true;
}

function initIntegrateLeaderboard() {
  const targetId = window.location.href.replace(
    "https://cssbattle.dev/play/",
    "",
  );

  return scrapeSpaViaIframe(
    `https://cssbattle.dev/leaderboard/target/${targetId}`,
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
  )
    .then((results) => {
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

      document
        .querySelectorAll(".leaderboard-stats-box")
        .item(1)
        .querySelector(".hstack")
        .append(
          htmlToElement(`
            <span style="letter-spacing: 0.3px; font-size: var(--font-size-2); font-family: var(--font-base); font-weight: 500; text-align: left; line-height: 1.4; font-style: normal; text-transform: none; word-break: initial; color: var(--clr-text-light);">
            ${results.selfRank}
            </span>
            `),
        );

      document
        .querySelector(".container__item--output > .item__content")
        .append(
          htmlToElement(
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
          ),
        );
    })
    .then(console.log)
    .catch(console.error);
}

/**
 * Charge une URL SPA dans un iframe caché et récupère le texte des sélecteurs.
 * @param {string} url - URL de la page SPA (même origine).
 * @param {string[]} waitingSelector - Le sélector à attendre.
 * @param {string[]} selectors - Liste de sélecteurs CSS à extraire.
 * @param {number} timeoutMs - Délai maximal pour l’apparition des sélecteurs.
 * @returns {Promise<Object>} - { [selector]: string | string[] | null }
 */
async function scrapeSpaViaIframe(
  url,
  waitingSelector,
  selectors,
  timeoutMs = 15000,
) {
  // 1) Créer l'iframe
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.src = url;

  // Nettoyage pratique
  const cleanup = () => iframe.remove();

  // 2) Attendre le chargement initial
  const loaded = new Promise((resolve, reject) => {
    const onLoad = () => resolve();
    const onError = (e) => reject(new Error(`Iframe load error for ${url}`));
    iframe.addEventListener("load", onLoad, { once: true });
    iframe.addEventListener("error", onError, { once: true });
  });

  document.body.appendChild(iframe);
  await loaded;

  // 3) Helpers dans le contexte de l’iframe
  const rootDoc = iframe.contentDocument;
  const rootWin = iframe.contentWindow;
  if (!rootDoc || !rootWin) {
    cleanup();
    throw new Error(
      "Impossible d’accéder au DOM de l’iframe (vérifie même origine)",
    );
  }

  // Attendre l’apparition d’un sélecteur dans le DOM (SPA-friendly)
  const waitForSelector = (selector) =>
    new Promise((resolve, reject) => {
      const start = Date.now();
      const found = rootDoc.querySelector(selector);
      if (found) {
        return resolve(found);
      }

      const obs = new MutationObserver(() => {
        const el = rootDoc.querySelector(selector);
        if (el) {
          obs.disconnect();
          resolve(el);
        } else if (Date.now() - start > timeoutMs) {
          obs.disconnect();
          reject(new Error(`Timeout waiting for selector: ${selector}`));
        }
      });

      obs.observe(rootDoc, { childList: true, subtree: true });

      // Timeout hard
      const t = setTimeout(() => {
        obs.disconnect();
        reject(new Error(`Timeout waiting for selector: ${selector}`));
      }, timeoutMs);

      // Si on résout/rejette, on nettoie le timeout
      const origResolve = resolve;
      resolve = (v) => {
        clearTimeout(t);
        origResolve(v);
      };
      const origReject = reject;
      reject = (e) => {
        clearTimeout(t);
        origReject(e);
      };
    });

  // 4) Pour forcer les SPAs “lentes”, attendre la stabilité réseau (best-effort)
  // Attention: pas d’API standard; on met un petit délai après le load
  await new Promise((r) =>
    rootWin.requestAnimationFrame(() => setTimeout(r, 200)),
  );

  // 5) Attendre et extraire chaque sélecteur
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

  cleanup();
  return result;
}
