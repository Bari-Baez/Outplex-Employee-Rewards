import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { isModeratorRole } from '@/lib/auth/roles';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';

interface NotifyPayload {
  itemIds: string[];
  moderatorName?: string;
}

async function getAuthorizedModerator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || !isModeratorRole(profile.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user, role: profile.role as string };
}

export async function POST(req: Request) {
  const auth = await getAuthorizedModerator();
  if (auth.error) {
    return auth.error;
  }

  const payload = (await req.json()) as NotifyPayload;
  const { itemIds, moderatorName } = payload;

  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return NextResponse.json({ error: 'itemIds is required.' }, { status: 400 });
  }

  const serviceClient = await createServiceClient();
  const maintenance = await enforceSectionAvailability({
    serviceClient: serviceClient,
    toolKey: 'store_operations',
    sectionKey: 'inventory',
    userRole: auth.role,
    bypassForAdmin: true,
  });
  if (maintenance) {
    return maintenance;
  }

  // Fetch item names for the notification message
  const { data: items } = await serviceClient
    .from('store_items')
    .select('name')
    .in('id', itemIds);

  const itemNames = (items ?? []).map((i) => i.name);
  const namesLabel =
    itemNames.length <= 3
      ? itemNames.join(', ')
      : `${itemNames.slice(0, 2).join(', ')} y ${itemNames.length - 2} más`;

  const actor = moderatorName ?? 'A moderator';
  const title = 'Store restocked';
  const message = `${actor} added new stock for: ${namesLabel}. Visit the store to claim yours.`;

  // Fast path: RPC broadcast + count only (no huge payloads).
  const { count: employeeCount } = await serviceClient
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'employee');

  try {
    const { error } = await serviceClient.rpc('notify_users_by_role', {
      n_title: title,
      n_message: message,
      n_type: 'store',
      roles: ['employee'],
    });
    if (!error) {
      return NextResponse.json({ success: true, notifiedCount: employeeCount ?? 0 });
    }
  } catch {
    // ignore and fall back
  }

  // Fallback: fetch all employee IDs and insert in chunks
  const { data: employees } = await serviceClient
    .from('users')
    .select('id')
    .eq('role', 'employee');

  if (!employees || employees.length === 0) {
    return NextResponse.json({ success: true, notifiedCount: 0 });
  }

  const notifications = employees.map((emp) => ({ user_id: emp.id, title, message, type: 'store' as const }));
  const chunkSize = 500;
  for (let i = 0; i < notifications.length; i += chunkSize) {
    await serviceClient.from('notifications').insert(notifications.slice(i, i + chunkSize));
  }

  return NextResponse.json({ success: true, notifiedCount: employees.length });
}
