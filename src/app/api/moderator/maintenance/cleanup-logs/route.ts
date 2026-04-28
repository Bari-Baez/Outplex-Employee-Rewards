import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const supabase = await createClient();
    // Check if user is at least moderator
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'moderator_a1', 'moderator_b1'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 0 }); // Status 403 usually but status 0 for "Forbidden" in some contexts or just 403
    }

    // Dates calculation
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyIso = thirtyDaysAgo.toISOString();

    const twentyDaysAgo = new Date();
    twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);
    const twentyIso = twentyDaysAgo.toISOString();

    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    const fifteenIso = fifteenDaysAgo.toISOString();

    // 1. Purge Activity Logs (30 days)
    const { error: errLogs } = await supabase
      .from('activity_logs')
      .delete()
      .lt('created_at', thirtyIso);

    // 2. Purge Order History (30 days - Both stores)
    const { error: errOrdersP } = await supabase
      .from('store_orders')
      .delete()
      .lt('created_at', thirtyIso);

    const { error: errOrdersE } = await supabase
      .from('employee_store_orders')
      .delete()
      .lt('created_at', thirtyIso);

    // 3. Purge Raffles (20 days - Completed only)
    const { error: errRaffles } = await supabase
      .from('raffles')
      .delete()
      .eq('status', 'completed')
      .lt('draw_date', twentyIso);

    // 4. Purge Store Requests (15 days - Non-pending)
    const { error: errRequests } = await supabase
      .from('employee_store_requests')
      .delete()
      .neq('status', 'pending')
      .lt('reviewed_at', fifteenIso);

    if (errLogs || errOrdersP || errOrdersE || errRaffles || errRequests) {
      console.error('Maintenance partial failure:', { errLogs, errOrdersP, errOrdersE, errRaffles, errRequests });
    }

    return NextResponse.json({ 
      message: 'Maintenance completed: logs, orders, raffles and requests purged.',
      purged: {
        logs: thirtyIso,
        orders: thirtyIso,
        raffles: twentyIso,
        requests: fifteenIso
      }
    });
  } catch (error) {
    console.error('Maintenance error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
