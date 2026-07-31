import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(repositoryRoot, "docs", "quality", "npm-audit-baseline.json");
const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
const npmCli = process.platform === "win32"
  ? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
  : "npm";
const auditCommand = process.platform === "win32" ? process.execPath : npmCli;
const auditArguments = process.platform === "win32"
  ? [npmCli, "audit", "--omit=dev", "--json"]
  : ["audit", "--omit=dev", "--json"];
const result = spawnSync(auditCommand, auditArguments, {
  cwd: repositoryRoot,
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});

if (result.error || !result.stdout.trim()) {
  console.error(result.stderr || result.error?.message || "npm audit did not return a report.");
  process.exit(2);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error("npm audit returned invalid JSON.");
  process.exit(2);
}

const counts = report.metadata?.vulnerabilities;
if (!counts) {
  console.error("npm audit report did not include vulnerability counts.");
  process.exit(2);
}

const severities = ["critical", "high", "moderate", "low"];
const violations = severities
  .filter((severity) => counts[severity] > baseline.maximum[severity])
  .map((severity) => `${severity}: ${counts[severity]} exceeds baseline ${baseline.maximum[severity]}`);

console.log(
  "Production dependency audit: " +
    severities.map((severity) => `${severity}=${counts[severity]}/${baseline.maximum[severity]}`).join(", "),
);

if (violations.length > 0) {
  console.error("Dependency audit baseline gate failed:\n- " + violations.join("\n- "));
  process.exit(1);
}
