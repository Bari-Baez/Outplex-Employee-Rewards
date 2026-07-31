import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
const testScript = packageJson.scripts?.test;

if (!testScript) {
  console.log("No package.json test script is defined; package test stage skipped explicitly.");
  process.exit(0);
}

const npmCli = process.platform === "win32"
  ? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
  : "npm";
const testCommand = process.platform === "win32" ? process.execPath : npmCli;
const testArguments = process.platform === "win32"
  ? [npmCli, "test"]
  : ["test"];
const result = spawnSync(testCommand, testArguments, {
  cwd: repositoryRoot,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
