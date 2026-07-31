import 'server-only';

const PLACEHOLDER_VALUES = new Set([
  'PENDIENTE',
  'PLACEHOLDER',
  'your_anon_key_here',
  'your_service_role_key_here',
]);

export function getOptionalServerEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  const normalized = value?.toLowerCase();
  if (
    !value
    || (normalized !== undefined && PLACEHOLDER_VALUES.has(normalized))
    || /(?:^|[_-])placeholder(?:$|[_-])/i.test(value)
    || /(?:^|[-_])your(?:[-_]|$)/i.test(value)
  ) {
    return null;
  }
  return value;
}

export function getRequiredServerEnv(name: string): string {
  const value = getOptionalServerEnv(name);
  if (!value) {
    throw new Error(`Missing required server configuration: ${name}`);
  }
  return value;
}

export function getAppOrigin(): URL {
  const configured = getRequiredServerEnv('NEXT_PUBLIC_APP_URL');
  const origin = new URL(configured);

  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) {
    throw new Error('NEXT_PUBLIC_APP_URL must be an HTTP(S) origin.');
  }

  if (origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('NEXT_PUBLIC_APP_URL must not include a path, query, or fragment.');
  }

  return origin;
}

export function getAllowedEmailDomains(): ReadonlySet<string> {
  const configured = getOptionalServerEnv('ALLOWED_EMAIL_DOMAINS')
    ?.split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))
    ?? [];

  const defaults = process.env.NODE_ENV === 'production'
    ? ['outplex.com']
    : ['outplex.com', 'outplex.test', 'gmail.com'];

  return new Set([...defaults, ...configured]);
}

export function getMediaProxyAllowedHosts(): ReadonlySet<string> {
  const configured = getOptionalServerEnv('MEDIA_PROXY_ALLOWED_HOSTS')
    ?.split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => /^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host))
    ?? [];
  const defaults = ['images.unsplash.com', 'lh3.googleusercontent.com', 'picsum.photos', '*.supabase.co'];
  const supabaseUrl = getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_URL');
  if (supabaseUrl) {
    try {
      defaults.push(new URL(supabaseUrl).hostname.toLowerCase());
    } catch {
      // The Supabase environment validator reports malformed URLs separately.
    }
  }
  return new Set([...defaults, ...configured]);
}
