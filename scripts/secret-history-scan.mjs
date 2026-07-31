import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rules = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["provider-token", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bxox[baprs]-[A-Za-z0-9-]{20,}\b|\bsk_live_[0-9A-Za-z]{16,}\b/],
  ["sensitive-assignment", /(?:SUPABASE_SERVICE_ROLE_KEY|SLACK_(?:CLIENT_SECRET|BOT_TOKEN|USER_TOKEN)|GOOGLE_CLIENT_SECRET|\bPASSWORD\b)\s*[:=]\s*["']([^"']{8,})["']/i],
];
const ignoredValue = /placeholder|process\.env|your[_-]|<[^>]+>|example|pendiente/i;
const jwtPattern = /\beyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{20,}\b/g;

function containsServiceRoleJwt(line) {
  for (const match of line.matchAll(jwtPattern)) {
    try {
      const payload = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
      if (payload?.role === "service_role") return true;
    } catch {
      // Ignore malformed JWT-like strings.
    }
  }
  return false;
}
const log = spawnSync("git", [
  "log", "--all", "--full-history", "--no-renames", "--format=__COMMIT__%H", "--patch", "--unified=0",
  "--", ".", ":(exclude)package-lock.json",
], {
  cwd: repositoryRoot,
  encoding: "utf8",
  maxBuffer: 128 * 1024 * 1024,
});
if (log.status !== 0) {
  console.error(log.stderr || "Unable to scan Git history.");
  process.exit(2);
}

let commit = "unknown";
let file = "unknown";
let newLine = 0;
const findings = [];
for (const line of log.stdout.split(/\r?\n/)) {
  if (line.startsWith("__COMMIT__")) {
    commit = line.slice("__COMMIT__".length);
    continue;
  }
  if (line.startsWith("+++ b/")) {
    file = line.slice(6);
    continue;
  }
  const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(line);
  if (hunk) {
    newLine = Number(hunk[1]);
    continue;
  }
  if (!line.startsWith("+") || line.startsWith("+++")) {
    if (!line.startsWith("-")) newLine += 1;
    continue;
  }

  const added = line.slice(1);
  for (const [rule, pattern] of rules) {
    const match = pattern.exec(added);
    if (!match) continue;
    if (rule === "sensitive-assignment" && ignoredValue.test(match[1] ?? "")) continue;
    findings.push({ commit: commit.slice(0, 12), file, line: newLine, rule });
  }
  if (containsServiceRoleJwt(added)) {
    findings.push({ commit: commit.slice(0, 12), file, line: newLine, rule: "supabase-service-role-jwt" });
  }
  newLine += 1;
}

const unique = [...new Map(findings.map((item) => [
  `${item.commit}:${item.file}:${item.line}:${item.rule}`,
  item,
])).values()];
const reportFlag = process.argv.indexOf("--report");
if (reportFlag >= 0) {
  const reportPath = path.resolve(repositoryRoot, process.argv[reportFlag + 1] ?? "");
  if (!reportPath.startsWith(`${repositoryRoot}${path.sep}`)) throw new Error("Report must stay inside workspace.");
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify({ findings: unique }, null, 2)}\n`, "utf8");
}

if (unique.length > 0) {
  console.error(`Git history secret scan failed: ${unique.length} redacted finding(s).`);
  for (const finding of unique) {
    console.error(`- ${finding.commit} ${finding.file}:${finding.line} [${finding.rule}]`);
  }
  process.exit(1);
}
console.log("Git history secret scan passed: 0 findings.");
