import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import type { UserRole } from '@shared/contracts/database';
import { enforceSectionAvailability } from '@backend/modules/shell/application/section-guard';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: actor } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (!actor || !['admin', 'moderator_a1'].includes(actor.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { userId, role, department, supervisor_id, is_approved, name, employee_id } = await req.json() as {
      userId: string;
      role: UserRole;
      department: string;
      supervisor_id: string | null;
      is_approved?: boolean;
      name?: string;
      employee_id?: string | null;
    };

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

    // Fetch target user to enforce IT > A1 hierarchy
    const { data: target } = await service.from('users').select('role').eq('id', userId).single();
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // A1 cannot modify admin (IT) users
    if (actor.role === 'moderator_a1' && target.role === 'admin') {
      return NextResponse.json({ error: 'Moderator A1 cannot modify IT Admin accounts.' }, { status: 403 });
    }
    // A1 cannot promote someone to admin
    if (actor.role === 'moderator_a1' && role === 'admin') {
      return NextResponse.json({ error: 'Moderator A1 cannot assign the Admin role.' }, { status: 403 });
    }
    // No actor can change their own role (privilege escalation prevention)
    if (userId === user.id && role !== actor.role) {
      return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 403 });
    }

    const prevRole = target.role;
    const { data: prevData } = await service.from('users').select('department').eq('id', userId).single();
    const prevDept = prevData?.department ?? null;

    const roleChanged = prevRole !== role;
    const nextDepartment = roleChanged ? null : department;
    const updatePayload: Record<string, unknown> = {
      role,
      department: nextDepartment,
      supervisor_id: supervisor_id ?? null,
    };
    if (typeof name === 'string' && name.trim()) updatePayload.name = name.trim();
    if (employee_id !== undefined) updatePayload.employee_id = employee_id ? String(employee_id).trim() : null;
    if (is_approved !== undefined) updatePayload.is_approved = is_approved;

    // If the role changed, force the user through acknowledgement + department selection again.
    if (roleChanged) {
      updatePayload.is_approved = false;
      updatePayload.role_revoked_at = new Date().toISOString();
      await service.from('role_requests').delete().eq('user_id', userId);
    }

    const { error } = await service
      .from('users')
      .update(updatePayload)
      .eq('id', userId);

    if (error) throw error;

    // Log role/dept change as zero-point ledger entry for audit trail
    const changes: string[] = [];
    if (prevRole !== role) changes.push(`Role: ${prevRole} → ${role}`);
    if (prevDept !== department) changes.push(`Department: ${prevDept ?? '(none)'} → ${department || '(none)'}`);

    if (roleChanged) {
      // Replace the log entry with an onboarding-focused audit trail.
      changes.length = 0;
      changes.push(`Role: ${prevRole} -> ${role}`);
      changes.push(`Department reset: ${prevDept ?? '(none)'} -> (none)`);
    }

    if (changes.length > 0) {
      await service.from('points_ledger').insert({
        user_id: userId,
        granted_by: user.id,
        points_added: 0,
        reason: changes.join(' | '),
      });
    }

    const { data: updatedUser } = await service
      .from('users')
      .select('id, name, employee_id, role, department, supervisor, supervisor_id, is_approved, role_revoked_at')
      .eq('id', userId)
      .single();

    return NextResponse.json({ success: true, user: updatedUser ?? null, roleChanged });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update user';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
