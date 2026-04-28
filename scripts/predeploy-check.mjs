import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

// ── Env var validation ────────────────────────────────────────────────────────

const INVALID_VALUES = new Set(['PENDIENTE', 'PLACEHOLDER', 'your_anon_key_here',
  'your_service_role_key_here', 'YOUR_PROJECT_ID']);

const REQUIRED_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_APP_URL',
  'ALLOWED_EMAIL_DOMAINS',
  'DEV_BOOTSTRAP_TOKEN',
  'DEV_PROMOTE_TOKEN',
];

function isInvalid(key, val) {
  if (!val) return 'missing';
  if (INVALID_VALUES.has(val)) return `placeholder value "${val}"`;
  if (key === 'NEXT_PUBLIC_APP_URL' && val.includes('localhost') && process.env.NODE_ENV === 'production') {
    return 'points to localhost in production';
  }
  if (key === 'NEXT_PUBLIC_SUPABASE_URL' && val.includes('YOUR_PROJECT_ID')) {
    return 'still using example URL';
  }
  return null;
}

function checkEnvVars() {
  let failed = false;
  // Load .env.local if running locally (CI will have real env)
  let envLocal = {};
  try {
    const raw = readFileSync('.env.local', 'utf8');
    for (const line of raw.split('\n')) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) envLocal[match[1].trim()] = match[2].trim();
    }
  } catch {
    // In CI/Vercel, env vars are injected directly — no .env.local file
  }

  const env = { ...envLocal, ...process.env };

  process.stdout.write('\n[predeploy] Environment variable check:\n');
  for (const key of REQUIRED_VARS) {
    const val = env[key];
    const problem = isInvalid(key, val);
    if (problem) {
      process.stdout.write(`  ❌ ${key} — ${problem}\n`);
      failed = true;
    } else {
      const display = val.length > 40 ? val.slice(0, 40) + '…' : val;
      process.stdout.write(`  ✅ ${key} = ${display}\n`);
    }
  }

  if (failed) {
    process.stdout.write('\n[predeploy] ❌ Env check failed. Fix the variables above before deploying.\n');
    process.exit(1);
  }
  process.stdout.write('[predeploy] ✅ All env vars OK.\n');
}

checkEnvVars();

// ── Build checks ──────────────────────────────────────────────────────────────

const checks = [
  { label: 'Lint', command: 'npx', args: ['eslint', 'src', '--max-warnings', '9999'] },
  { label: 'Typecheck', command: 'npx', args: ['tsc', '--noEmit'] },
  { label: 'Build', command: 'npx', args: ['next', 'build'] },
];

function runCheck({ label, command, args }) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const resolvedCommand = isWindows ? 'cmd.exe' : command;
    const resolvedArgs = isWindows ? ['/d', '/s', '/c', [command, ...args].join(' ')] : args;
    const child = spawn(resolvedCommand, resolvedArgs, {
      stdio: 'inherit',
      shell: false,
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} failed with exit code ${code ?? 'unknown'}.`));
    });
  });
}

for (const check of checks) {
  process.stdout.write(`\n[predeploy] ${check.label}\n`);
  await runCheck(check);
}

process.stdout.write('\n[predeploy] ✅ All checks passed. Ready to deploy.\n');
