import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import { redirect } from 'next/navigation';
import { BreaksManagerClient } from '@frontend/modules/breaks/ui/BreaksManagerClient';
import type { User } from '@shared/contracts/database';

export const metadata = { title: 'Breaks Manager — Outplex' };

export default async function BreaksManagerPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  const allowedRoles = ['admin', 'moderator_a1', 'moderator_b1'];
  if (!profile || !allowedRoles.includes(profile.role)) redirect('/dashboard');

  const service = await createServiceClient();

  // Load last 30 batches
  const { data: batches } = await service
    .from('schedule_upload_batches')
    .select('*, uploader:users!uploaded_by ( id, name, avatar_url )')
    .order('created_at', { ascending: false })
    .limit(30);

  // Load all employees for manual entry / pending review assignment
  const { data: employees } = await service
    .from('users')
    .select('id, name, employee_id, department, supervisor, supervisor_id, avatar_url')
    .eq('role', 'employee')
    .eq('is_approved', true)
    .order('name', { ascending: true });

  return (
    <BreaksManagerClient
      currentUser={profile as User}
      initialBatches={batches ?? []}
      employees={employees ?? []}
    />
  );
}
