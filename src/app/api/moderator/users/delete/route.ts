import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: actor } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (!actor || actor.role !== 'admin') {
      return NextResponse.json({ error: 'Only IT Admin can permanently delete users.' }, { status: 403 });
    }

    const { userId } = await req.json() as { userId: string };
    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    if (userId === user.id) return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });

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

    // Delete from public.users first (CASCADE will handle related records)
    const { error: profileError } = await service.from('users').delete().eq('id', userId);
    if (profileError) throw profileError;

    // Delete from auth.users
    const { error: authError } = await service.auth.admin.deleteUser(userId);
    if (authError) {
      console.error('Auth delete failed (profile was already removed):', authError.message);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete user';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
