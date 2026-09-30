import { htmlToElement } from "./html-to-element";

// Same settings as cssbattle's own ToastContainer.
const AUTO_CLOSE = 3500;
const POSITION = "bottom-right";

const INFO_ICON =
  "M12 0a12 12 0 1012 12A12.013 12.013 0 0012 0zm.25 5a1.5 1.5 0 11-1.5 1.5 1.5 1.5 0 011.5-1.5zm2.25 13.5h-4a1 1 0 010-2h.75a.25.25 0 00.25-.25v-4.5a.25.25 0 00-.25-.25h-.75a1 1 0 010-2h1a2 2 0 012 2v4.75a.25.25 0 00.25.25h.75a1 1 0 110 2z";

/**
 * Shows a toast like the one cssbattle shows when a target color is copied.
 * The site's `toast()` lives in its React bundle, out of reach of a content
 * script, so this rebuilds the same markup with the Toastify classes the site
 * already styles.
 */
export function showSnackbar(message) {
  const toast = htmlToElement(template());
  // Set as text: a copied unit repeats what the user typed.
  toast.querySelector(".js-snackbar-message").textContent = message;

  const close = () => {
    clearTimeout(timer);
    toast.classList.replace(
      `Toastify__slide-enter--${POSITION}`,
      `Toastify__slide-exit--${POSITION}`,
    );
    toast.addEventListener("animationend", () => toast.remove(), {
      once: true,
    });
  };
  const timer = setTimeout(close, AUTO_CLOSE);
  toast.addEventListener("click", close, { once: true });

  getContainer().append(toast);
  return toast;
}

// Our own container: the site's one is removed by React with its last toast,
// and would take ours with it.
function getContainer() {
  const existing = document.querySelector("#cbt-snackbar > div");
  if (existing) {
    return existing;
  }
  const root = htmlToElement(`
    <div class="Toastify" id="cbt-snackbar">
      <div class="Toastify__toast-container Toastify__toast-container--${POSITION}"></div>
    </div>`);
  document.body.append(root);
  return root.firstElementChild;
}

function template() {
  return `
    <div class="Toastify__toast Toastify__toast-theme--dark Toastify__toast--info Toastify__toast--close-on-click Toastify--animate Toastify__slide-enter--${POSITION}">
      <div role="alert" class="Toastify__toast-body">
        <div class="Toastify__toast-icon Toastify--animate-icon Toastify__zoom-enter">
          <svg viewBox="0 0 24 24" width="100%" height="100%" fill="var(--toastify-icon-color-info)">
            <path d="${INFO_ICON}"></path>
          </svg>
        </div>
        <div class="js-snackbar-message"></div>
      </div>
      <div
        role="progressbar"
        class="Toastify__progress-bar Toastify__progress-bar--animated Toastify__progress-bar-theme--dark Toastify__progress-bar--info"
        style="animation-duration: ${AUTO_CLOSE}ms;"
      ></div>
    </div>`;
}
