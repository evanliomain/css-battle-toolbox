/**
 * The panel of the border-image tool, on the right of the page, as cssbattle
 * draws its own: it reuses their classes, but not the dark layer under them,
 * so the rest of the page stays at hand while it is open.
 *
 * It shows the image cut by its slices next to the element it borders, each
 * of the nine pieces where it lands in the border, and plays the pieces to their place, as the
 * page script describes them. Its commands go straight back to the page
 * script: drag a slice, switch a repeat or `fill`, show a piece alone.
 */
import {
  duration,
  escape,
  FIGURE_HEIGHT,
  figureScale,
  figuresHtml,
  piecesHtml,
  stepAt,
} from "./border-image-view";

export const SIDEBAR_ID = "cbt-border-image-sidebar";

/** cssbattle's padding of a panel's content, both sides. */
const PADDING = 40;
/**
 * Under the image: its margin above, its caption, the keys and the padding of
 * the panel.
 */
const BELOW_FIGURES = 170;

/** cssbattle's own close button, crossed swords in a disc. */
const CLOSE_ICON = `<svg width="33" height="33" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M12 24c6.627 0 12-5.373 12-12S18.627 0 12 0 0 5.373 0 12s5.373 12 12 12Zm4.016-10.09L8.182 6H6.318v1.881l7.835 7.911-.928.948.928.937 1.139-1.18 2.12 2.107c.257.26.671.26.928 0l.467-.472a.667.667 0 0 0 0-.937l-2.093-2.114 1.214-1.144L17 13l-.984.91Zm1.666-6.035-3.121 3.15-1.863-1.874L15.818 6h1.864v1.875Zm-8.243 4.567 1.863 1.908-1.455 1.442.928.948-.928.937-1.139-1.18-2.12 2.114a.651.651 0 0 1-.928 0l-.467-.472a.667.667 0 0 1 0-.938l2.093-2.12-.968-.97.929-.938.737.738 1.455-1.47Z"/></svg>`;

const WARNING_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l7 12.5H1z"/><path d="M8 6v3.5M8 11.5v.5"/></svg>`;
const PLAY_ICON = `<svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true"><path d="M1 1v12l10-6z"/></svg>`;
const PAUSE_ICON = `<svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true"><path d="M1 1h3.5v12H1zM7.5 1H11v12H7.5z"/></svg>`;

const MARKUP = `<div class="sidebar sidebar--right"><button type="button" class="sidebar__close no-icon" data-close aria-label="Close the pieces" title="Close">${CLOSE_ICON}</button><div class="sidebar__content"><div class="item__header"><h3 class="header__title">Border-image pieces</h3><div class="cbt-border-image__notices"></div><div class="cbt-border-image__elements" role="group" aria-label="Element the rule styles"></div><div class="cbt-border-image__alone"></div><div class="header__extra-info cbt-border-image__size"></div><div class="cbt-border-image__player"></div><button type="button" class="cbt-border-image__toggle hint--bottom-left" role="switch" data-draw aria-checked="true" aria-label="Draw the pieces on the output" data-hint="Draw the pieces on the output"><span class="cbt-border-image__knob"></span></button></div><div class="item__content cbt-border-image__panel"><p class="cbt-border-image__empty" hidden></p><div class="cbt-border-image__content" hidden><section><div class="cbt-border-image__figures"></div><p class="cbt-border-image__keys"><span>Drag a <b>red handle</b> to move a cut, a <b class="cbt-border-image__width-key">green</b> one the border</span><span><kbd>Shift</kbd> finer</span><span><kbd>Alt</kbd> one side only</span></p></section><section><div class="cbt-border-image__heading"><h4>9 pieces</h4><span>image → border</span></div><div class="cbt-border-image__rows"></div></section><p class="cbt-border-image__hint">The red lines cut the image into 9 pieces. Corners are only resized, edges are stretched or repeated along their side, the middle shows only with <code>fill</code>. Click the eye to show one piece alone.</p></div></div></div></div>`;

/** The button, while the pieces rest. */
const IDLE = `<button type="button" class="cbt-border-image__play" data-play aria-pressed="false">${PLAY_ICON}Play piece by piece</button>`;

/**
 * Builds the panel, to append to the page.
 *
 * @param {object} options
 * @param {(command: object) => void} options.send runs a command of the panel
 * @param {() => void} options.close asks for the panel to go
 * @returns {{ element: HTMLElement, update: (model: object) => void,
 *   destroy: () => void }}
 */
export function createSidebar({ send, close }) {
  /** What the page script described last. */
  let model = null;
  /**
   * How far the pieces went, 1 once in their place, and since when they go,
   * `null` while they rest.
   */
  let animation = { t: 1, start: null };
  let frame = 0;
  /** The pointer dragging a line, and the figure it drags in. */
  let dragging = null;
  /** The piece hovered, as last sent. */
  let hovered = -1;
  /** The markup last drawn in each place. */
  const drawn = {};

  const element = document.createElement("div");
  element.id = SIDEBAR_ID;
  element.className = "sidebar-container";
  element.innerHTML = MARKUP;
  const panel = element.querySelector(".cbt-border-image__panel");
  const scroller = element.querySelector(".sidebar__content");
  const header = element.querySelector(".item__header");
  const figures = element.querySelector(".cbt-border-image__figures");
  const q = (selector) => element.querySelector(selector);
  // Slides in, as cssbattle's panels do, once the page laid it out hidden.
  let opening = requestAnimationFrame(() => {
    opening = 0;
    element.classList.add("sidebar-container--visible");
  });

  window.addEventListener("resize", render);
  // The caret stays in the editor.
  element.addEventListener("mousedown", (event) => event.preventDefault());
  element.addEventListener("click", onClick);
  element.addEventListener("pointerover", (event) => {
    const zone = event.target.closest?.("[data-zone]")?.dataset.zone;
    hover(undefined === zone ? -1 : Number(zone));
  });
  element.addEventListener("pointerleave", () => hover(-1));
  figures.addEventListener("pointerdown", onPointerDown);
  figures.addEventListener("pointermove", onPointerMove);
  figures.addEventListener("pointerup", onPointerUp);
  figures.addEventListener("pointercancel", onPointerUp);

  function update(next) {
    model = next;
    render();
  }

  function destroy() {
    cancelAnimationFrame(opening);
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", render);
    element.remove();
  }

  function hover(zone) {
    if (zone !== hovered) {
      hovered = zone;
      send({ type: "hover", zone });
    }
  }

  /** Sets some markup, unless it is already there. */
  function draw(key, markup) {
    if (drawn[key] !== markup) {
      q(`.cbt-border-image__${key}`).innerHTML = markup;
      drawn[key] = markup;
    }
  }

  function width() {
    return Math.max(240, panel.clientWidth - PADDING);
  }

  /**
   * How tall the image may be drawn: the figures and the keys fill the
   * screen under the header, the pieces come when scrolled to.
   */
  function height() {
    return Math.max(
      FIGURE_HEIGHT,
      scroller.clientHeight - header.offsetHeight - BELOW_FIGURES,
    );
  }

  function render() {
    if (null === model) {
      return;
    }
    const { names, index, layout, onOutput } = model;
    q("[data-draw]").setAttribute("aria-checked", String(onOutput));
    const found = undefined !== layout;
    draw(
      "elements",
      names.length < 2
        ? ""
        : names
            .map(
              (name, i) =>
                `<button type="button" data-element="${i}" aria-pressed="${i === index}">${escape(name)}</button>`,
            )
            .join(""),
    );
    q(".cbt-border-image__empty").textContent = found
      ? ""
      : `${model.reason}: nothing to draw.`;
    q(".cbt-border-image__empty").hidden = found;
    q(".cbt-border-image__content").hidden = !found;
    if (!found) {
      draw("size", "");
      draw("alone", "");
      return;
    }
    const { area, outsets } = layout;
    const box = [
      area.width - outsets[1] - outsets[3],
      area.height - outsets[0] - outsets[2],
    ].map((px) => Number((px / model.zoom).toFixed(2)));
    draw("size", `${escape(names[index])} · ${box[0]} × ${box[1]}`);
    draw(
      "alone",
      model.isolated < 0
        ? ""
        : `<span>Piece ${model.isolated + 1} alone</span><button type="button" data-isolate="${model.isolated}">Show all</button>`,
    );
    draw("notices", noticesHtml());
    renderPlay();
  }

  /** The things that change the result, the pieces too thin to see too. */
  function noticesHtml() {
    const scale = figureScale(model, width(), height());
    const thin = model.layout.pieces
      .filter(
        ({ drawn: painted, source }) =>
          painted && Math.min(source.width, source.height) * scale < 2,
      )
      .map(({ zone }) => zone + 1);
    const all = [
      ...model.notices,
      ...(0 === thin.length
        ? []
        : [
            {
              title: "Pieces too thin to see",
              text: `${1 === thin.length ? "Piece" : "Pieces"} ${thin.join(", ")} ${1 === thin.length ? "is" : "are"} under 2px in the image above: the thumbnails below are enlarged.`,
            },
          ]),
    ];
    if (0 === all.length) {
      return "";
    }
    const title =
      1 === all.length
        ? "1 thing changes the result"
        : `${all.length} things change the result`;
    // An icon by the title: the details show on hover, not to push the figures down.
    return `<button type="button" class="cbt-border-image__notices-icon" aria-label="${title}" aria-describedby="cbt-border-image-notices">${WARNING_ICON}</button><div class="cbt-border-image__notices-pop" id="cbt-border-image-notices" role="tooltip"><p class="cbt-border-image__notices-title">${WARNING_ICON}${title}</p>${all
      .map(
        ({ title: what, text }) =>
          `<div class="cbt-border-image__notice"><b>${escape(what)}</b><span>${escape(text)}</span></div>`,
      )
      .join("")}</div>`;
  }

  /** What moves with the pieces: the figures, the rows, the button. */
  function renderPlay() {
    const { t, start } = animation;
    draw("figures", figuresHtml(model, t, width(), height()));
    draw("rows", piecesHtml(model, t));
    if (1 === t) {
      draw("player", IDLE);
      return;
    }
    const { rank, count } = stepAt(model, t);
    const playing = null !== start;
    draw(
      "player",
      `<button type="button" class="cbt-border-image__play" data-play aria-pressed="${playing}">${playing ? PAUSE_ICON : PLAY_ICON}${playing ? "Pause" : "Resume"} · step ${rank + 1} of ${count}</button>`,
    );
  }

  /** Moves the pieces on, until they are all in their place. */
  function step(now) {
    frame = 0;
    if (null === animation.start || !model?.layout) {
      return;
    }
    animation.t = Math.min(1, (now - animation.start) / duration(model));
    if (1 === animation.t) {
      animation.start = null;
    }
    renderPlay();
    if (null !== animation.start) {
      frame = requestAnimationFrame(step);
    }
  }

  /** Plays the pieces, from where they paused; pauses them while they play. */
  function togglePlay() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (null !== animation.start) {
      animation.start = null;
      renderPlay();
      return;
    }
    const t = 1 === animation.t ? 0 : animation.t;
    animation = { t, start: performance.now() - t * duration(model) };
    frame = requestAnimationFrame(step);
  }

  function onClick(event) {
    const target = event.target;
    if (target.closest("[data-close]")) {
      close();
      return;
    }
    if (target.closest("[data-play]")) {
      togglePlay();
      return;
    }
    if (target.closest("[data-draw]")) {
      send({ type: "draw" });
      return;
    }
    const chosen = target.closest("[data-element]");
    if (chosen) {
      send({ type: "element", index: Number(chosen.dataset.element) });
      return;
    }
    const repeat = target.closest("[data-repeat]");
    if (repeat) {
      send({ type: "repeat", axis: Number(repeat.dataset.repeat) });
      return;
    }
    if (target.closest("[data-fill]")) {
      send({ type: "fill" });
      return;
    }
    const alone = target.closest("[data-isolate]");
    if (alone) {
      const zone = alone.dataset.isolate || alone.dataset.zone;
      send({ type: "isolate", zone: Number(zone) });
    }
  }

  /**
   * The pointer in pixels of the render, from the image's top left or the
   * element's, and the page's pixels per one.
   */
  function figurePoint(event, where) {
    const svg = figures.querySelector(
      "image" === where ? "[data-image] svg" : ".cbt-border-image__guides",
    );
    const matrix = svg.getScreenCTM();
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    return {
      x: point.x,
      y: point.y,
      scale: Math.hypot(matrix.a, matrix.b) || 1,
    };
  }

  /**
   * Starts dragging a line: a slice, or a piece pressed, in the image; a width
   * or an outset in the element, whose pieces show alone on a click.
   */
  function onPointerDown(event) {
    const where = event.target.closest?.("[data-image]") ? "image" : "element";
    const pressed =
      "image" === where
        ? event.target.closest("[data-line], [data-zone]")
        : event.target.closest?.(".cbt-border-image__guides [data-line]");
    if (!pressed) {
      return;
    }
    event.preventDefault();
    const { scale, ...point } = figurePoint(event, where);
    const zone = event.target.closest("[data-zone]")?.dataset.zone;
    const line = event.target.closest("[data-line]")?.dataset.line;
    send({
      type: "down",
      where,
      point,
      scale,
      zone: undefined === zone ? null : Number(zone),
      // Its handle stands off it: the line, not where it is.
      ...(undefined === line ? {} : { line }),
    });
    dragging = { pointerId: event.pointerId, where };
    figures.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    if (event.pointerId !== dragging?.pointerId) {
      return;
    }
    const { x, y } = figurePoint(event, dragging.where);
    send({
      type: "move",
      point: { x, y },
      shiftKey: event.shiftKey,
      altKey: event.altKey,
    });
  }

  function onPointerUp(event) {
    if (event.pointerId !== dragging?.pointerId) {
      return;
    }
    dragging = null;
    send({ type: "up" });
    figures.releasePointerCapture?.(event.pointerId);
  }

  return { element, update, destroy };
}
