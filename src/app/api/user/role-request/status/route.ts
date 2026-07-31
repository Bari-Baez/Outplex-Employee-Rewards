import { createClient } from '@backend/platform/supabase/server';
import { NextResponse } from 'next/server';

/**
 * GET /api/user/role-request/status
 * Returns the current status of the user's active role request.
 * Status can be: pending | reviewing | approved | rejected
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: request, error } = await supabase
      .from('role_requests')
      .select('id, status, reviewed_at, requested_role, notes')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!request) {
      return NextResponse.json({ status: null });
    }

    return NextResponse.json({ status: request.status, request });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 });
  }
}
