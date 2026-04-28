import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import {
  executePresentationAction,
  loadPresentationStatus,
} from '@/lib/demo-presentation';

async function requireAdmin() {
  const supabase = await createClient();
  const serviceClient = await createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { data: profile, error } = await serviceClient
    .from('users')
    .select('id, name, role')
    .eq('id', user.id)
    .single();

  if (error || !profile || profile.role !== 'admin') {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    actor: profile,
    serviceClient,
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) {
    return auth.error;
  }

  try {
    const status = await loadPresentationStatus(auth.serviceClient);
    return NextResponse.json({ data: status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load demo tools.' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) {
    return auth.error;
  }

  try {
    const body = (await request.json()) as {
      action?: 'ensureUsers' | 'resetDemo' | 'seedDemo' | 'resetAndSeed' | 'setPoints';
      userId?: string;
      amount?: number;
      mode?: 'set' | 'adjust';
      reason?: string;
    };

    if (!body.action) {
      return NextResponse.json({ error: 'No demo action was provided.' }, { status: 400 });
    }

    const result = await executePresentationAction(auth.serviceClient, {
      action: body.action,
      actor: auth.actor,
      userId: body.userId,
      amount: body.amount,
      mode: body.mode,
      reason: body.reason,
    });

    return NextResponse.json({
      data: result.status,
      message: result.message,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to execute the demo action.' },
      { status: 500 },
    );
  }
}
