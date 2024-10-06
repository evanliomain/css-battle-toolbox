import { defineManifest } from "@crxjs/vite-plugin";
import packageJson from "./package.json";
const { version } = packageJson;

const extensionName = "Css Battle Toolbox";

export default defineManifest(async (env) => ({
  manifest_version: 3,
  version,
  name: env.mode === "development" ? `[DEV] ${extensionName}` : extensionName,
  description: "A set of tools for Css Battle, directly in the battle interface.",
  icons: {
    "16": "images/favicon/favicon-16x16.png",
    "32": "images/favicon/favicon-32x32.png",
    "48": "images/favicon/mstile-70x70.png",
    "128": "images/favicon/mstile-144x144.png",
  },
  action: { default_popup: "index.html" },
  options_page: "src/options.html",
  permissions: ["storage"],
  content_scripts: [
    {
      js: [
        "src/unit-tools.js",
        "src/color-tools.js",
        "src/editor-buttons.js",
        "src/reset-tools.js",
        "src/score-tools.js",
        "src/output-tools.js",
        "src/autoclose-tools.js",
        "src/character-tools.js",
        "src/remove-ads.js",
      ],
      matches: ["https://cssbattle.dev/play/*"],
    },
    {
      js: ["src/dowload-tools.js"],
      matches: ["https://cssbattle.dev/daily"],
    },
  ],
}));
