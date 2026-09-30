import { crx } from "@crxjs/vite-plugin";
import { defineConfig } from "vite";
import manifest from "./manifest.config";

export default defineConfig({
  plugins: [crx({ manifest })],
  test: {
    // Only the project specs, not the copies in Stryker sandboxes
    include: ["src/**/*.spec.{js,ts}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{js,ts}"],
      exclude: ["src/**/*.spec.{js,ts}", "src/vite-env.d.ts"],
      reporter: ["text", "json-summary", "json"],
      reportOnFailure: true,
      thresholds: { 100: true },
    },
  },
});
