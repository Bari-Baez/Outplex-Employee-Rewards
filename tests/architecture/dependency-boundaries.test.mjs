import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sourceRoot = path.join(repositoryRoot, "src");
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)/g;

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return entry.isFile() && sourceExtensions.has(path.extname(entry.name)) ? [fullPath] : [];
  }));
  return files.flat();
}

function importsFrom(source) {
  return [...source.matchAll(importPattern)].map((match) => match[1] ?? match[2]);
}

function relative(file) {
  return path.relative(repositoryRoot, file).split(path.sep).join("/");
}

const files = await sourceFiles(sourceRoot);
const records = await Promise.all(files.map(async (file) => {
  const source = await readFile(file, "utf8");
  return { file, source, imports: importsFrom(source) };
}));

test("Client Components do not import server-only modules or Node built-ins", () => {
  const serverOnly = /^(?:@\/lib\/(?:supabase\/(?:server|server-fetch)|.*-server(?:\.|$)|read-models\/)|@\/modules\/[^/]+\/infrastructure\/|@\/platform\/|server-only$)/;
  const nodeOnly = /^(?:node:)?(?:fs|path|crypto|child_process|os|net|tls)(?:\/|$)/;
  const violations = records.flatMap(({ file, source, imports }) => {
    const isClient = /^\s*["']use client["'];?/m.test(source);
    if (!isClient) return [];
    return imports.filter((specifier) => serverOnly.test(specifier) || nodeOnly.test(specifier))
      .map((specifier) => `${relative(file)} -> ${specifier}`);
  });
  assert.deepEqual(violations, [], `Forbidden client imports:\n${violations.join("\n")}`);
});

test("Server/data modules do not depend on UI or route layers", () => {
  const serverModule = /\/src\/(?:lib\/(?:.*-server\.[jt]sx?|supabase\/(?:server|server-fetch)\.[jt]s|read-models\/)|modules\/[^/]+\/infrastructure\/|platform\/)/;
  const forbidden = /^@\/(?:app|components|hooks)(?:\/|$)/;
  const violations = records.flatMap(({ file, imports }) => {
    if (!serverModule.test(file.replaceAll("\\", "/"))) return [];
    return imports.filter((specifier) => forbidden.test(specifier))
      .map((specifier) => `${relative(file)} -> ${specifier}`);
  });
  assert.deepEqual(violations, [], `Inverted server dependencies:\n${violations.join("\n")}`);
});

test("API route handlers do not import components or browser hooks", () => {
  const routeHandler = /\/src\/app\/api\/.*\/route\.[jt]s$/;
  const forbidden = /^@\/(?:components|hooks)(?:\/|$)/;
  const violations = records.flatMap(({ file, imports }) => {
    if (!routeHandler.test(file.replaceAll("\\", "/"))) return [];
    return imports.filter((specifier) => forbidden.test(specifier))
      .map((specifier) => `${relative(file)} -> ${specifier}`);
  });
  assert.deepEqual(violations, [], `API-to-UI dependencies:\n${violations.join("\n")}`);
});

test("Module domain and application layers do not depend on infrastructure", () => {
  const layeredModule = /\/src\/modules\/[^/]+\/(domain|contracts|application)\/([^/]+)$/;
  const violations = records.flatMap(({ file, imports }) => {
    const match = file.replaceAll("\\", "/").match(layeredModule);
    if (!match) return [];
    const layer = match[1];
    return imports.filter((specifier) => {
      if (/^@\/(?:app|components|hooks)(?:\/|$)/.test(specifier)) return true;
      if (layer === "domain" || layer === "contracts") {
        return /\/(?:application|infrastructure)(?:\/|$)/.test(specifier);
      }
      return /\/infrastructure(?:\/|$)/.test(specifier);
    }).map((specifier) => `${relative(file)} -> ${specifier}`);
  });
  assert.deepEqual(violations, [], `Inverted module-layer dependencies:\n${violations.join("\n")}`);
});

test("Platform primitives do not depend on product modules or UI", () => {
  const platformFile = /\/src\/platform\//;
  const forbidden = /^@\/(?:app|components|hooks|modules)(?:\/|$)/;
  const violations = records.flatMap(({ file, imports }) => {
    if (!platformFile.test(file.replaceAll("\\", "/"))) return [];
    return imports.filter((specifier) => forbidden.test(specifier))
      .map((specifier) => `${relative(file)} -> ${specifier}`);
  });
  assert.deepEqual(violations, [], `Platform dependency violations:\n${violations.join("\n")}`);
});
