import { NextResponse } from 'next/server';
import { getStoreItemMetaKey } from '@/lib/store-helpers';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { isModeratorRole } from '@/lib/auth/roles';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';

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

export async function POST() {
  const auth = await getAuthorizedModerator();
  if (auth.error) {
    return auth.error;
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

  // Fetch all non-deleted item IDs to move them to the recycle bin
  const { data: items, error: fetchError } = await serviceClient
    .from('store_items')
    .select('id')
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  // Bulk deactivate all items
  const { error: updateError } = await serviceClient
    .from('store_items')
    .update({ is_active: false, stock: 0 })
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Move each item to the recycle bin by marking isDeleted in metadata
  if (items && items.length > 0) {
    const deletedAt = new Date().toISOString();
    const metaRows = items.map((item) => ({
      key: getStoreItemMetaKey(item.id),
      value: { isDeleted: true, deletedAt },
    }));

    await serviceClient
      .from('app_settings')
      .upsert(metaRows, { onConflict: 'key' });
  }

  return NextResponse.json({ success: true, erasedCount: items?.length ?? 0 });
}
