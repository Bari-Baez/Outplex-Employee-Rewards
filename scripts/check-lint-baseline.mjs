import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(repositoryRoot, "docs", "quality", "eslint-warning-baseline.json");
const eslintBin = path.join(repositoryRoot, "node_modules", "eslint", "bin", "eslint.js");

const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
const result = spawnSync(
  process.execPath,
  [eslintBin, "src", "frontend", "backend", "shared", "--format", "json"],
  {
  cwd: repositoryRoot,
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
  },
);

if (result.error || result.status === 2 || !result.stdout.trim()) {
  console.error(result.stderr || result.error?.message || "ESLint did not return a report.");
  process.exit(2);
}

const reports = JSON.parse(result.stdout);
const messages = reports.flatMap((report) => report.messages);
const errors = messages.filter((message) => message.severity === 2);
const warnings = messages.filter((message) => message.severity === 1);
const warningCounts = warnings.reduce((counts, warning) => {
  const rule = warning.ruleId ?? "<unclassified>";
  counts[rule] = (counts[rule] ?? 0) + 1;
  return counts;
}, {});

const violations = [];
if (errors.length > 0) violations.push(`${errors.length} lint error(s)`);
if (warnings.length > baseline.maximumWarnings) {
  violations.push(`${warnings.length} warnings exceeds baseline ${baseline.maximumWarnings}`);
}

for (const [rule, count] of Object.entries(warningCounts)) {
  const allowed = baseline.rules[rule] ?? 0;
  if (count > allowed) violations.push(`${rule}: ${count} exceeds baseline ${allowed}`);
}

console.log(`ESLint baseline: ${errors.length} errors, ${warnings.length}/${baseline.maximumWarnings} warnings.`);
for (const [rule, count] of Object.entries(warningCounts).sort()) {
  console.log(`  ${rule}: ${count}/${baseline.rules[rule] ?? 0}`);
}

if (violations.length > 0) {
  console.error("Lint baseline gate failed:\n- " + violations.join("\n- "));
  process.exit(1);
}
