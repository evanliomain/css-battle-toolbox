import "./mode-menu.css";
import { doAsync } from "./utils/do-async";
import { htmlToElement } from "./utils/html-to-element";

doAsync(addModeMenu)();

let toggleKey = "I";

function addModeMenu() {
  const container = document.querySelector(
    '[class^="Editor_editor"] > .item__header > .header__extra-info > .hstack',
  );

  if (null === container) {
    return false;
  }

  // Init keyboard shortcut from settings
  chrome.storage.sync.get(null).then(applyKeyboardSettings);

  // Refresh keyboard shortcut on settings change
  chrome.storage.onChanged.addListener((changes) => {
    applyKeyboardSettings(
      Object.fromEntries(
        Object.entries(changes).map(([key, { newValue }]) => [key, newValue]),
      ),
    );
  });

  container.insertAdjacentElement("beforeend", htmlToElement(menuTemplate()));

  document
    .querySelector("#go-to-options")
    .addEventListener("click", function () {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open(chrome.runtime.getURL("src/options.html"));
      }
    });

  document.addEventListener("click", (event) => {
    if ("mode-menu-editor-checkbox" === event.target.id) {
      event.stopImmediatePropagation();
      return false;
    }
    if (!isIncludeIn("mode-menu-editor", event.target)) {
      document.getElementById("mode-menu-editor-checkbox").checked = false;
    }
    return false;
  });

  return true;
}

function isIncludeIn(id, element) {
  if (null === element) {
    return false;
  }
  if (id === element.id) {
    return true;
  }
  return isIncludeIn(id, element.parentElement);
}

function applyKeyboardSettings(settings) {
  toggleKey = settings?.strKbdToggleIncrement ?? toggleKey;

  document.getElementById("toggle-key-letter").textContent = toggleKey;
}

function menuTemplate() {
  return `<div class="cbt-dropdown">
    <label
      id="mode-menu-editor"
      class="dropdown-container d-f"
      popovertarget="mode-menu-editor-popover"
    >
      <input type="checkbox" id="mode-menu-editor-checkbox">
      <div class="dropdown-btn dropdown-btn--mini">
        ${menuIconTemplate()}
      </div>
    </label>
    <div
      class="cbt-dropdown-options dropdown-menu dropdown-menu--grow-with-content"
    >
      <nav
        id="mode-menu-editor-popover"
      >
        <a href="#" id="increment-mode-toggle">
          ${incrementorIconTemplate()}
          <span>Toggle increment mode</span>
          <span>
            <kbd class="pill pill--key">Ctrl</kbd> <kbd class="pill pill--key">Shift</kbd> <kbd id="toggle-key-letter" class="pill pill--key">${toggleKey}</kbd>
          </span>
        </a>
        <hr />
        <a href="#" id="go-to-options">
          ${settingsIconTemplate()}
          <span>Configure CSS Battle Toolbox</span>
          <span></span>
        </a>
      </nav>
    </div>
  </div>`;
}

// Icons

function menuIconTemplate() {
  return `<svg xmlns="http://www.w3.org/2000/svg" version="1.1"
  viewBox="12 15 75 75"
  width="16"
  height="16"
>
  <g>
    <rect x="37" y="28" width="4" height="15" rx="5" fill="#ffdf00" />
    <rect x="59" y="28" width="4" height="15" rx="5" fill="#ffdf00" />
    <rect x="38" y="28" width="25" height="4" rx="5" fill="#ffdf00" />

    <rect x="21" y="47" width="58" height="25" rx=" 5" fill="#ffdf00" />

    <rect x="18" y="40" width="64" height="9" rx="5" fill="#107640" />
    <rect x="18" y="47" width="64" height="2" fill="#107640" />
    <rect x="47" y="45" width="6" height="10" fill="#9F3333" />
    <path
      d="m75.254 73.219h-50.523c-2.4375 0-4.418-1.9844-4.418-4.418v-20.195c0-0.42969 0.35156-0.78125 0.78125-0.78125h25.203c0.42969 0 0.78125 0.35156 0.78125 0.78125v5.9375h5.8281v-5.9375c0-0.42969 0.35156-0.78125 0.78125-0.78125h25.203c0.42969 0 0.78125 0.35156 0.78125 0.78125v20.195c0 2.4375-1.9805 4.418-4.418 4.418zm-53.379-23.832v19.414c0 1.5742 1.2812 2.8555 2.8555 2.8555h50.523c1.5742 0 2.8555-1.2812 2.8555-2.8555v-19.414h-23.641v5.9375c0 0.42969-0.35156 0.78125-0.78125 0.78125l-7.3906 0.003906c-0.42969 0-0.78125-0.35156-0.78125-0.78125v-5.9375z" />

    <!-- traits -->
    <path
      d="m27.344 59.289c-0.42969 0-0.78125-0.35156-0.78125-0.78125v-2.2578c0-0.42969 0.35156-0.78125 0.78125-0.78125s0.78125 0.35156 0.78125 0.78125v2.2578c0 0.42969-0.35156 0.78125-0.78125 0.78125z" />
    <path
      d="m40.926 66.969h-11.262c-1.7109 0-3.1016-1.3906-3.1016-3.1016v-1.8008c0-0.42969 0.35156-0.78125 0.78125-0.78125s0.78125 0.35156 0.78125 0.78125v1.8008c0 0.85156 0.69141 1.5391 1.5391 1.5391h11.262c0.42969 0 0.78125 0.35156 0.78125 0.78125 0 0.43359-0.34766 0.78125-0.78125 0.78125z" />

    <!-- couvercle -->
    <path
      d="m81.516 49.387h-27.828c-0.42969 0-0.78125-0.35156-0.78125-0.78125v-2.6797l-5.8281 0.003907v2.6797c0 0.42969-0.35156 0.78125-0.78125 0.78125l-27.812-0.003906c-0.42969 0-0.78125-0.35156-0.78125-0.78125v-4.0781c0-3.1836 2.5898-5.7734 5.7734-5.7734h53.051c3.1836 0 5.7734 2.5898 5.7734 5.7734v4.0781c-0.003906 0.43359-0.35156 0.78125-0.78516 0.78125zm-27.047-1.5625h26.27v-3.2969c0-2.3203-1.8867-4.2109-4.2109-4.2109h-53.055c-2.3203 0-4.2109 1.8906-4.2109 4.2109v3.2969h26.254v-2.6797c0-0.42969 0.35156-0.78125 0.78125-0.78125h7.3906c0.42969 0 0.78125 0.35156 0.78125 0.78125z" />

    <!-- poigné -->
    <path
      d="m63.137 40.312h-26.277c-0.42969 0-0.78125-0.35156-0.78125-0.78125v-7.5703c0-2.8555 2.3242-5.1797 5.1797-5.1797h17.484c2.8555 0 5.1797 2.3242 5.1797 5.1797v7.5703c-0.003906 0.42969-0.35547 0.78125-0.78516 0.78125zm-25.496-1.5625h24.715v-6.7891c0-1.9922-1.6211-3.6172-3.6172-3.6172h-17.484c-1.9922 0-3.6172 1.6211-3.6172 3.6172z" />
    <path
      d="m59.066 40.312h-18.141c-0.42969 0-0.78125-0.35156-0.78125-0.78125v-5.6406c0-1.8594 1.5117-3.3711 3.3711-3.3711h12.965c1.8594 0 3.3711 1.5117 3.3711 3.3711v5.6406c-0.003906 0.42969-0.35156 0.78125-0.78516 0.78125zm-17.359-1.5625h16.578v-4.8594c0-0.99609-0.8125-1.8086-1.8086-1.8086h-12.965c-0.99609 0-1.8086 0.8125-1.8086 1.8086z" />

    <!-- serrure -->
    <path
      d="m53.688 56.109h-7.3906c-0.42969 0-0.78125-0.35156-0.78125-0.78125v-10.18c0-0.42969 0.35156-0.78125 0.78125-0.78125h7.3906c0.42969 0 0.78125 0.35156 0.78125 0.78125v10.18c0 0.42969-0.35156 0.78125-0.78125 0.78125zm-6.6094-1.5625h5.8281v-8.6172h-5.8281z" />
    <path
      d="m49.996 56.117c-0.42969 0-0.78125-0.35156-0.78125-0.78125v-4.0234c0-0.42969 0.35156-0.78125 0.78125-0.78125 0.42969 0 0.78125 0.35156 0.78125 0.78125v4.0234c0 0.42969-0.34766 0.78125-0.78125 0.78125z" />
  </g>
</svg>
  `;
}

function incrementorIconTemplate() {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1"
    viewBox="0 0 100 100" enable-background="new 0 0 100 100" xml:space="preserve"
    width="20"
  >
    <path
      fill="currentColor"
      d="M8.597,31.592h14.367v14.371c0,1.984,1.608,3.593,3.593,3.593c1.984,0,3.593-1.609,3.593-3.593V31.592h14.367  c0.002,0,0.003,0,0.005,0c1.984,0,3.593-1.609,3.593-3.593c0-1.984-1.608-3.593-3.593-3.593H30.15V10.035  c0-1.984-1.608-3.593-3.593-3.593c-1.985,0-3.593,1.609-3.593,3.593v14.372H8.593C6.608,24.407,5,26.016,5,28  c0,1.984,1.608,3.593,3.593,3.593C8.594,31.593,8.596,31.592,8.597,31.592z" />
    <path
      fill="currentColor"
      d="M91.407,71.187H55.479c-1.984,0-3.594,1.609-3.594,3.593c0,1.984,1.609,3.593,3.594,3.593h35.929v-0.001  c1.984,0,3.593-1.608,3.593-3.593C95,72.795,93.392,71.187,91.407,71.187z" />
    <path
      fill="currentColor"
      d="M91.195,15.196c1.402-1.403,1.402-3.679,0.001-5.081c-1.404-1.403-3.68-1.403-5.083,0L8.807,87.422  c-0.001,0.001-0.001,0.001-0.001,0.001c-1.403,1.403-1.403,3.679,0,5.082c1.403,1.404,3.678,1.403,5.081,0h0.001l77.307-77.307  C91.194,15.197,91.194,15.196,91.195,15.196z" />
  </svg>`;
}

function settingsIconTemplate() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 0px; margin-left: 0px;">
    <path fill="currentColor" d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z" />
  </svg>`;
}
