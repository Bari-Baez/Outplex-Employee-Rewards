import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || !['moderator', 'moderator_a1', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = await createServiceClient();
  const maintenance = await enforceSectionAvailability({
    serviceClient: service,
    toolKey: 'employee_stores',
    sectionKey: 'main',
    userRole: profile.role as string,
    bypassForAdmin: true,
  });
  if (maintenance) {
    return maintenance;
  }

  const { data: requests } = await service
    .from('employee_store_requests')
    .select(`
      id, store_name, description, category, status, review_notes, reviewed_at, reviewed_by, created_at, user_id,
      user:users!employee_store_requests_user_id_fkey(id, name, email, employee_id, avatar_url),
      reviewer:users!employee_store_requests_reviewed_by_fkey(id, name)
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  const { data: stores } = await service
    .from('employee_stores')
    .select(`
      id, owner_id, slug, name, description, category, banner_image, logo_image, accent_color, status, approved_at, created_at,
      owner:users!employee_stores_owner_id_fkey(id, name, email, avatar_url, slack_id)
    `)
    .order('approved_at', { ascending: false })
    .limit(500);

  return NextResponse.json({ requests: requests ?? [], stores: stores ?? [] });
}
