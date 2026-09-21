/* UI-only helpers for the options page: theme selector + option filter.
   Loaded from <head> WITHOUT defer so data-theme is set before the first paint.
   Never reads or writes an option field value — options.js stays the single
   owner of the ~40 stored option IDs. */
(function () {
  "use strict";

  var KEY = "toolbox.theme";
  var VALID = { auto: 1, light: 1, dark: 1 };
  var root = document.documentElement;

  /* ?theme=light|dark forces a theme without persisting it (used by the
     side-by-side comparison page). */
  var forced = null;
  try {
    var q = new URLSearchParams(location.search).get("theme");
    if (q && VALID[q]) forced = q;
  } catch (e) {
    /* no-op */
  }

  function stored() {
    try {
      var v = localStorage.getItem(KEY);
      return v && VALID[v] ? v : "auto";
    } catch (e) {
      return "auto";
    }
  }

  function paint(theme) {
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }

  var current = forced || stored();
  paint(current); // before first paint: no theme flash

  document.addEventListener("DOMContentLoaded", function () {
    /* ----- sticky offsets ----- */

    /* Every heading below the sticky page header parks against the header's
       height, and the column/section heads park one panel head lower. Both
       heights move with the viewport (the filter row and the h1 wrap on narrow
       windows), so they are measured rather than hard-coded. */
    var header = document.querySelector("header");
    var panelHead = document.querySelector(".panel-head");

    /* A height of 0 means the element is not rendered right now (filtered out,
       or the page itself hidden) — writing it would park every heading at the
       very top, behind the real header. Keep the last good value instead. */
    function measure(el, prop) {
      if (!el) return;
      var h = Math.round(el.getBoundingClientRect().height - 16);
      if (h > 0) root.style.setProperty(prop, h + "px");
    }

    function syncOffsets() {
      measure(header, "--header-h");
      measure(panelHead, "--panel-head-h");
    }

    syncOffsets();
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(syncOffsets);
      if (header) ro.observe(header);
      if (panelHead) ro.observe(panelHead);
    } else {
      window.addEventListener("resize", syncOffsets);
    }

    /* ----- theme selector ----- */

    var radios = Array.prototype.slice.call(
      document.querySelectorAll('input[name="uiTheme"]'),
    );
    radios.forEach(function (r) {
      r.checked = r.value === current;
      r.addEventListener("change", function () {
        if (!r.checked) return;
        paint(r.value);
        if (forced) return; // a forced preview never overwrites the saved choice
        try {
          localStorage.setItem(KEY, r.value);
        } catch (e) {
          /* no-op */
        }
      });
    });

    /* ----- option filter (visibility only) ----- */

    var filter = document.getElementById("optionFilter");
    var empty = document.getElementById("filterEmpty");
    var form = document.getElementById("optionsForm");
    var items = Array.prototype.slice.call(
      document.querySelectorAll(".opt-item"),
    );
    var groups = Array.prototype.slice.call(
      document.querySelectorAll("form fieldset"),
    );

    items.forEach(function (el) {
      el._hay = ((el.getAttribute("data-search") || "") + " " + el.textContent)
        .toLowerCase()
        .replace(/\s+/g, " ");
    });

    function apply() {
      var q = filter.value.trim().toLowerCase();
      var terms = q ? q.split(/\s+/) : [];
      var shown = 0;

      items.forEach(function (el) {
        var hit = terms.every(function (t) {
          return el._hay.indexOf(t) !== -1;
        });
        el.hidden = !hit;
        if (hit) shown++;
      });

      groups.forEach(function (fs) {
        fs.hidden = !fs.querySelector(".opt-item:not([hidden])");

        var head = fs.querySelector(".mx-head");
        if (head) head.hidden = !fs.querySelector(".mx-row:not([hidden])");

        // a subhead only shows while the group right after it still has rows
        Array.prototype.forEach.call(
          fs.querySelectorAll(".subhead"),
          function (sub) {
            var group = sub.nextElementSibling;
            sub.hidden = !(
              group && group.querySelector(".opt-item:not([hidden])")
            );
          },
        );
      });

      empty.hidden = shown !== 0;
    }

    filter.addEventListener("input", apply);
    filter.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && filter.value) {
        filter.value = "";
        apply();
      }
    });

    // The page is wrapped in a <form> for semantics only — nothing submits.
    form.addEventListener("submit", function (e) {
      e.preventDefault();
    });
  });
})();
