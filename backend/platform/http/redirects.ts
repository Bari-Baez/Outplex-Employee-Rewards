import 'server-only';

const ENCODED_PATH_SEPARATOR = /%(?:2f|5c)/i;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

export function safeRelativePath(value: string | null, fallback = '/dashboard'): string {
  if (
    !value
    || !value.startsWith('/')
    || value.startsWith('//')
    || value.includes('\\')
    || ENCODED_PATH_SEPARATOR.test(value)
    || CONTROL_CHARACTER.test(value)
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(value, 'https://relative.invalid');
    if (parsed.origin !== 'https://relative.invalid') return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function isSameOriginRequest(request: Request, expectedOrigin: URL): boolean {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site') return false;

  const origin = request.headers.get('origin');
  if (!origin) return true;

  try {
    return new URL(origin).origin === expectedOrigin.origin;
  } catch {
    return false;
  }
}
