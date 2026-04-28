import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * GET /api/onboarding/supervisors
 * Returns all users with role 'moderator_b1' for the Superior dropdown.
 * Public-ish endpoint — only used during first-login onboarding.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ supervisors: [], error: 'Unauthorized' }, { status: 401 });
    }

    const service = await createServiceClient();
    const { data, error } = await service
      .from('users')
      .select('id, name, email')
      .eq('role', 'moderator_b1')
      .order('name', { ascending: true });

    if (error) throw error;

    const supervisors = (data ?? []).map((entry) => ({
      id: entry.id,
      name: entry.name?.trim() || entry.email?.trim() || 'Supervisor',
    }));

    return NextResponse.json({ supervisors });
  } catch (err) {
    console.error('Failed to fetch supervisors:', err);
    return NextResponse.json(
      { supervisors: [], error: err instanceof Error ? err.message : 'Unable to load supervisors.' },
      { status: 500 },
    );
  }
}
