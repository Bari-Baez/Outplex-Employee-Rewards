export function proxifyMediaUrl(url: string | null | undefined) {
  const raw = typeof url === 'string' ? url.trim() : '';
  if (!raw) return '';

  // Already proxied or relative (same-origin).
  if (raw.startsWith('/')) return raw;

  // Only proxy http(s) URLs.
  if (!/^https?:\/\//i.test(raw)) return raw;

  return `/api/media/proxy?url=${encodeURIComponent(raw)}`;
}

