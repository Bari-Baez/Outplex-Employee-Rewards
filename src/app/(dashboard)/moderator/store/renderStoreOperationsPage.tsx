import {
  getStoreItemMetaKey,
  mergeOrdersWithMeta,
  mergeItemsWithMeta,
  normalizeStoreThemeConfig,
  STORE_ORDER_META_PREFIX,
  STORE_THEME_KEY,
} from '@/lib/store-helpers';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ModeratorStoreClient, type ModeratorStoreOrder } from './ModeratorStoreClient';

export type StoreOperationsTab = 'orders' | 'inventory' | 'settings' | 'analytics' | 'recycle_bin';

export async function renderStoreOperationsPage({
  searchParams,
  initialTab,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  initialTab: StoreOperationsTab;
}) {
  const supabase = await createClient();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Single-row fetch; keep `select('*')` to satisfy `User` typing in the client.
  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single();
  if (!profile || !['moderator', 'moderator_a1', 'moderator_b1', 'admin'].includes(profile.role)) redirect('/dashboard');

  const itemsLimitRaw = Array.isArray(resolvedSearchParams.itemsLimit) ? resolvedSearchParams.itemsLimit[0] : resolvedSearchParams.itemsLimit;
  const ordersLimitRaw = Array.isArray(resolvedSearchParams.ordersLimit) ? resolvedSearchParams.ordersLimit[0] : resolvedSearchParams.ordersLimit;
  const itemsLimit = Math.min(Math.max(Number(itemsLimitRaw ?? 300) || 300, 50), 1000);
  const ordersLimit = Math.min(Math.max(Number(ordersLimitRaw ?? 300) || 300, 50), 1000);

  const serviceClient = await createServiceClient();
  const [{ data: items }, { data: orders }, { data: currentTheme }] = await Promise.all([
    serviceClient
      .from('store_items')
      .select('id, name, description, points_cost, image_url, stock, is_active, created_at')
      .order('created_at', { ascending: false })
      .limit(itemsLimit),
    serviceClient
      .from('store_orders')
      .select('id, item_id, user_id, points_spent, status, created_at, item:store_items(id, name, description, points_cost, image_url, stock, is_active, created_at), user:users!store_orders_user_id_fkey(id, name, employee_id, email, supervisor, supervisor_id)')
      .order('created_at', { ascending: false })
      .limit(ordersLimit),
    supabase.from('app_settings').select('value').eq('key', STORE_THEME_KEY).maybeSingle(),
  ]);

  const orderIds = (orders ?? []).map((order) => order.id);
  const itemIds = (items ?? []).map((item) => item.id);
  let reviewSummary: Record<string, { avg: number; count: number }> = {};
  try {
    if (itemIds.length > 0) {
      const { data: reviews, error } = await serviceClient
        .from('store_reviews')
        .select('item_id, rating')
        .in('item_id', itemIds);
      if (error) throw error;

      for (const row of reviews ?? []) {
        const itemId = row.item_id as string;
        const rating = Number(row.rating);
        if (!reviewSummary[itemId]) reviewSummary[itemId] = { avg: 0, count: 0 };
        reviewSummary[itemId].count += 1;
        reviewSummary[itemId].avg += rating;
      }
      for (const itemId of Object.keys(reviewSummary)) {
        reviewSummary[itemId].avg = reviewSummary[itemId].avg / Math.max(1, reviewSummary[itemId].count);
      }
    }
  } catch (err) {
    console.error('Error fetching store review summary:', err);
    reviewSummary = {};
  }

  const { data: orderSettings } =
    orderIds.length > 0
      ? await serviceClient
          .from('app_settings')
          .select('key, value')
          .in(
            'key',
            orderIds.map((orderId) => `${STORE_ORDER_META_PREFIX}${orderId}`),
          )
      : { data: [] };
  const { data: itemSettings } =
    itemIds.length > 0
      ? await serviceClient
          .from('app_settings')
          .select('key, value')
          .in('key', itemIds.map((itemId) => getStoreItemMetaKey(itemId)))
      : { data: [] };

  return (
    <ModeratorStoreClient
      currentUser={profile}
      initialItems={mergeItemsWithMeta(items || [], itemSettings || [])}
      initialOrders={
        mergeOrdersWithMeta((orders || []) as unknown as ModeratorStoreOrder[], orderSettings || [])
          .filter((order) => !order.meta?.hiddenFromModerators) as ModeratorStoreOrder[]
      }
      initialTheme={normalizeStoreThemeConfig(currentTheme?.value)}
      initialTab={initialTab}
      initialShowLowStock={resolvedSearchParams.lowStock === '1'}
      reviewSummary={reviewSummary}
    />
  );
}

