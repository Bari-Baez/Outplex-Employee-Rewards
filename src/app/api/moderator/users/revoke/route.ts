import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
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

    const { userId } = await req.json() as { userId: string };
    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

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

    const { data: target } = await service.from('users').select('role, name').eq('id', userId).single();
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // A1 cannot revoke IT admins
    if (actor.role === 'moderator_a1' && target.role === 'admin') {
      return NextResponse.json({ error: 'Moderator A1 cannot revoke IT Admin accounts.' }, { status: 403 });
    }
    // Cannot self-revoke
    if (userId === user.id) {
      return NextResponse.json({ error: 'You cannot revoke your own role.' }, { status: 400 });
    }

    const prevRole = target.role;

    const { error } = await service
      .from('users')
      .update({
        role: 'employee',
        department: null,
        is_approved: false,
        role_revoked_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error('[Revoke] Update error:', error);
      throw error;
    }

    // Delete from the correct table name
    const { error: deleteError } = await service.from('role_requests').delete().eq('user_id', userId);
    if (deleteError) {
      console.warn('[Revoke] Role request deletion error (may be empty):', deleteError);
    }

    // Log revocation
    const { error: ledgerError } = await service.from('points_ledger').insert({
      user_id: userId,
      granted_by: user.id,
      points_added: 0,
      reason: `Role revoked: ${prevRole} → employee`,
    });

    if (ledgerError) {
      console.error('[Revoke] Ledger error:', ledgerError);
      // We don't throw here to ensure the role stays revoked even if logging fails
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Revoke] Fatal error:', error);
    const message = error instanceof Error ? error.message : 'Failed to revoke role';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
