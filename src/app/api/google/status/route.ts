import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ connected: false });

  const serviceClient = await createServiceClient();
  const { data } = await serviceClient
    .from('google_oauth_tokens')
    .select('google_email, updated_at')
    .eq('user_id', user.id)
    .single();

  if (!data) return NextResponse.json({ connected: false });
  return NextResponse.json({ connected: true, email: data.google_email, connectedAt: data.updated_at });
}

export async function DELETE(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const serviceClient = await createServiceClient();
  await serviceClient.from('google_oauth_tokens').delete().eq('user_id', user.id);
  return NextResponse.json({ ok: true });
}
