import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/admin/users/logout
 * Force logout a specific user by revoking all their active sessions.
 * Restricted to users with the 'admin' role.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // 1. Verify requester session
    const { data: { user: requester }, error: authError } = await supabase.auth.getUser();
    if (authError || !requester) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Verify requester role (Must be admin/IT)
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', requester.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden. Admin privileges required.' }, { status: 403 });
    }

    // 3. Get target user ID
    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // 4. Force logout using Service Role Client
    const adminClient = await createServiceClient();
    const { error: signOutError } = await adminClient.auth.admin.signOut(userId);

    if (signOutError) {
      console.error('Logout error:', signOutError);
      return NextResponse.json({ error: signOutError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'User sessions revoked successfully.' });
  } catch (err) {
    console.error('Administrative logout error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to log out employee' },
      { status: 500 },
    );
  }
}
