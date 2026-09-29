/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://cssbattle.dev/play/123"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stubChrome(get = () => Promise.resolve({})) {
  return {
    storage: {
      sync: { get: vi.fn(get) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  };
}

/** The battle page: the rank goes in the second stats box, the list under the output. */
function renderBattlePage() {
  document.body.innerHTML = `
    <div class="leaderboard-stats-box"><div class="hstack"></div></div>
    <div class="leaderboard-stats-box"><div class="hstack"></div></div>
    <div class="container__item--output"><div class="item__content"></div></div>`;
}

function podium(place, { chars, name, self = false }) {
  const avatar = self
    ? "avatar-link__image avatar-link__image--self"
    : "avatar-link__image";
  return `
    <div class="leader__info__${place}">
      <span class="${avatar}"><img src="https://img.test/${name}.png"></span>
      <a class="name-link">${name}</a>
      <span class="leader__meta">${chars}</span>
    </div>`;
}

function row(rank, { chars, name, self = false }) {
  const avatar = self
    ? "avatar-link__image avatar-link__image--self"
    : "avatar-link__image";
  return `
    <tr class="leaderboard__user--${rank}">
      <td data-column="Rank">#${rank}</td>
      <td><span class="${avatar}"><img src="https://img.test/${name}.png"></span></td>
      <td><a class="name-link">${name}</a></td>
      <td data-column="Meta">${chars}</td>
    </tr>`;
}

const PLAYERS = [
  "ana",
  "bob",
  "cid",
  "dan",
  "eve",
  "fay",
  "gus",
  "hal",
  "ivy",
  "jon",
];

/** A full top 10, plus the player themselves further down the table. */
function fullLeaderboard() {
  return `
    ${[1, 2, 3].map((i) => podium(i, { chars: 100 + i, name: PLAYERS[i - 1] })).join("")}
    <table>
      ${[4, 5, 6, 7, 8, 9, 10]
        .map((i) => row(i, { chars: 100 + i, name: PLAYERS[i - 1] }))
        .join("")}
      ${row(42, { chars: 180, name: "me", self: true })}
    </table>`;
}

function scraper() {
  return document.querySelector("iframe.cbt-scraper");
}

/** Plays the part of the browser loading the leaderboard page in the scraper. */
function loadScraper(iframe, body) {
  const doc = iframe.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head></head><body>${body}</body></html>`);
  doc.close();
  iframe.dispatchEvent(new Event("load"));
  return doc;
}

function rank() {
  return document
    .querySelectorAll(".leaderboard-stats-box")[1]
    .querySelector(".hstack > span");
}

function listed() {
  return [...document.querySelectorAll(".item__content ol li")].map((li) => ({
    chars: li.querySelectorAll("span")[0].textContent,
    name: li.querySelectorAll("span")[1].textContent,
    img: li.querySelector("img").getAttribute("src"),
  }));
}

/**
 * Leaves the battle for a page no tool mounts on. The router polls the URL, so
 * the teardown happens on its next check.
 */
async function leaveBattle() {
  window.history.replaceState({}, "", "/leaderboard");
  await tick(300);
}

// Fake timers, so the pollers every tool leaves running die with the test.
function tick(ms) {
  return vi.advanceTimersByTimeAsync(ms);
}

describe("leaderboard-tools", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal("chrome", stubChrome());
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    renderBattlePage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.history.replaceState({}, "", "/play/123");
    document.body.innerHTML = "";
  });

  it("scrapes the leaderboard of the current battle in a hidden iframe", async () => {
    await import("./leaderboard-tools.js");
    await tick(0);

    const iframe = scraper();
    expect(iframe.src).toBe("https://cssbattle.dev/leaderboard/target/123");
    expect(iframe.style.width).toBe("0px");
    expect(iframe.style.opacity).toBe("0");
  });

  it("shows the player's rank and the top 10 of the battle", async () => {
    await import("./leaderboard-tools.js");
    await tick(0);
    const iframe = scraper();

    loadScraper(iframe, fullLeaderboard());
    await tick(300);

    expect(rank().textContent.trim()).toBe("#42");
    expect(listed()).toEqual(
      PLAYERS.map((name, i) => ({
        chars: `${101 + i}`,
        name,
        img: `https://img.test/${name}.png`,
      })),
    );
    // The scraper is dropped as soon as the data is out.
    expect(iframe.isConnected).toBe(false);
  });

  it("shows a player's name as text, never as markup", async () => {
    await import("./leaderboard-tools.js");
    await tick(0);
    const name = `<img src=x onerror="alert(1)">`;
    const doc = loadScraper(scraper(), fullLeaderboard());
    // Set as text, the way cssbattle renders a name it got from its API.
    doc.querySelector(".leader__info__1 .name-link").textContent = name;
    await tick(300);

    const first = document.querySelector(".item__content ol li");
    expect(first.querySelectorAll("span")[1].textContent).toBe(name);
    expect(first.querySelectorAll("img")).toHaveLength(1);
    expect(first.querySelector("img").getAttribute("alt")).toBe(
      `${name} avatar`,
    );
  });

  it("waits for the leaderboard to render inside the scraper", async () => {
    await import("./leaderboard-tools.js");
    await tick(0);

    // The SPA shell loads empty, then renders the leaderboard a bit later.
    const doc = loadScraper(scraper(), "");
    await tick(300);
    doc.body.innerHTML = "<p>Loading…</p>";
    await tick(0);
    expect(listed()).toEqual([]);

    doc.body.innerHTML = fullLeaderboard();
    await tick(0);

    expect(listed()).toHaveLength(10);
    expect(scraper()).toBeNull();
  });

  it("lists only the players there are, and no rank for a newcomer", async () => {
    await import("./leaderboard-tools.js");
    await tick(0);

    loadScraper(
      scraper(),
      `${podium(1, { chars: 101, name: "ana" })}${podium(2, { chars: 102, name: "bob" })}`,
    );
    await tick(300);

    expect(listed().map(({ name }) => name)).toEqual(["ana", "bob"]);
    expect(document.body.textContent).not.toContain("null");
    expect(rank()).toBeNull();
  });

  it("keeps every match when players tie on the same rank", async () => {
    await import("./leaderboard-tools.js");
    await tick(0);

    loadScraper(
      scraper(),
      `${[1, 2, 3].map((i) => podium(i, { chars: 100 + i, name: PLAYERS[i - 1] })).join("")}
      <table>
        ${row(4, { chars: 104, name: "dan" })}
        ${row(4, { chars: 104, name: "eve" })}
      </table>`,
    );
    await tick(300);

    expect(listed()[3]).toEqual({
      chars: "104,104",
      name: "dan,eve",
      img: "https://img.test/dan.png,https://img.test/eve.png",
    });
  });

  it("still lists the top when the selector engine rejects :has()", async () => {
    await import("./leaderboard-tools.js");
    await tick(0);
    const iframe = scraper();
    const doc = iframe.contentDocument;
    const querySelectorAll = doc.querySelectorAll.bind(doc);
    // Older engines throw a SyntaxError on :has(), which the rank lookup uses.
    vi.spyOn(doc, "querySelectorAll").mockImplementation((selector) => {
      if (selector.includes(":has(")) {
        throw new SyntaxError(`'${selector}' is not a valid selector`);
      }
      return querySelectorAll(selector);
    });

    loadScraper(iframe, fullLeaderboard());
    await tick(300);

    expect(rank()).toBeNull();
    expect(listed().map(({ name }) => name)).toEqual(PLAYERS);
  });

  it("shows nothing when the leaderboard fails to load", async () => {
    await import("./leaderboard-tools.js");
    await tick(0);
    const iframe = scraper();

    iframe.dispatchEvent(new Event("error"));
    await tick(300);

    expect(rank()).toBeNull();
    expect(listed()).toEqual([]);
    expect(iframe.isConnected).toBe(false);
  });

  it("shows nothing when the leaderboard frame is out of reach", async () => {
    await import("./leaderboard-tools.js");
    await tick(0);
    const iframe = scraper();

    // What a browser returns for a frame of another origin.
    Object.defineProperty(iframe, "contentDocument", { value: null });
    iframe.dispatchEvent(new Event("load"));
    await tick(300);

    expect(listed()).toEqual([]);
    expect(iframe.isConnected).toBe(false);
  });

  it("gives up when the leaderboard never renders", async () => {
    await import("./leaderboard-tools.js");
    await tick(0);
    const iframe = scraper();

    loadScraper(iframe, "");
    await tick(15000);
    expect(iframe.isConnected).toBe(true);
    await tick(300);

    expect(listed()).toEqual([]);
    expect(iframe.isConnected).toBe(false);
  });

  it("waits for the second stats box before mounting", async () => {
    document.querySelectorAll(".leaderboard-stats-box")[1].remove();

    await import("./leaderboard-tools.js");
    await tick(200);
    expect(scraper()).toBeNull();

    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div class="leaderboard-stats-box"><div class="hstack"></div></div>`,
    );
    await tick(100);

    expect(scraper()).not.toBeNull();
  });

  it("stays out of the page when the leaderboard is hidden in the options", async () => {
    vi.stubGlobal(
      "chrome",
      stubChrome(() => Promise.resolve({ hideLeaderboard: true })),
    );

    await import("./leaderboard-tools.js");
    await tick(300);

    expect(chrome.storage.sync.get).toHaveBeenCalledWith("hideLeaderboard");
    expect(scraper()).toBeNull();
  });

  it("does not scrape when the battle is left before the options are read", async () => {
    let settle;
    vi.stubGlobal(
      "chrome",
      stubChrome(() => new Promise((resolve) => (settle = resolve))),
    );

    await import("./leaderboard-tools.js");
    await tick(0);
    await leaveBattle();
    settle({});
    await tick(0);

    expect(scraper()).toBeNull();
  });

  it("removes the rank and the list when the battle is left", async () => {
    await import("./leaderboard-tools.js");
    await tick(0);
    loadScraper(scraper(), fullLeaderboard());
    await tick(300);
    expect(listed()).toHaveLength(10);

    await leaveBattle();

    expect(rank()).toBeNull();
    expect(listed()).toEqual([]);
  });

  it("drops the scraper when the battle is left while it loads", async () => {
    await import("./leaderboard-tools.js");
    await tick(0);
    const iframe = scraper();

    await leaveBattle();
    expect(iframe.isConnected).toBe(false);

    // A load that still lands afterwards must not render anything.
    loadScraper(iframe, fullLeaderboard());
    await tick(300);

    expect(listed()).toEqual([]);
  });

  it("drops the scraper when the battle is left while the page settles", async () => {
    await import("./leaderboard-tools.js");
    await tick(150);
    const iframe = scraper();

    // The router's next URL check falls in the settle delay after the load.
    loadScraper(iframe, fullLeaderboard());
    window.history.replaceState({}, "", "/leaderboard");
    await tick(150);
    await tick(300);

    expect(iframe.isConnected).toBe(false);
    expect(listed()).toEqual([]);
  });

  it("stops waiting for the leaderboard when the battle is left", async () => {
    await import("./leaderboard-tools.js");
    await tick(0);
    const iframe = scraper();
    const doc = loadScraper(iframe, "");
    await tick(300);

    await leaveBattle();
    doc.body.innerHTML = fullLeaderboard();
    await tick(300);

    expect(iframe.isConnected).toBe(false);
    expect(listed()).toEqual([]);
  });

  it("renders nothing when the battle is left just as the scrape finishes", async () => {
    await import("./leaderboard-tools.js");
    await tick(0);
    const doc = loadScraper(scraper(), "");
    await tick(300);

    doc.body.innerHTML = fullLeaderboard();
    // Lets the scraper's observer see the leaderboard, then leaves before the
    // results come back. `popstate` is the only synchronous way to navigate.
    await Promise.resolve();
    window.history.replaceState({}, "", "/leaderboard");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await tick(0);

    expect(rank()).toBeNull();
    expect(listed()).toEqual([]);
  });
});
