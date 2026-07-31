import {
  clearStoredSupabaseSession,
  getSupabaseStorageKey,
  isInvalidRefreshTokenPayload,
} from '@frontend/platform/supabase/browser-session';

function isSupabaseRequest(targetUrl: URL, supabaseUrl: string) {
  return targetUrl.origin === new URL(supabaseUrl).origin;
}

function getProxyUrl(targetUrl: URL) {
  return `/api/supabase-proxy${targetUrl.pathname}${targetUrl.search}`;
}

export function createBrowserSupabaseFetch(supabaseUrl: string): typeof fetch {
  const storageKey = getSupabaseStorageKey(supabaseUrl);

  return async (input, init) => {
    const request =
      input instanceof Request
        ? init
          ? new Request(input, init)
          : input.clone()
        : new Request(String(input), init);

    const targetUrl = new URL(request.url, window.location.origin);
    if (!isSupabaseRequest(targetUrl, supabaseUrl)) {
      return fetch(input, init);
    }

    const method = request.method.toUpperCase();
    const headers = new Headers(request.headers);
    headers.delete('host');

    const body =
      method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();

    const response = await fetch(getProxyUrl(targetUrl), {
      method,
      headers,
      body,
      cache: request.cache,
      credentials: 'same-origin',
      integrity: request.integrity,
      keepalive: request.keepalive,
      mode: 'same-origin',
      redirect: request.redirect,
      referrer: request.referrer,
      referrerPolicy: request.referrerPolicy,
      signal: request.signal,
    });

    if (
      targetUrl.pathname.endsWith('/auth/v1/token') &&
      targetUrl.searchParams.get('grant_type') === 'refresh_token' &&
      !response.ok
    ) {
      const payload = (await response.clone().json().catch(() => null)) as unknown;
      if (isInvalidRefreshTokenPayload(payload)) {
        clearStoredSupabaseSession(storageKey);
      }
    }

    return response;
  };
}
