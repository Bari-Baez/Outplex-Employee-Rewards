import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getGoogleAuthUrl } from '@/lib/google/oauth';
import { randomUUID } from 'crypto';

const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Only moderator_a1 and admin (TI) can connect Google accounts
  const serviceClient = await createServiceClient();
  const { data: profile } = await serviceClient.from('users').select('role').eq('id', user.id).single();
  if (!profile || !['moderator_a1', 'admin'].includes(profile.role as string)) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    return NextResponse.redirect(`${appUrl}/settings?google=forbidden`);
  }

  // Generate a CSRF nonce bound to this user and persist it server-side.
  // The callback validates the nonce before using the associated userId.
  const nonce = randomUUID();
  const expiresAt = Date.now() + NONCE_TTL_MS;
  await serviceClient.from('app_settings').upsert({
    key: `google_oauth_nonce:${nonce}`,
    value: JSON.stringify({ userId: user.id, expiresAt }),
  }, { onConflict: 'key' });

  const state = Buffer.from(nonce).toString('base64url');
  const url = getGoogleAuthUrl(state);
  return NextResponse.redirect(url);
}
