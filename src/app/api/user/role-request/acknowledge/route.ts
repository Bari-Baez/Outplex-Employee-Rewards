import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = await createServiceClient();

    const { error } = await service
      .from('users')
      .update({ is_approved: true })
      .eq('id', user.id);

    if (error) throw error;

    // Remove the approved role_request so the onboarding modal
    // never shows again on subsequent logins.
    await service
      .from('role_requests')
      .delete()
      .eq('user_id', user.id)
      .eq('status', 'approved');

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to acknowledge approval';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
