import 'server-only';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/forms.body.readonly',
  'https://www.googleapis.com/auth/forms.responses.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
].join(' ');

export function getGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json() as Promise<GoogleTokens>;
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  return res.json() as Promise<GoogleTokens>;
}

export async function getGoogleUserEmail(accessToken: string): Promise<string> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch Google user info');
  const data = await res.json() as { email?: string };
  return data.email ?? '';
}

/** Returns a valid access token, refreshing if expired. Updates DB row if refreshed. */
export async function getValidAccessToken(
  serviceClient: import('@supabase/supabase-js').SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await serviceClient
    .from('google_oauth_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .single();

  if (!data) return null;

  const expiresAt = new Date(data.expires_at as string).getTime();
  const nowMs = Date.now();

  // If token has more than 60s left, use it directly
  if (expiresAt - nowMs > 60_000) return data.access_token as string;

  // Refresh
  if (!data.refresh_token) return null;
  try {
    const tokens = await refreshAccessToken(data.refresh_token as string);
    const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    await serviceClient.from('google_oauth_tokens').update({
      access_token: tokens.access_token,
      expires_at: newExpiry,
    }).eq('user_id', userId);
    return tokens.access_token;
  } catch {
    return null;
  }
}
