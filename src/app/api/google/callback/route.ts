import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@backend/platform/supabase/server';
import { exchangeCodeForTokens, getGoogleUserEmail } from '@backend/platform/integrations/google/oauth';
import { syncUserGoogleForms } from '@backend/modules/forms/infrastructure/google-forms';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Prefer the env var but fall back to the request's own origin so the
  // redirect always lands on the same host even if NEXT_PUBLIC_APP_URL is stale.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;

  if (error || !code || !state) {
    return NextResponse.redirect(`${appUrl}/settings?google=error`);
  }

  try {
    // Decode the nonce from state and validate it against the server-side record.
    // This prevents CSRF attacks where an attacker forges a state with an arbitrary userId.
    const nonce = Buffer.from(state, 'base64url').toString();
    const nonceKey = `google_oauth_nonce:${nonce}`;

    const serviceClient = await createServiceClient();
    const { data: nonceRow } = await serviceClient
      .from('app_settings')
      .select('value')
      .eq('key', nonceKey)
      .single();

    // Always delete the nonce to prevent replay attacks
    await serviceClient.from('app_settings').delete().eq('key', nonceKey);

    if (!nonceRow?.value) {
      return NextResponse.redirect(`${appUrl}/settings?google=error`);
    }

    const { userId, expiresAt } = JSON.parse(nonceRow.value as string) as {
      userId: string;
      expiresAt: number;
    };

    if (!userId || Date.now() > expiresAt) {
      return NextResponse.redirect(`${appUrl}/settings?google=error`);
    }

    const tokens = await exchangeCodeForTokens(code);
    const googleEmail = await getGoogleUserEmail(tokens.access_token);
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    await serviceClient.from('google_oauth_tokens').upsert({
      user_id: userId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_at: tokenExpiresAt,
      google_email: googleEmail,
    }, { onConflict: 'user_id' });

    // Background sync of recent forms
    try {
      await syncUserGoogleForms(serviceClient, userId, tokens.access_token);
    } catch (syncError) {
      console.error('Initial Google Forms sync failed:', syncError);
    }

    return NextResponse.redirect(`${appUrl}/settings?google=connected`);
  } catch {
    return NextResponse.redirect(`${appUrl}/settings?google=error`);
  }
}
