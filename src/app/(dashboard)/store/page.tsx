import type { Metadata } from 'next';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import {
  getStoreItemMetaKey,
  mergeItemsWithMeta,
  normalizeStoreThemeConfig,
  STORE_THEME_KEY,
} from '@/lib/store-helpers';
import { redirect } from 'next/navigation';
import { StoreClient } from './StoreClient';

type StoreClientEmployeeStore = Parameters<typeof StoreClient>[0]['employeeStores'][number];
type StoreClientEmployeeProduct = StoreClientEmployeeStore['products'][number];

export const metadata: Metadata = { title: 'Company Store' };

export default async function StorePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const service = await createServiceClient();

  const [
    { data: profile },
    { data: items },
    { data: settings },
  ] = await Promise.all([
    supabase.from('users').select('points, name, slack_id').eq('id', user.id).single(),
    supabase
      .from('store_items')
      .select('id, name, description, points_cost, image_url, stock, is_active, created_at')
      .eq('is_active', true)
      .order('points_cost'),
    supabase.from('app_settings').select('value').eq('key', STORE_THEME_KEY).maybeSingle(),
  ]);

  const itemIds = (items ?? []).map((item) => item.id);
  const { data: itemSettings } =
    itemIds.length > 0
      ? await supabase
          .from('app_settings')
          .select('key, value')
          .in('key', itemIds.map((itemId) => getStoreItemMetaKey(itemId)))
      : { data: [] };

  // Fetch employee store data — graceful if tables don't exist yet
  let storesWithData: Parameters<typeof StoreClient>[0]['employeeStores'] = [];
  let buyerPrefs: Parameters<typeof StoreClient>[0]['buyerContactPrefs'] = null;
  try {
    const [
      { data: empStores, error: storesError },
      { data: buyerPrefsData, error: prefsError },
    ] = await Promise.all([
      service
        .from('employee_stores')
        // Use `*` to avoid hard-failing when optional columns don't exist yet in a given environment.
        .select('*')
        .order('created_at', { ascending: false }),
      service
        .from('user_contact_preferences')
        .select('user_id, whatsapp_number, whatsapp_opt_in')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    if (storesError) {
      console.error('Error fetching employee stores:', storesError);
    }
    if (prefsError) {
      console.error('Error fetching buyer contact preferences:', prefsError);
    }

    buyerPrefs = buyerPrefsData as typeof buyerPrefs;
    const publicStores = (empStores ?? []).filter((store) => {
      const status = String((store as { status?: unknown } | null)?.status ?? '');
      // `approved` is kept for backwards compatibility with older datasets.
      return status === 'active' || status === 'scheduled' || status === 'approved';
    });

    const storeIds = publicStores.map((s) => s.id);
    const ownerIds = publicStores.map((s) => s.owner_id);
    const [{ data: empProducts, error: productsError }, { data: empOwners }] = await Promise.all([
      storeIds.length > 0
        ? service
            .from('employee_store_products')
            .select('*')
            .in('store_id', storeIds)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      ownerIds.length > 0
        ? service.from('users').select('id, name, email, avatar_url, slack_id').in('id', ownerIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (productsError) {
      // Avoid `console.error` in Server Components (it triggers the dev overlay).
      const msg = (productsError as { message?: string } | null)?.message ?? 'unknown error';
      console.warn('Employee store products unavailable:', msg);
    }
    
    const productIds = (empProducts ?? []).map(p => p.id);
    const { data: allReviews, error: reviewsError } = productIds.length > 0
      ? await service.from('employee_store_product_reviews')
          .select('id, product_id, rating, user_id, user:users(id, name, avatar_url)')
          .in('product_id', productIds)
      : { data: [], error: null };
    if (reviewsError) {
      // Missing table / RLS should not break the store page.
      const msg = (reviewsError as { message?: string } | null)?.message ?? 'unknown error';
      console.warn('Employee store product reviews unavailable:', msg);
    }

    const reviewsByProduct = new Map<string, NonNullable<StoreClientEmployeeProduct['reviews']>>();
    for (const r of allReviews ?? []) {
      const arr = reviewsByProduct.get(r.product_id) ?? [];
      arr.push({
        id: r.id,
        rating: r.rating,
        user_id: r.user_id,
        user: Array.isArray(r.user) ? (r.user[0] ?? null) : (r.user ?? null),
      });
      reviewsByProduct.set(r.product_id, arr);
    }

    const ownerMap = new Map((empOwners ?? []).map((o) => [o.id, o]));
    storesWithData = publicStores.map((store): StoreClientEmployeeStore => {
      const storeProducts = (empProducts ?? []).filter((p) => p.store_id === store.id);
      const derivedFirstPublishedAt =
        (store as { first_product_published_at?: string | null }).first_product_published_at ??
        storeProducts.reduce<string | null>((min, product) => {
          if (!product.created_at) return min;
          if (!min) return product.created_at;
          return new Date(product.created_at).getTime() < new Date(min).getTime() ? product.created_at : min;
        }, null);

      return ({
        ...store,
        first_product_published_at: derivedFirstPublishedAt ?? null,
        owner: ownerMap.get(store.owner_id) ?? null,
        products: storeProducts.map((p): StoreClientEmployeeProduct => ({
          ...p,
          reviews: reviewsByProduct.get(p.id) ?? [],
        })),
      });
    });
  } catch {
    // Employee store tables may not exist yet; render without them
  }

  const theme = normalizeStoreThemeConfig(settings?.value);
  const itemsWithMeta = mergeItemsWithMeta(items || [], itemSettings || []);

  return (
    <StoreClient
      items={itemsWithMeta}
      profile={{
        points: profile?.points ?? 0,
        name: profile?.name ?? '',
        slackId: (profile as { slack_id?: string | null })?.slack_id ?? null,
      }}
      theme={theme}
      employeeStores={storesWithData}
      buyerContactPrefs={buyerPrefs}
    />
  );
}
