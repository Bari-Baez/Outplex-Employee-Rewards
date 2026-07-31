import { NextResponse } from 'next/server';
import {
  getStoreOrderMetaKey,
  isModeratorOrderDeleteEligible,
  parseStoreOrderMeta,
  RECENT_ORDER_HISTORY_WINDOW_DAYS,
} from '@backend/modules/store/domain/catalog';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import { enforceSectionAvailability } from '@backend/modules/shell/application/section-guard';

async function getAuthorizedModerator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('id, role')
    .eq('id', user.id)
    .single();

  if (!profile || !['moderator', 'moderator_a1', 'moderator_b1', 'admin'].includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user, profile };
}

export async function DELETE() {
  try {
    const auth = await getAuthorizedModerator();
    if (auth.error) {
      return auth.error;
    }

    const serviceClient = await createServiceClient();
    const maintenance = await enforceSectionAvailability({
      serviceClient: serviceClient,
      toolKey: 'store_operations',
      sectionKey: 'orders',
      userRole: auth.profile.role as string,
      bypassForAdmin: true,
    });
    if (maintenance) {
      return maintenance;
    }
    const cutoff = new Date(Date.now() - RECENT_ORDER_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: recentOrders, error: recentOrdersError } = await serviceClient
      .from('store_orders')
      .select('id, status, created_at')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false });

    if (recentOrdersError) {
      throw recentOrdersError;
    }

    const candidateOrders = (recentOrders ?? []).filter((order) => isModeratorOrderDeleteEligible(order));
    const metaKeys = candidateOrders.map((order) => getStoreOrderMetaKey(order.id));
    const { data: metaSettings, error: metaSettingsError } =
      metaKeys.length > 0
        ? await serviceClient.from('app_settings').select('key, value').in('key', metaKeys)
        : { data: [], error: null };

    if (metaSettingsError) {
      throw metaSettingsError;
    }

    const metaMap = new Map((metaSettings ?? []).map((setting) => [setting.key, parseStoreOrderMeta(setting.value)]));

    const upserts = candidateOrders
      .filter((order) => !metaMap.get(getStoreOrderMetaKey(order.id))?.hiddenFromModerators)
      .map((order) => {
        const existingMeta = metaMap.get(getStoreOrderMetaKey(order.id));
        return {
          key: getStoreOrderMetaKey(order.id),
          value: {
            ...(existingMeta ?? {
              quantity: 1,
              unitPoints: 0,
              itemName: 'Store Item',
              itemImageUrl: null,
              itemDescription: null,
              lineItems: [],
              buyerName: null,
              buyerEmail: null,
              buyerEmployeeId: null,
              orderLabel: null,
              pickupMode: null,
              pickupDate: null,
              pickupTime: null,
              pickupDeadline: null,
              pickupNote: null,
              denialReason: null,
              hiddenFromModerators: false,
              moderatorArchivedAt: null,
              statusHistory: [],
            }),
            hiddenFromModerators: true,
            moderatorArchivedAt: new Date().toISOString(),
          },
        };
      });

    if (upserts.length === 0) {
      return NextResponse.json({ success: true, deletedCount: 0 });
    }

    const { error: upsertError } = await serviceClient.from('app_settings').upsert(upserts, { onConflict: 'key' });
    if (upsertError) {
      throw upsertError;
    }

    return NextResponse.json({ success: true, deletedCount: upserts.length });
  } catch (error) {
    console.error('Error clearing recent order history:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 },
    );
  }
}
