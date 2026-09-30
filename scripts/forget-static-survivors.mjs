// Drops the static mutants that were not killed from Stryker's incremental file,
// so the next run tests them again.
//
// A static mutant runs when its module loads (a top-level constant, say), so
// Stryker cannot tell which tests cover it. In incremental mode it then keeps
// its old "survived" result, even once a new test kills it.
// Usage: node scripts/forget-static-survivors.mjs [reports/stryker-incremental.json]
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const DETECTED = ["Killed", "Timeout"];
const [path = "reports/stryker-incremental.json"] = process.argv.slice(2);

if (!existsSync(path)) {
  console.log(`No ${path}, nothing to forget`);
  process.exit(0);
}

const report = JSON.parse(readFileSync(path, "utf8"));
let forgotten = 0;
for (const file of Object.values(report.files)) {
  const kept = file.mutants.filter(
    (mutant) => !mutant.static || DETECTED.includes(mutant.status),
  );
  forgotten += file.mutants.length - kept.length;
  file.mutants = kept;
}
writeFileSync(path, JSON.stringify(report));
console.log(`Forgot ${forgotten} static mutant(s) that were not killed`);
