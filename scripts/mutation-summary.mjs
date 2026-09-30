// Turns the Stryker JSON report into a markdown summary, for the pull request comment.
// Usage: node scripts/mutation-summary.mjs [reports/mutation/mutation.json] [report url]
import { readFileSync } from "node:fs";

const MAX_SURVIVORS = 50;

const [reportPath = "reports/mutation/mutation.json", reportUrl] =
  process.argv.slice(2);
const report = JSON.parse(readFileSync(reportPath, "utf8"));
const { high = 80, low = 60 } = report.thresholds ?? {};

const count = (mutants) => {
  const is = (status) => mutants.filter((m) => m.status === status).length;
  const killed = is("Killed");
  const timeout = is("Timeout");
  const survived = is("Survived");
  const noCoverage = is("NoCoverage");
  const valid = killed + timeout + survived + noCoverage;
  const score = valid === 0 ? 100 : ((killed + timeout) / valid) * 100;
  return { killed, timeout, survived, noCoverage, score };
};

const badge = (score) => (score >= high ? "🟢" : score >= low ? "🟡" : "🔴");
const percent = (score) => `${score.toFixed(2)}%`;
const row = (cells) => `| ${cells.join(" | ")} |`;

const files = Object.entries(report.files)
  .map(([path, file]) => ({ path, ...count(file.mutants), file }))
  .sort((a, b) => a.score - b.score || a.path.localeCompare(b.path));
const total = count(files.flatMap(({ file }) => file.mutants));

const survivors = files.flatMap(({ path, file }) =>
  file.mutants
    .filter((m) => m.status === "Survived" || m.status === "NoCoverage")
    .map((m) => ({ path, ...m })),
);

const lines = [
  "## 🧟 Mutation testing",
  "",
  `${badge(total.score)} **Mutation score: ${percent(total.score)}**`,
  `(${total.killed + total.timeout} killed, ${total.survived} survived, ${total.noCoverage} without coverage)`,
  "",
  "<details><summary>Score by file</summary>",
  "",
  row(["", "File", "Score", "Killed", "Timeout", "Survived", "No coverage"]),
  row(["---", "---", "---:", "---:", "---:", "---:", "---:"]),
  ...files.map((f) =>
    row([
      badge(f.score),
      `\`${f.path}\``,
      percent(f.score),
      f.killed,
      f.timeout,
      f.survived,
      f.noCoverage,
    ]),
  ),
  "",
  "</details>",
];

if (survivors.length > 0) {
  lines.push(
    "",
    `<details><summary>Surviving mutants (${survivors.length})</summary>`,
    "",
    row(["File", "Line", "Mutator", "Replacement"]),
    row(["---", "---:", "---", "---"]),
    ...survivors
      .slice(0, MAX_SURVIVORS)
      .map((m) =>
        row([
          `\`${m.path}\``,
          m.location.start.line,
          m.mutatorName,
          code(m.replacement ?? ""),
        ]),
      ),
    ...(survivors.length > MAX_SURVIVORS
      ? [
          "",
          `…and ${survivors.length - MAX_SURVIVORS} more, see the full report.`,
        ]
      : []),
    "",
    "</details>",
  );
}

if (reportUrl) {
  lines.push("", `📄 [Full HTML report](${reportUrl})`);
}

console.log(lines.join("\n"));

function code(text) {
  const oneLine = text.replace(/\s+/g, " ").trim();
  const short = oneLine.length > 60 ? `${oneLine.slice(0, 57)}...` : oneLine;
  return `\`${short.replace(/`/g, "'").replace(/\|/g, "\\|")}\``;
}
