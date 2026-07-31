import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rules = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["github-token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/],
  ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ["google-api-key", /\bAIza[0-9A-Za-z_-]{30,}\b/],
  ["stripe-live-secret", /\bsk_live_[0-9A-Za-z]{16,}\b/],
];
const ignoredExtensions = new Set([".ico", ".jpg", ".jpeg", ".png", ".webp", ".woff", ".woff2"]);
const jwtPattern = /\beyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{20,}\b/g;

function containsServiceRoleJwt(line) {
  for (const match of line.matchAll(jwtPattern)) {
    try {
      const payload = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
      if (payload?.role === "service_role") return true;
    } catch {
      // Invalid JWT-like strings are handled by other rules if relevant.
    }
  }
  return false;
}
const git = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  cwd: repositoryRoot,
  encoding: "utf8",
});

if (git.status !== 0) {
  console.error("Unable to enumerate tracked files for secret scanning.");
  process.exit(2);
}

const findings = [];
for (const relativePath of git.stdout.split("\0").filter(Boolean)) {
  const normalized = relativePath.replaceAll("\\", "/");
  const basename = path.basename(normalized);
  if (/^\.env(?:\.|$)/.test(basename) && basename !== ".env.example") {
    findings.push({ file: normalized, line: 1, rule: "committed-env-file" });
    continue;
  }
  if (basename === ".env.example" || ignoredExtensions.has(path.extname(basename).toLowerCase())) continue;
  if (normalized === "package-lock.json") continue;

  const source = await readFile(path.join(repositoryRoot, relativePath), "utf8").catch(() => null);
  if (source === null || source.includes("\0")) continue;
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    for (const [rule, pattern] of rules) {
      if (pattern.test(lines[index])) findings.push({ file: normalized, line: index + 1, rule });
    }
    if (containsServiceRoleJwt(lines[index])) {
      findings.push({ file: normalized, line: index + 1, rule: "supabase-service-role-jwt" });
    }
  }
}

if (findings.length > 0) {
  console.error("Potential secrets detected (values intentionally redacted):");
  for (const finding of findings) console.error(`- ${finding.file}:${finding.line} [${finding.rule}]`);
  process.exit(1);
}

console.log("Secret scan passed for tracked source files.");
