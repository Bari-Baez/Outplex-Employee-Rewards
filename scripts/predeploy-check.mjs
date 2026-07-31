import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const INVALID_VALUES = new Set([
  'pendiente',
  'placeholder',
  'your_anon_key_here',
  'your_service_role_key_here',
  'your_project_id',
]);

const REQUIRED_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_APP_URL',
  'ALLOWED_EMAIL_DOMAINS',
];

function isInvalid(key, value) {
  if (!value) return 'missing';
  const normalized = value.trim().toLowerCase();
  if (INVALID_VALUES.has(normalized) || normalized.includes('your_project_id')) {
    return 'contains a placeholder value';
  }
  if (key === 'NEXT_PUBLIC_APP_URL') {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
        return 'must be an HTTP(S) origin without credentials, path, query, or fragment';
      }
      if (process.env.NODE_ENV === 'production' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
        return 'points to localhost in production';
      }
    } catch {
      return 'is not a valid URL';
    }
  }
  return null;
}

function readLocalEnvironment() {
  const environment = {};
  try {
    const raw = readFileSync('.env.local', 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (!match) continue;
      const rawValue = match[2].trim();
      environment[match[1].trim()] = rawValue.replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch {
    // CI and hosted deployments inject environment variables directly.
  }
  return environment;
}

function checkEnvironment() {
  const environment = { ...readLocalEnvironment(), ...process.env };
  let failed = false;

  process.stdout.write('\n[predeploy] Environment variable check:\n');
  for (const key of REQUIRED_VARS) {
    const problem = isInvalid(key, environment[key]);
    if (problem) {
      process.stdout.write(`  FAIL ${key}: ${problem}\n`);
      failed = true;
    } else {
      // Never print values: even public configuration can expose deployment details.
      process.stdout.write(`  OK   ${key} is configured\n`);
    }
  }

  const conditionalSecrets = [
    ['ALLOW_PUBLIC_DEMO_BOOTSTRAP', 'DEV_BOOTSTRAP_TOKEN'],
    ['ALLOW_PUBLIC_DEMO_PROMOTE', 'DEV_PROMOTE_TOKEN'],
  ];
  for (const [flag, secret] of conditionalSecrets) {
    if (environment[flag]?.trim().toLowerCase() !== 'true') continue;
    const problem = isInvalid(secret, environment[secret]);
    if (problem) {
      process.stdout.write(`  FAIL ${secret}: ${problem} while ${flag}=true\n`);
      failed = true;
    } else {
      process.stdout.write(`  OK   ${secret} is configured\n`);
    }
  }

  if (failed) {
    process.stdout.write('\n[predeploy] Environment check failed.\n');
    process.exit(1);
  }
  process.stdout.write('[predeploy] Environment check passed.\n');
}

checkEnvironment();

const checks = [
  { label: 'Secret scan', command: 'node', args: ['scripts/secret-scan.mjs'] },
  { label: 'Lint baseline', command: 'node', args: ['scripts/check-lint-baseline.mjs'] },
  { label: 'Typecheck', command: 'npx', args: ['tsc', '--noEmit'] },
  { label: 'Tests', command: 'node', args: ['scripts/run-tests-if-present.mjs'] },
  { label: 'API inventory', command: 'node', args: ['scripts/api-route-inventory.mjs'] },
  { label: 'Dependency audit', command: 'node', args: ['scripts/check-audit-baseline.mjs'] },
  { label: 'Build', command: 'npx', args: ['next', 'build'] },
];

function runCheck({ label, command, args }) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const resolvedCommand = isWindows ? 'cmd.exe' : command;
    const resolvedArgs = isWindows ? ['/d', '/s', '/c', [command, ...args].join(' ')] : args;
    const child = spawn(resolvedCommand, resolvedArgs, { stdio: 'inherit', shell: false });

    child.once('error', (error) => reject(new Error(`${label} could not start: ${error.message}`)));
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed with exit code ${code ?? 'unknown'}.`));
    });
  });
}

for (const check of checks) {
  process.stdout.write(`\n[predeploy] ${check.label}\n`);
  await runCheck(check);
}

process.stdout.write('\n[predeploy] All checks passed. Ready to deploy.\n');
