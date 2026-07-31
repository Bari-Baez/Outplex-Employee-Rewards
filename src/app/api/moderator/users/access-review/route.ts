import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import { enforceSectionAvailability } from '@backend/modules/shell/application/section-guard';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: actor } = await supabase.from('users').select('id, role, name').eq('id', user.id).single();
    if (!actor || !['admin', 'moderator_a1'].includes(actor.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json() as {
      userId?: string;
      decision?: 'approved' | 'denied';
      reason?: string | null;
    };

    if (!body.userId || !body.decision) {
      return NextResponse.json({ error: 'userId and decision are required.' }, { status: 400 });
    }

    if (body.decision === 'denied' && !body.reason?.trim()) {
      return NextResponse.json({ error: 'A denial reason is required.' }, { status: 400 });
    }

    const service = await createServiceClient();
    const maintenance = await enforceSectionAvailability({
      serviceClient: service,
      toolKey: 'employees',
      sectionKey: 'main',
      userRole: actor.role as string,
      bypassForAdmin: true,
    });
    if (maintenance) return maintenance;

    const { data: target } = await service
      .from('users')
      .select('id, name, email, role')
      .eq('id', body.userId)
      .single();

    if (!target) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    if (actor.role === 'moderator_a1' && target.role === 'admin') {
      return NextResponse.json({ error: 'Moderator A1 cannot review IT Admin access.' }, { status: 403 });
    }

    const updatePayload =
      body.decision === 'approved'
        ? { is_approved: true, role_revoked_at: null }
        : { is_approved: false };

    const { error: updateError } = await service.from('users').update(updatePayload).eq('id', body.userId);
    if (updateError) throw updateError;

    await service.from('notifications').insert({
      user_id: body.userId,
      title: body.decision === 'approved' ? 'Platform access approved' : 'Platform access denied',
      message:
        body.decision === 'approved'
          ? `Your platform access was approved by ${actor.name}. Complete your onboarding form to continue.`
          : `Your platform access was denied by ${actor.name}. Reason: ${body.reason?.trim()}`,
      type: 'system',
      is_read: false,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to review access.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
