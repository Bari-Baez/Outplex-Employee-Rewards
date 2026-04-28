import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { EmployeeStoresQueueClient } from './EmployeeStoresQueueClient';

export const metadata: Metadata = { title: 'Employee Stores' };

export default async function ModeratorEmployeeStoresPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single();
  if (!profile || !['moderator', 'moderator_a1', 'moderator_b1', 'admin'].includes(profile.role)) redirect('/dashboard');

  const service = await createServiceClient();
  const [{ data: requests }, { data: stores }, { data: products }] = await Promise.all([
    service
      .from('employee_store_requests')
      .select(`
        id, store_name, description, category, status, review_notes, reviewed_at, reviewed_by, created_at, user_id,
        user:users!employee_store_requests_user_id_fkey(id, name, email, employee_id, avatar_url, supervisor, supervisor_id),
        reviewer:users!employee_store_requests_reviewed_by_fkey(id, name)
      `)
      .order('created_at', { ascending: false })
      .limit(200),
    service
      .from('employee_stores')
      .select(`
        id, owner_id, slug, name, description, category, banner_image, logo_image, accent_color, status, approved_at, created_at,
        owner:users!employee_stores_owner_id_fkey(id, name, email, avatar_url, slack_id, supervisor, supervisor_id)
      `)
      .order('approved_at', { ascending: false })
      .limit(500),
    service
      .from('employee_store_products')
      .select(`
        id, name, description, price_dop, image_url, status, created_at, store_id, is_active, is_suspended, suspend_reason,
        store:employee_stores(id, name, owner_id, owner:users!employee_stores_owner_id_fkey(id, name, supervisor, supervisor_id))
      `)
      .order('created_at', { ascending: false }),
  ]);

  return (
    <EmployeeStoresQueueClient
      currentUser={profile}
      initialRequests={(requests as unknown as Parameters<typeof EmployeeStoresQueueClient>[0]['initialRequests']) ?? []}
      initialStores={(stores as unknown as Parameters<typeof EmployeeStoresQueueClient>[0]['initialStores']) ?? []}
      initialProducts={(products as unknown as Parameters<typeof EmployeeStoresQueueClient>[0]['initialProducts']) ?? []}
    />
  );
}
