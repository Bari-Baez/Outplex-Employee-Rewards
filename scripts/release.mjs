import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const type = process.argv[2];
if (!['patch', 'minor', 'major'].includes(type)) {
  console.error('Usage: node scripts/release.mjs <patch|minor|major>');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);

const next =
  type === 'major' ? `${major + 1}.0.0`
  : type === 'minor' ? `${major}.${minor + 1}.0`
  : `${major}.${minor}.${patch + 1}`;

pkg.version = next;
writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');

execSync('git add package.json');
execSync(`git commit -m "chore: release v${next}"`);
execSync(`git tag v${next}`);

console.log(`\n✅ Released v${next}`);
console.log(`   Run: git push origin main --tags\n`);
