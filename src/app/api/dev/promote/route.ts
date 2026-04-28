import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

const PLACEHOLDER_VALUES = new Set(['PENDIENTE', 'PLACEHOLDER', 'TODO', '']);

function getConfiguredToken(envValue: string | undefined): string | null {
  if (!envValue || PLACEHOLDER_VALUES.has(envValue.trim())) return null;
  return envValue;
}

function isPromoteAllowed() {
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.ALLOW_PUBLIC_DEMO_PROMOTE === 'true';
}

export async function POST(req: Request) {
  if (!isPromoteAllowed()) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  const configuredToken =
    getConfiguredToken(process.env.DEV_PROMOTE_TOKEN) ??
    getConfiguredToken(process.env.DEV_BOOTSTRAP_TOKEN);

  if (!configuredToken) {
    return NextResponse.json({ error: 'Promote token not configured.' }, { status: 403 });
  }

  const token = req.headers.get('x-dev-promote-token') ?? req.headers.get('x-dev-bootstrap-token') ?? '';
  if (token !== configuredToken) {
    return NextResponse.json({ error: 'Invalid token.' }, { status: 401 });
  }

  try {
    const { email, role } = await req.json();
    
    // Service role client to bypass RLS
    const supabaseAdmin = await createServiceClient();

    // Get user id by email from Auth
    const { data: { users }, error: userError } = await supabaseAdmin.auth.admin.listUsers();
    if (userError) throw userError;

    const authUser = users.find(u => u.email === email);
    if (authUser) {
      // Upsert into public.users — always approve demo accounts
      await supabaseAdmin.from('users').upsert({
        id: authUser.id,
        email: email,
        name: role.toUpperCase(),
        role: role,
        is_approved: role === 'admin',
      }, { onConflict: 'id' });
      return NextResponse.json({ success: true, updated: true });
    }

    return NextResponse.json({ success: true, updated: false, msg: 'User not found in auth.users' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to promote demo user';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
