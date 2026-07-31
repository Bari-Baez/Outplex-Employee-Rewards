import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputFlag = process.argv.indexOf("--output");
const output = outputFlag >= 0 ? process.argv[outputFlag + 1] : "artifacts/sbom.cdx.json";
if (!output) throw new Error("--output requires a path.");
const outputPath = path.resolve(repositoryRoot, output);
if (!outputPath.startsWith(`${repositoryRoot}${path.sep}`)) {
  throw new Error("SBOM output must stay inside the repository workspace.");
}

const npmCli = process.platform === "win32"
  ? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
  : "npm";
const command = process.platform === "win32" ? process.execPath : npmCli;
const args = process.platform === "win32"
  ? [npmCli, "sbom", "--sbom-format", "cyclonedx"]
  : ["sbom", "--sbom-format", "cyclonedx"];
const result = spawnSync(command, args, {
  cwd: repositoryRoot,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
if (result.status !== 0 || !result.stdout.trim()) {
  console.error(result.stderr || "npm sbom failed.");
  process.exit(1);
}

const sbom = JSON.parse(result.stdout);
if (sbom.bomFormat !== "CycloneDX" || !sbom.metadata?.component || !Array.isArray(sbom.components)) {
  throw new Error("npm returned an invalid CycloneDX SBOM.");
}
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(sbom, null, 2)}\n`, "utf8");
console.log(`SBOM generated: ${path.relative(repositoryRoot, outputPath)} (${sbom.components.length} components).`);
