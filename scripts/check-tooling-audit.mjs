import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseline = JSON.parse(await readFile(
  path.join(repositoryRoot, "docs", "quality", "tooling-audit-baseline.json"),
  "utf8",
));
const npmCli = process.platform === "win32"
  ? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
  : "npm";
const command = process.platform === "win32" ? process.execPath : npmCli;
const args = process.platform === "win32" ? [npmCli, "audit", "--json"] : ["audit", "--json"];
const result = spawnSync(command, args, {
  cwd: repositoryRoot,
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});

if (result.error || !result.stdout.trim()) {
  console.error(result.stderr || result.error?.message || "npm audit did not return a report.");
  process.exit(2);
}
const report = JSON.parse(result.stdout);
const counts = report.metadata?.vulnerabilities;
const vulnerabilities = report.vulnerabilities ?? {};
if (!counts) throw new Error("Full npm audit did not include counts.");

const rank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const violations = [];
for (const [name, finding] of Object.entries(vulnerabilities)) {
  const allowed = baseline.allowedPackages[name];
  if (!allowed) violations.push(`new tooling finding: ${name} (${finding.severity})`);
  else if (rank[finding.severity] > rank[allowed]) {
    violations.push(`${name} severity ${finding.severity} exceeds ${allowed}`);
  }
}
for (const [severity, maximum] of Object.entries(baseline.maximum)) {
  if ((counts[severity] ?? 0) > maximum) {
    violations.push(`${severity}: ${counts[severity]} exceeds ${maximum}`);
  }
}

console.log(
  `Full dependency audit: critical=${counts.critical}, high=${counts.high}, ` +
  `moderate=${counts.moderate}, low=${counts.low}; ${Object.keys(vulnerabilities).length} package findings.`,
);
if (violations.length > 0) {
  console.error("Tooling audit gate failed:\n- " + violations.join("\n- "));
  process.exit(1);
}
