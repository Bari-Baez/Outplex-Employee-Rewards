import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SupportCenterClient } from './SupportCenterClient';
import type { Metadata } from 'next';
import type { SupportTicket, UserRole } from '@/types/database';

export const metadata: Metadata = { title: 'Support Center' };

type QueueTicket = SupportTicket & {
  user?: {
    name?: string | null;
    email?: string | null;
    employee_id?: string | null;
  };
};

export default async function SupportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = (profile?.role ?? 'employee') as UserRole;

  const { data: myTickets } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  let queueTickets: QueueTicket[] = [];

  if (role === 'moderator_a1' || role === 'moderator_b1' || role === 'admin') {
    const department = role === 'admin' ? 'it' : 'moderator';
    const { data } = await supabase
      .from('support_tickets')
      .select('*, user:users(name, email, employee_id)')
      .eq('department', department)
      .order('created_at', { ascending: false });

    queueTickets = (data ?? []) as QueueTicket[];
  }

  return (
    <SupportCenterClient
      role={role}
      myTickets={(myTickets ?? []) as SupportTicket[]}
      queueTickets={queueTickets}
    />
  );
}
