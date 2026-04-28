import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { UsersManagerClient } from './UsersManagerClient';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Employees' };

export default async function ModeratorUsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [{ data: profile }, { data: employees }, { data: ledger }, { data: roleRequests }] = await Promise.all([
    supabase.from('users').select('*').eq('id', user.id).single(),
    supabase
      .from('users')
      .select('id, name, email, employee_id, role, points, department, supervisor, supervisor_id, avatar_url, created_at, is_approved')
      .order('name', { ascending: true }),
    supabase
      .from('points_ledger')
      .select('id, user_id, granted_by, points_added, reason, created_at')
      .order('created_at', { ascending: false })
      .limit(120),
    supabase
      .from('role_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  ]);

  if (!profile || !['moderator', 'moderator_a1', 'moderator_b1', 'admin'].includes(profile.role)) {
    redirect('/dashboard');
  }

  const userMap = new Map((employees ?? []).map((entry) => [entry.id, entry]));
  const normalizedLedger = (ledger ?? []).map((entry) => ({
    ...entry,
    user: userMap.get(entry.user_id) ?? null,
    actor: entry.granted_by ? userMap.get(entry.granted_by) ?? null : null,
  }));

  const normalizedRoleRequests = (roleRequests ?? []).map(req => ({
    ...req,
    user: userMap.get(req.user_id) ?? null
  }));

  return (
    <UsersManagerClient
      currentUser={profile}
      initialEmployees={employees ?? []}
      initialLedger={normalizedLedger}
      initialRoleRequests={normalizedRoleRequests}
    />
  );
}
