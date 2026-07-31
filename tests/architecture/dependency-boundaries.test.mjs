import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const sourceRoots = ['src', 'frontend', 'backend', 'shared'];
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

async function allFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries
    .filter((entry) => !['.git', '.next', '.vercel', 'node_modules', 'artifacts', 'test-results'].includes(entry.name))
    .map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      return entry.isDirectory() ? allFiles(fullPath) : entry.isFile() ? [fullPath] : [];
    }));
  return files.flat();
}

function importsFrom(source) {
  return [...source.matchAll(importPattern)].map((match) => match[1] ?? match[2]);
}

function relative(file) {
  return path.relative(repositoryRoot, file).split(path.sep).join('/');
}

const files = (await Promise.all(sourceRoots.map((root) => sourceFiles(path.join(repositoryRoot, root))))).flat();
const records = await Promise.all(files.map(async (file) => {
  const source = await readFile(file, 'utf8');
  return { file, relative: relative(file), source, imports: importsFrom(source) };
}));

test('physical frontend, backend and database roots exist', async () => {
  for (const root of ['frontend', 'backend', 'database']) {
    await assert.doesNotReject(access(path.join(repositoryRoot, root)), `${root}/ must exist`);
  }
  for (const legacy of ['src/modules', 'src/platform', 'src/shared', 'src/types']) {
    const legacyPath = path.join(repositoryRoot, legacy);
    const files = await sourceFiles(legacyPath).catch(() => []);
    assert.deepEqual(files, [], `${legacy} must not contain source files`);
  }
});

test('SQL exists only in the database lifecycle or deployable migration roots', async () => {
  const sqlFiles = (await allFiles(repositoryRoot))
    .map(relative)
    .filter((file) => file.endsWith('.sql'));
  const misplaced = sqlFiles.filter((file) => !file.startsWith('database/') && !file.startsWith('supabase/migrations/'));
  assert.deepEqual(misplaced, [], `Misplaced SQL files:\n${misplaced.join('\n')}`);
  assert.ok(sqlFiles.some((file) => file.startsWith('supabase/migrations/')), 'deployable migrations must exist');
});

test('Client Components cannot reach backend server layers or Node built-ins', () => {
  const backendServer = /^@backend\/(?:platform|modules\/[^/]+\/(?:application|infrastructure))(?:\/|$)/;
  const nodeOnly = /^(?:node:)?(?:fs|path|crypto|child_process|os|net|tls|http|https)(?:\/|$)/;
  const violations = records.flatMap(({ relative: file, source, imports }) => {
    if (!/^\s*["']use client["'];?/m.test(source)) return [];
    return imports.filter((specifier) => backendServer.test(specifier) || nodeOnly.test(specifier) || specifier === 'server-only')
      .map((specifier) => `${file} -> ${specifier}`);
  });
  assert.deepEqual(violations, [], `Forbidden client imports:\n${violations.join('\n')}`);
});

test('frontend depends only on backend domain and contract surfaces', () => {
  const allowedBackendSurface = /^@backend\/modules\/[^/]+\/(?:domain|contracts)(?:\/|$)/;
  const violations = records.flatMap(({ relative: file, imports }) => {
    if (!file.startsWith('frontend/')) return [];
    return imports
      .filter((specifier) => specifier.startsWith('@backend/') && !allowedBackendSurface.test(specifier))
      .map((specifier) => `${file} -> ${specifier}`);
  });
  assert.deepEqual(violations, [], `Frontend-to-server dependencies:\n${violations.join('\n')}`);
});

test('backend never imports frontend or Next route entrypoints', () => {
  const violations = records.flatMap(({ relative: file, imports }) => {
    if (!file.startsWith('backend/')) return [];
    return imports.filter((specifier) => specifier.startsWith('@frontend/') || specifier.startsWith('@/app/'))
      .map((specifier) => `${file} -> ${specifier}`);
  });
  assert.deepEqual(violations, [], `Inverted backend dependencies:\n${violations.join('\n')}`);
});

test('shared leaf code depends on neither frontend nor backend', () => {
  const violations = records.flatMap(({ relative: file, imports }) => {
    if (!file.startsWith('shared/')) return [];
    return imports.filter((specifier) => specifier.startsWith('@frontend/') || specifier.startsWith('@backend/'))
      .map((specifier) => `${file} -> ${specifier}`);
  });
  assert.deepEqual(violations, [], `Shared dependency violations:\n${violations.join('\n')}`);
});

test('API Route Handlers cannot import frontend/browser code', () => {
  const violations = records.flatMap(({ relative: file, imports }) => {
    if (!/^src\/app\/api\/.+\/route\.[jt]s$/.test(file)) return [];
    return imports.filter((specifier) => specifier.startsWith('@frontend/'))
      .map((specifier) => `${file} -> ${specifier}`);
  });
  assert.deepEqual(violations, [], `API-to-frontend dependencies:\n${violations.join('\n')}`);
});

test('legacy architectural aliases are retired', () => {
  const legacy = /^@\/(?:components|hooks|lib|modules|platform|shared|types)(?:\/|$)/;
  const violations = records.flatMap(({ relative: file, imports }) => imports
    .filter((specifier) => legacy.test(specifier))
    .map((specifier) => `${file} -> ${specifier}`));
  assert.deepEqual(violations, [], `Legacy aliases:\n${violations.join('\n')}`);
});

test('frontend module dependency graph is acyclic', () => {
  const graph = new Map();
  for (const { relative: file, imports } of records) {
    const source = /^frontend\/modules\/([^/]+)\//.exec(file)?.[1];
    if (!source) continue;
    const targets = graph.get(source) ?? new Set();
    for (const specifier of imports) {
      const target = /^@frontend\/modules\/([^/]+)\//.exec(specifier)?.[1];
      if (target && target !== source) targets.add(target);
    }
    graph.set(source, targets);
  }

  const visiting = new Set();
  const visited = new Set();
  const cycles = [];
  function visit(moduleName, trail) {
    if (visiting.has(moduleName)) {
      cycles.push([...trail.slice(trail.indexOf(moduleName)), moduleName].join(' -> '));
      return;
    }
    if (visited.has(moduleName)) return;
    visiting.add(moduleName);
    for (const target of graph.get(moduleName) ?? []) visit(target, [...trail, target]);
    visiting.delete(moduleName);
    visited.add(moduleName);
  }
  for (const moduleName of graph.keys()) visit(moduleName, [moduleName]);
  assert.deepEqual([...new Set(cycles)], [], `Frontend module cycles:\n${cycles.join('\n')}`);
});
