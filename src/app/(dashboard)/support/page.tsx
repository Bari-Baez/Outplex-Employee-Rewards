import { redirect } from 'next/navigation';
import { createClient } from '@backend/platform/supabase/server';
import { SupportCenterClient } from '@frontend/modules/support/ui/SupportCenterClient';
import type { Metadata } from 'next';
import type { SupportTicket, UserRole } from '@shared/contracts/database';

export const metadata: Metadata = { title: 'Support Center' };
const SUPPORT_TICKET_SELECT = 'id,user_id,department,subject,message,status,created_at';

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
    .select(SUPPORT_TICKET_SELECT)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  let queueTickets: QueueTicket[] = [];

  if (role === 'moderator_a1' || role === 'moderator_b1' || role === 'admin') {
    const department = role === 'admin' ? 'it' : 'moderator';
    const { data } = await supabase
      .from('support_tickets')
      .select(`${SUPPORT_TICKET_SELECT}, user:users(name, email, employee_id)`)
      .eq('department', department)
      .order('created_at', { ascending: false });

    queueTickets = (data ?? []).map((ticket) => ({
      ...ticket,
      user: Array.isArray(ticket.user) ? (ticket.user[0] ?? null) : (ticket.user ?? null),
    })) as QueueTicket[];
  }

  return (
    <SupportCenterClient
      role={role}
      myTickets={(myTickets ?? []) as SupportTicket[]}
      queueTickets={queueTickets}
    />
  );
}
