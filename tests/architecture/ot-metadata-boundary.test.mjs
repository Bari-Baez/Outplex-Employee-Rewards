import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:ts|tsx|sql)$/.test(entry.name) ? [target] : [];
  }))).flat();
}

test('OT claim metadata is not stored in app_settings compatibility keys', async () => {
  const files = await sourceFiles(path.join(root, 'src'));
  const violations = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (source.includes('ot_claim_meta:')) violations.push(path.relative(root, file));
  }
  assert.deepEqual(violations, []);
});

test('OT metadata migration owns the typed private boundary', async () => {
  const migration = await readFile(
    path.join(root, 'supabase/migrations/2026-07-31_integrity_platform_primitives.sql'),
    'utf8',
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS private\.ot_claim_metadata/);
  assert.match(migration, /CONSTRAINT ot_claim_metadata_claim_kind_check/);
  assert.doesNotMatch(migration, /ot_claim_meta:/);
});
