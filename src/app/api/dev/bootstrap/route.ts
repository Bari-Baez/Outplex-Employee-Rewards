import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ensurePresentationDemoUsers } from '@/lib/demo-presentation';

const PLACEHOLDER_VALUES = new Set(['PENDIENTE', 'PLACEHOLDER', 'TODO', '']);

function getConfiguredToken(envValue: string | undefined): string | null {
  if (!envValue || PLACEHOLDER_VALUES.has(envValue.trim())) return null;
  return envValue;
}

function isBootstrapAllowed() {
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.ALLOW_PUBLIC_DEMO_BOOTSTRAP === 'true';
}

export async function POST(request: Request) {
  if (!isBootstrapAllowed()) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  const configuredToken = getConfiguredToken(process.env.DEV_BOOTSTRAP_TOKEN);
  if (!configuredToken) {
    // No real token configured — block the route until one is set
    return NextResponse.json({ error: 'Bootstrap token not configured.' }, { status: 403 });
  }

  const token = request.headers.get('x-dev-bootstrap-token') ?? '';
  if (token !== configuredToken) {
    return NextResponse.json({ error: 'Invalid token.' }, { status: 401 });
  }

  try {
    const serviceClient = await createServiceClient();
    const users = await ensurePresentationDemoUsers(serviceClient);
    return NextResponse.json({ ok: true, users: users.map((u) => ({ id: u.id, email: u.email, role: u.role })) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to bootstrap demo users.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

