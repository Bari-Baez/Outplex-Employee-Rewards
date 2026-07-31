import 'server-only';

import type {
  StoreItem,
  StoreOrder,
  StoreThemeConfig,
  User,
} from '@shared/contracts/database';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import {
  getStoreItemMetaKey,
  mergeItemsWithMeta,
  mergeOrdersWithMeta,
  normalizeStoreThemeConfig,
  STORE_ORDER_META_PREFIX,
  STORE_THEME_KEY,
} from '@backend/modules/store/domain/catalog';

export type StoreOperationsSearchParams = Record<string, string | string[] | undefined>;

export type StoreOperationsOrder = Omit<StoreOrder, 'item' | 'user'> & {
  item?: StoreItem;
  user?: Pick<
    User,
    'id' | 'name' | 'employee_id' | 'email' | 'supervisor' | 'supervisor_id'
  >;
};

export type StoreReviewSummary = Record<string, { avg: number; count: number }>;

export type StoreOperationsPageData = {
  currentUser: User;
  initialItems: StoreItem[];
  initialOrders: StoreOperationsOrder[];
  initialTheme: StoreThemeConfig;
  initialShowLowStock: boolean;
  reviewSummary: StoreReviewSummary;
};

export type StoreOperationsPageLoadResult =
  | { ok: false; redirectTo: '/login' | '/dashboard' }
  | { ok: true; data: StoreOperationsPageData };

export type LoadStoreOperationsPageInput = {
  searchParams?: StoreOperationsSearchParams | Promise<StoreOperationsSearchParams>;
};

export async function loadStoreOperationsPage(
  input: LoadStoreOperationsPageInput = {},
): Promise<StoreOperationsPageLoadResult> {
  const supabase = await createClient();
  const resolvedSearchParams = input.searchParams ? await input.searchParams : {};
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, redirectTo: '/login' };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single<User>();

  if (
    !profile ||
    !['moderator', 'moderator_a1', 'moderator_b1', 'admin'].includes(profile.role)
  ) {
    return { ok: false, redirectTo: '/dashboard' };
  }

  const itemsLimitRaw = Array.isArray(resolvedSearchParams.itemsLimit)
    ? resolvedSearchParams.itemsLimit[0]
    : resolvedSearchParams.itemsLimit;
  const ordersLimitRaw = Array.isArray(resolvedSearchParams.ordersLimit)
    ? resolvedSearchParams.ordersLimit[0]
    : resolvedSearchParams.ordersLimit;
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
      .select(
        'id, item_id, user_id, points_spent, status, created_at, item:store_items(id, name, description, points_cost, image_url, stock, is_active, created_at), user:users!store_orders_user_id_fkey(id, name, employee_id, email, supervisor, supervisor_id)',
      )
      .order('created_at', { ascending: false })
      .limit(ordersLimit),
    supabase.from('app_settings').select('value').eq('key', STORE_THEME_KEY).maybeSingle(),
  ]);

  const orderIds = (orders ?? []).map((order) => order.id);
  const itemIds = (items ?? []).map((item) => item.id);
  let reviewSummary: StoreReviewSummary = {};

  try {
    if (itemIds.length > 0) {
      const { data: reviews, error } = await serviceClient
        .from('store_reviews')
        .select('item_id, rating')
        .in('item_id', itemIds);

      if (error) {
        throw error;
      }

      for (const row of reviews ?? []) {
        const itemId = row.item_id as string;
        const rating = Number(row.rating);
        reviewSummary[itemId] ??= { avg: 0, count: 0 };
        reviewSummary[itemId].count += 1;
        reviewSummary[itemId].avg += rating;
      }

      for (const itemId of Object.keys(reviewSummary)) {
        reviewSummary[itemId].avg /= Math.max(1, reviewSummary[itemId].count);
      }
    }
  } catch (error) {
    console.error('Error fetching store review summary:', error);
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
          .in(
            'key',
            itemIds.map((itemId) => getStoreItemMetaKey(itemId)),
          )
      : { data: [] };

  const initialOrders = mergeOrdersWithMeta(
    (orders ?? []) as unknown as StoreOperationsOrder[],
    orderSettings ?? [],
  ).filter((order) => !order.meta?.hiddenFromModerators) as StoreOperationsOrder[];

  return {
    ok: true,
    data: {
      currentUser: profile,
      initialItems: mergeItemsWithMeta(items ?? [], itemSettings ?? []),
      initialOrders,
      initialTheme: normalizeStoreThemeConfig(currentTheme?.value),
      initialShowLowStock: resolvedSearchParams.lowStock === '1',
      reviewSummary,
    },
  };
}
