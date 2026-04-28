import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';

interface AssignmentPayload {
  identifier: string;
  points: number;
}

interface UpdatePayload {
  userId: string;
  points: number;
  reason?: string;
}

function formatDelta(delta: number) {
  return `${delta >= 0 ? '+' : '-'}${Math.abs(delta)} pts`;
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as {
      assignments?: AssignmentPayload[];
      updates?: UpdatePayload[];
      reason?: string;
    };

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

    if (
      actorError ||
      !actor ||
      !['admin', 'moderator', 'moderator_a1'].includes(actor.role)
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const serviceClient = await createServiceClient();
    const maintenance = await enforceSectionAvailability({
      serviceClient: serviceClient,
      toolKey: 'employees',
      sectionKey: 'main',
      userRole: actor.role as string,
      bypassForAdmin: true,
    });
    if (maintenance) {
      return maintenance;
    }

    const { data: users, error: userError } = await serviceClient
      .from('users')
      .select('id, name, email, employee_id, points');

    if (userError) {
      throw userError;
    }

    const userMap = new Map(users.map((entry) => [entry.id, entry]));
    const emailMap = new Map(users.map((entry) => [String(entry.email ?? '').trim().toLowerCase(), entry]));
    const employeeMap = new Map(users.map((entry) => [String(entry.employee_id ?? '').trim().toLowerCase(), entry]));

    const updates = Array.isArray(payload.updates) ? payload.updates : [];
    const assignments = Array.isArray(payload.assignments) ? payload.assignments : [];

    if (updates.length === 0 && assignments.length === 0) {
      return NextResponse.json({ error: 'No point changes were provided.' }, { status: 400 });
    }

    const desiredByUserId = new Map<string, { points: number; reason: string }>();

    updates.forEach((entry) => {
      if (!entry.userId || !Number.isFinite(Number(entry.points))) {
        return;
      }

      const nextPoints = Math.max(0, Math.round(Number(entry.points)));
      desiredByUserId.set(entry.userId, {
        points: nextPoints,
        reason: entry.reason?.trim() || 'Manual balance update',
      });
    });

    assignments.forEach((entry) => {
      const identifier = String(entry.identifier ?? '').trim().toLowerCase();
      const delta = Math.round(Number(entry.points));
      if (!identifier || !Number.isFinite(delta) || delta === 0) {
        return;
      }

      const matchedUser =
        employeeMap.get(identifier) ||
        emailMap.get(identifier) ||
        userMap.get(identifier);

      if (!matchedUser) {
        return;
      }

      const existing = desiredByUserId.get(matchedUser.id);
      const basePoints = existing?.points ?? matchedUser.points;
      const nextPoints = Math.max(0, basePoints + delta);
      desiredByUserId.set(matchedUser.id, {
        points: nextPoints,
        reason: payload.reason?.trim() || 'Manual distribution',
      });
    });

    const ledgerRows: Array<{
      user_id: string;
      points_added: number;
      granted_by: string;
      reason: string;
    }> = [];
    const notificationRows: Array<{
      user_id: string;
      sender_id: string;
      title: string;
      message: string;
      type: 'system';
    }> = [];

    for (const [userId, change] of desiredByUserId.entries()) {
      const target = userMap.get(userId);
      if (!target) {
        continue;
      }

      const previousPoints = Number(target.points ?? 0);
      const nextPoints = Math.max(0, Math.round(change.points));
      const delta = nextPoints - previousPoints;

      if (delta === 0) {
        continue;
      }

      const { error: updateError } = await serviceClient
        .from('users')
        .update({ points: nextPoints })
        .eq('id', userId);

      if (updateError) {
        throw updateError;
      }

      userMap.set(userId, { ...target, points: nextPoints });
      ledgerRows.push({
        user_id: userId,
        points_added: delta,
        granted_by: actor.id,
        reason: `${change.reason} (${previousPoints} -> ${nextPoints})`,
      });
      notificationRows.push({
        user_id: userId,
        sender_id: actor.id,
        title: 'Points balance updated',
        message: `${actor.name} changed your points by ${formatDelta(delta)}. Your new balance is ${nextPoints} pts.`,
        type: 'system',
      });
    }

    if (ledgerRows.length > 0) {
      const { error: ledgerError } = await serviceClient.from('points_ledger').insert(ledgerRows);
      if (ledgerError) {
        throw ledgerError;
      }
    }

    if (notificationRows.length > 0) {
      const { error: notificationError } = await serviceClient.from('notifications').insert(notificationRows);
      if (notificationError) {
        throw notificationError;
      }
    }

    return NextResponse.json({
      success: true,
      updatedCount: ledgerRows.length,
    });
  } catch (error) {
    console.error('Error updating points:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 },
    );
  }
}
