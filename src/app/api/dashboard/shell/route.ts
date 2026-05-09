import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCachedShellSharedSnapshot } from '@/lib/read-models/dashboard';
import type { Notification, SupportTicket, User } from '@/types/database';

type ShellNotification = Notification & {
  sender?: Pick<User, 'id' | 'name' | 'avatar_url' | 'role'> | null;
};

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [notificationResult, ticketResult, pointsResult, sharedSnapshot] = await Promise.all([
      (async () => {
        const withSender = await supabase
          .from('notifications')
          .select(
            'id,user_id,sender_id,broadcast_notification_id,title,message,is_read,type,created_at,sender:users!notifications_sender_id_fkey(id,name,avatar_url,role)',
          )
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20);

        if (!withSender.error) {
          return withSender;
        }

        return supabase
          .from('notifications')
          .select('id,user_id,sender_id,broadcast_notification_id,title,message,is_read,type,created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20);
      })(),
      supabase
        .from('support_tickets')
        .select('id,user_id,department,subject,message,status,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('users')
        .select('points')
        .eq('id', user.id)
        .maybeSingle(),
      getCachedShellSharedSnapshot(),
    ]);

    if (notificationResult.error) {
      throw new Error(notificationResult.error.message ?? 'Unable to load notifications.');
    }
    if (ticketResult.error) {
      throw new Error(ticketResult.error.message ?? 'Unable to load support tickets.');
    }
    if (pointsResult.error) {
      throw new Error(pointsResult.error.message ?? 'Unable to load user balance.');
    }

    const tickets = ((ticketResult.data ?? []) as SupportTicket[]).filter((ticket) => {
      if (ticket.status !== 'resolved') {
        return true;
      }

      return Date.now() - new Date(ticket.created_at).getTime() <= 5 * 24 * 60 * 60 * 1000;
    });

    return NextResponse.json({
      notifications: (notificationResult.data ?? []) as ShellNotification[],
      tickets,
      pointsBalance: Number(pointsResult.data?.points ?? 0),
      shared: sharedSnapshot,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load shell data.' },
      { status: 500 },
    );
  }
}
