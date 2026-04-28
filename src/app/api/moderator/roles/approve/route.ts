import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/database';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: actor } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (!actor || !['admin', 'moderator_a1'].includes(actor.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { requestId, role, department, decision, notes } = await req.json() as {
      requestId: string;
      role?: UserRole;
      department?: string;
      decision?: 'approved' | 'rejected';
      notes?: string | null;
    };

    const normalizedDecision = decision ?? 'approved';

    if (!requestId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (normalizedDecision === 'approved' && (!role || !department)) {
      return NextResponse.json({ error: 'Role and department are required to approve this request.' }, { status: 400 });
    }

    if (normalizedDecision === 'rejected' && !notes?.trim()) {
      return NextResponse.json({ error: 'A rejection reason is required.' }, { status: 400 });
    }

    if (role && actor.role === 'moderator_a1' && role === 'admin') {
      return NextResponse.json({ error: 'Moderator A1 cannot assign the Admin role.' }, { status: 403 });
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

    const { data: roleRequest } = await service
      .from('role_requests')
      .select('user_id, status')
      .eq('id', requestId)
      .single();

    if (!roleRequest) return NextResponse.json({ error: 'Role request not found' }, { status: 404 });
    if (roleRequest.status !== 'pending') return NextResponse.json({ error: 'Request is not pending' }, { status: 400 });

    if (normalizedDecision === 'approved') {
      const { error: userError } = await service
        .from('users')
        .update({ role, department })
        .eq('id', roleRequest.user_id);

      if (userError) throw userError;
    }

    const { error: requestError } = await service
      .from('role_requests')
      .update({ status: normalizedDecision, notes: notes?.trim() || null })
      .eq('id', requestId);

    if (requestError) throw requestError;

    await service.from('points_ledger').insert({
      user_id: roleRequest.user_id,
      granted_by: user.id,
      points_added: 0,
      reason:
        normalizedDecision === 'approved'
          ? `Role request approved: ${role} | Department: ${department}`
          : `Role request rejected${notes?.trim() ? `: ${notes.trim()}` : ''}`,
    });

    await service.from('notifications').insert({
      user_id: roleRequest.user_id,
      title: normalizedDecision === 'approved' ? 'Special role approved' : 'Special role denied',
      message:
        normalizedDecision === 'approved'
          ? `Your special role request was approved. Assigned role: ${role}. Department: ${department}.`
          : `Your special role request was denied.${notes?.trim() ? ` Reason: ${notes.trim()}` : ''}`,
      type: 'system',
      is_read: false,
    });

    return NextResponse.json({ success: true, decision: normalizedDecision });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to approve role request';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
