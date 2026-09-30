/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  vitest: { configFile: "vite.config.mjs" },
  mutate: ["src/**/*.{js,ts}", "!src/**/*.spec.{js,ts}", "!src/vite-env.d.ts"],
  coverageAnalysis: "perTest",
  reporters: ["clear-text", "progress", "html", "json"],
  htmlReporter: { fileName: "reports/mutation/mutation-report.html" },
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  thresholds: { high: 80, low: 60, break: null },
  incremental: true,
  incrementalFile: "reports/stryker-incremental.json",
};
