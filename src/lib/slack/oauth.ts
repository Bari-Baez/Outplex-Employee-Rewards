const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access';
const SLACK_OPENID_TOKEN_URL = 'https://slack.com/api/openid.connect.token';

export const SLACK_SCOPES = 'openid profile email';

export interface SlackWorkspaceInfo {
  teamId: string;
  teamName: string;
  teamDomain: string;
  teamIcon?: string;
}

export interface SlackUserIdentity {
  userId: string;
  name: string;
  email: string;
  picture?: string;
  teamId: string;
}

/** Generates the Slack OAuth authorization URL for sign-in with OIDC. */
export function getSlackAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SLACK_SCOPES,
    state,
  });
  return `https://slack.com/openid/connect/authorize?${params}`;
}

/** Exchanges an OIDC code for tokens using openid.connect.token. */
export async function exchangeOIDCCode(
  code: string,
  redirectUri: string
): Promise<{ access_token: string; id_token?: string; refresh_token?: string }> {
  const res = await fetch(SLACK_OPENID_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json() as { ok: boolean; access_token?: string; id_token?: string; refresh_token?: string; error?: string };
  if (!data.ok) throw new Error(`Slack OIDC token exchange failed: ${data.error}`);
  return {
    access_token: data.access_token!,
    id_token: data.id_token,
    refresh_token: data.refresh_token,
  };
}

/** Gets the identity of the authenticated user from a Slack OIDC token. */
export async function getSlackUserIdentity(accessToken: string): Promise<SlackUserIdentity> {
  const res = await fetch('https://slack.com/api/openid.connect.userInfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json() as {
    ok: boolean;
    sub?: string;
    name?: string;
    email?: string;
    picture?: string;
    'https://slack.com/team_id'?: string;
    error?: string;
  };
  if (!data.ok) throw new Error(`Failed to get Slack user identity: ${data.error}`);
  return {
    userId: data.sub ?? '',
    name: data.name ?? '',
    email: data.email ?? '',
    picture: data.picture,
    teamId: data['https://slack.com/team_id'] ?? '',
  };
}

/**
 * Verifies the bot token and returns workspace info.
 * Used to confirm the Slack integration is active.
 * Falls back to USER_TOKEN if BOT_TOKEN is not configured.
 */
export async function getWorkspaceInfo(): Promise<SlackWorkspaceInfo | null> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const userToken = process.env.SLACK_USER_TOKEN;
  
  const token = (botToken && botToken !== 'PENDIENTE' && botToken !== 'PLACEHOLDER')
    ? botToken
    : (userToken && userToken !== 'PENDIENTE' && userToken !== 'PLACEHOLDER' ? userToken : null);

  if (!token) return null;

  try {
    const res = await fetch('https://slack.com/api/auth.test', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json() as {
      ok: boolean;
      team_id?: string;
      team?: string;
      url?: string;
      error?: string;
    };
    if (!data.ok) {
      console.warn('[Slack] auth.test failed:', data.error);
      return null;
    }

    // Get full team info for icon
    const teamRes = await fetch(`https://slack.com/api/team.info?team=${data.team_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const teamData = await teamRes.json() as {
      ok: boolean;
      team?: { id: string; name: string; domain: string; icon?: { image_68?: string } };
    };

    const teamName = teamData.team?.name ?? data.team ?? '';
    const teamDomain = teamData.team?.domain ?? (data.url?.replace('https://', '').replace('.slack.com/', '') ?? '');

    return {
      teamId: data.team_id ?? '',
      teamName,
      teamDomain,
      teamIcon: teamData.team?.icon?.image_68,
    };
  } catch (error) {
    console.error('[Slack] Workspace info fetch failed:', error);
    return null;
  }
}

/**
 * Refreshes a Slack user token using the OIDC refresh token flow.
 * Note: Slack user tokens from OIDC expire and need periodic refresh.
 */
export async function refreshSlackToken(
  refreshToken: string
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const res = await fetch(SLACK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json() as {
    ok: boolean;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!data.ok) throw new Error(`Slack token refresh failed: ${data.error}`);
  return {
    access_token: data.access_token!,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
  };
}

/**
 * Fetches the full user profile including custom fields using the bot token.
 * Requires users.profile:read scope for the bot.
 */
export async function getSlackUserProfile(userId: string) {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const userToken = process.env.SLACK_USER_TOKEN;
  
  const token = (botToken && botToken !== 'PENDIENTE' && botToken !== 'PLACEHOLDER')
    ? botToken
    : (userToken && userToken !== 'PENDIENTE' && userToken !== 'PLACEHOLDER' ? userToken : null);

  if (!token) return null;

  const res = await fetch(`https://slack.com/api/users.profile.get?user=${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json() as {
    ok: boolean;
    profile?: {
      real_name?: string;
      email?: string;
      fields?: Record<string, { value: string; alt: string }>;
    };
    error?: string;
  };

  if (!data.ok) {
    console.error(`Slack profile fetch failed for ${userId}:`, data.error);
    return null;
  }
  return data.profile;
}

/**
 * Fetches the workspace's profile field definitions.
 * Useful for mapping "Employee ID" labels to field IDs.
 */
export async function getSlackTeamProfile() {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const userToken = process.env.SLACK_USER_TOKEN;
  
  const token = (botToken && botToken !== 'PENDIENTE' && botToken !== 'PLACEHOLDER')
    ? botToken
    : (userToken && userToken !== 'PENDIENTE' && userToken !== 'PLACEHOLDER' ? userToken : null);

  if (!token) return null;

  const res = await fetch('https://slack.com/api/team.profile.get', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json() as {
    ok: boolean;
    profile?: {
      fields: Array<{ id: string; label: string; [key: string]: unknown }>;
    };
    error?: string;
  };

  if (!data.ok) {
    console.error('Slack team profile fetch failed:', data.error);
    return null;
  }
  return data.profile;
}
