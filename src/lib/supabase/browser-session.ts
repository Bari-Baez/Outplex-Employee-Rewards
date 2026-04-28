const INVALID_REFRESH_TOKEN_MESSAGES = [
  'invalid refresh token',
  'refresh token not found',
];

type StoredSession = {
  expires_at?: number;
  refresh_token?: string;
};

function getProjectRef(supabaseUrl: string) {
  return new URL(supabaseUrl).hostname.split('.')[0] ?? 'supabase';
}

export function getSupabaseStorageKey(supabaseUrl: string) {
  return `sb-${getProjectRef(supabaseUrl)}-auth-token`;
}

export function readStoredSupabaseSession(storageKey: string): StoredSession | null {
  const rawValue = window.localStorage.getItem(storageKey);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as StoredSession | null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    window.localStorage.removeItem(storageKey);
    return null;
  }
}

export function clearStoredSupabaseSession(storageKey: string) {
  window.localStorage.removeItem(storageKey);
}

export function isSessionExpiring(session: StoredSession) {
  if (typeof session.expires_at !== 'number') {
    return true;
  }

  return session.expires_at * 1000 <= Date.now() + 60_000;
}

export function isInvalidRefreshTokenPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const message =
    'message' in payload && typeof payload.message === 'string'
      ? payload.message.toLowerCase()
      : '';
  const errorDescription =
    'error_description' in payload && typeof payload.error_description === 'string'
      ? payload.error_description.toLowerCase()
      : '';

  return INVALID_REFRESH_TOKEN_MESSAGES.some(
    (candidate) => message.includes(candidate) || errorDescription.includes(candidate),
  );
}

async function recoverBrowserSession(
  supabaseUrl: string,
  anonKey: string,
  fetchImpl: typeof fetch,
) {
  const storageKey = getSupabaseStorageKey(supabaseUrl);
  const rawValue = window.localStorage.getItem(storageKey);
  const storedSession = readStoredSupabaseSession(storageKey);
  if (!storedSession) {
    return null;
  }

  if (!storedSession.refresh_token) {
    clearStoredSupabaseSession(storageKey);
    return null;
  }

  if (!isSessionExpiring(storedSession)) {
    return JSON.stringify(storedSession);
  }

  const refreshUrl = new URL('/auth/v1/token?grant_type=refresh_token', supabaseUrl);
  const response = await fetchImpl(refreshUrl.toString(), {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
      'X-Client-Info': 'outplex-session-recovery',
    },
    body: JSON.stringify({
      refresh_token: storedSession.refresh_token,
    }),
  });

  if (response.ok) {
    const refreshedSession = (await response.json()) as StoredSession;
    const serializedSession = JSON.stringify(refreshedSession);
    window.localStorage.setItem(storageKey, serializedSession);
    return serializedSession;
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  if (isInvalidRefreshTokenPayload(payload)) {
    clearStoredSupabaseSession(storageKey);
    return null;
  }

  return rawValue;
}

export function createRecoveringSupabaseStorage(
  supabaseUrl: string,
  anonKey: string,
  fetchImpl: typeof fetch,
) {
  const storageKey = getSupabaseStorageKey(supabaseUrl);

  return {
    async getItem(key: string) {
      if (key !== storageKey) {
        return window.localStorage.getItem(key);
      }

      try {
        return await recoverBrowserSession(supabaseUrl, anonKey, fetchImpl);
      } catch (error) {
        console.warn('[supabase] browser session recovery failed', error);
        return window.localStorage.getItem(key);
      }
    },
    async setItem(key: string, value: string) {
      window.localStorage.setItem(key, value);
    },
    async removeItem(key: string) {
      window.localStorage.removeItem(key);
    },
  };
}
