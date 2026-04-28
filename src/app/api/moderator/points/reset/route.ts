import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';

function chunk<T>(items: T[], size: number) {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as { confirm?: string; reason?: string };
    const confirm = typeof payload.confirm === 'string' ? payload.confirm.trim() : '';
    const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';

    if (confirm !== 'RESET') {
      return NextResponse.json({ error: 'Confirmation text must be RESET.' }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: actor, error: actorError } = await supabase
      .from('users')
      .select('id, name, role')
      .eq('id', user.id)
      .single();

    if (actorError || !actor || !['admin', 'moderator', 'moderator_a1'].includes(actor.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const service = await createServiceClient();
    const maintenance = await enforceSectionAvailability({
      serviceClient: service,
      toolKey: 'employees',
      sectionKey: 'main',
      userRole: actor.role as string,
      bypassForAdmin: true,
    });
    if (maintenance) {
      return maintenance;
    }

    const { data: users, error: usersError } = await service
      .from('users')
      .select('id, points');

    if (usersError) {
      throw usersError;
    }

    const targets = (users ?? []).filter((u) => Number(u.points ?? 0) !== 0);

    // 1) Update all non-zero balances to 0 in one statement.
    const { error: updateError } = await service.from('users').update({ points: 0 }).neq('points', 0);
    if (updateError) {
      throw updateError;
    }

    // 2) Audit trail (ledger) + optional user notifications (kept lightweight).
    const ledgerRows = targets.map((u) => ({
      user_id: u.id,
      points_added: -Number(u.points ?? 0),
      granted_by: actor.id,
      reason: `${reason || 'Global reset'} (${Number(u.points ?? 0)} -> 0)`,
    }));

    for (const batch of chunk(ledgerRows, 500)) {
      const { error: ledgerError } = await service.from('points_ledger').insert(batch);
      if (ledgerError) {
        throw ledgerError;
      }
    }

    return NextResponse.json({ success: true, resetCount: targets.length });
  } catch (error) {
    console.error('Error resetting points:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 },
    );
  }
}
