import { unstable_cache } from 'next/cache';
import type { AppSettingValue, EmployeeStore, EmployeeStoreProduct, EmployeeStoreProductReview, StoreItem, StoreThemeConfig, User } from '@/types/database';
import { STORE_THEME_KEY, getStoreItemMetaKey, normalizeStoreThemeConfig } from '@/lib/store-helpers';
import { createServiceClient } from '@/lib/supabase/server';

const STORE_REVALIDATE_SECONDS = 60;

type StoreItemSettingRow = {
  key: string;
  value: AppSettingValue;
};

type PublicEmployeeProduct = Pick<
  EmployeeStoreProduct,
  'id' | 'store_id' | 'name' | 'description' | 'price_dop' | 'cost_dop' | 'image_url' | 'category' | 'stock' | 'is_active' | 'status' | 'created_at' | 'updated_at'
> & {
  reviews: Array<
    Pick<EmployeeStoreProductReview, 'id' | 'rating' | 'user_id'> & {
      user: Pick<User, 'id' | 'name' | 'avatar_url'> | null;
    }
  >;
};

type PublicEmployeeStore = Pick<
  EmployeeStore,
  'id' | 'owner_id' | 'slug' | 'name' | 'description' | 'category' | 'banner_image' | 'logo_image' | 'accent_color' | 'status' | 'is_open' | 'operating_hours' | 'first_product_published_at' | 'created_at' | 'updated_at'
> & {
  owner: Pick<User, 'id' | 'name' | 'email' | 'avatar_url' | 'slack_id'> | null;
  products: PublicEmployeeProduct[];
};

export const getCachedStoreCatalog = unstable_cache(
  async (): Promise<{
    items: StoreItem[];
    itemSettings: StoreItemSettingRow[];
    theme: StoreThemeConfig;
  }> => {
    const serviceClient = await createServiceClient();
    const [{ data: items, error: itemsError }, { data: settings, error: settingsError }] = await Promise.all([
      serviceClient
        .from('store_items')
        .select('id,name,description,points_cost,image_url,stock,is_active,created_at')
        .eq('is_active', true)
        .order('points_cost'),
      serviceClient
        .from('app_settings')
        .select('value')
        .eq('key', STORE_THEME_KEY)
        .maybeSingle(),
    ]);

    if (itemsError) {
      throw new Error(itemsError.message ?? 'Unable to load store catalog.');
    }
    if (settingsError) {
      throw new Error(settingsError.message ?? 'Unable to load store theme.');
    }

    const itemIds = (items ?? []).map((item) => item.id);
    const { data: itemSettings, error: itemSettingsError } =
      itemIds.length > 0
        ? await serviceClient
            .from('app_settings')
            .select('key, value')
            .in('key', itemIds.map((itemId) => getStoreItemMetaKey(itemId)))
        : { data: [], error: null };

    if (itemSettingsError) {
      throw new Error(itemSettingsError.message ?? 'Unable to load store item settings.');
    }

    return {
      items: (items ?? []) as StoreItem[],
      itemSettings: (itemSettings ?? []) as StoreItemSettingRow[],
      theme: normalizeStoreThemeConfig(settings?.value),
    };
  },
  ['store-catalog:v1'],
  { revalidate: STORE_REVALIDATE_SECONDS },
);

export const getCachedStoreReviewSummary = unstable_cache(
  async (): Promise<Record<string, { avg: number; count: number }>> => {
    const serviceClient = await createServiceClient();
    const { data: summaries, error } = await serviceClient
      .from('store_reviews')
      .select('item_id, rating')
      .order('item_id');

    if (error) {
      throw new Error(error.message ?? 'Unable to load store review summary.');
    }

    const summaryMap: Record<string, { avg: number; count: number }> = {};
    for (const row of summaries ?? []) {
      const existing = summaryMap[row.item_id] ?? { avg: 0, count: 0 };
      existing.count += 1;
      existing.avg += row.rating;
      summaryMap[row.item_id] = existing;
    }

    for (const itemId of Object.keys(summaryMap)) {
      summaryMap[itemId].avg = summaryMap[itemId].avg / summaryMap[itemId].count;
    }

    return summaryMap;
  },
  ['store-review-summary:v1'],
  { revalidate: STORE_REVALIDATE_SECONDS },
);

export const getCachedPublicEmployeeStores = unstable_cache(
  async (): Promise<PublicEmployeeStore[]> => {
    const serviceClient = await createServiceClient();
    const { data: stores, error: storesError } = await serviceClient
      .from('employee_stores')
      .select('id,owner_id,slug,name,description,category,banner_image,logo_image,accent_color,status,is_open,operating_hours,first_product_published_at,created_at,updated_at')
      .order('created_at', { ascending: false });

    if (storesError) {
      console.warn('Employee stores unavailable:', storesError.message ?? 'unknown error');
      return [];
    }

    const publicStores = (stores ?? []).filter((store) => {
      const status = String((store as { status?: unknown } | null)?.status ?? '');
      return status === 'active' || status === 'scheduled' || status === 'approved';
    });

    const storeIds = publicStores.map((store) => store.id);
    const ownerIds = publicStores.map((store) => store.owner_id);

    const [{ data: products, error: productsError }, { data: owners, error: ownersError }] = await Promise.all([
      storeIds.length > 0
        ? serviceClient
            .from('employee_store_products')
            .select('id,store_id,name,description,price_dop,cost_dop,image_url,category,stock,is_active,status,created_at,updated_at')
            .in('store_id', storeIds)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      ownerIds.length > 0
        ? serviceClient
            .from('users')
            .select('id,name,email,avatar_url,slack_id')
            .in('id', ownerIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (productsError) {
      console.warn(
        'Employee store products unavailable:',
        productsError.message ?? 'unknown error',
      );
    }
    if (ownersError) {
      console.warn(
        'Employee store owners unavailable:',
        ownersError.message ?? 'unknown error',
      );
    }

    const safeProducts = products ?? [];
    const safeOwners = owners ?? [];
    const productIds = safeProducts.map((product) => product.id);
    const { data: reviews, error: reviewsError } =
      productIds.length > 0
        ? await serviceClient
            .from('employee_store_product_reviews')
            .select('id,product_id,rating,user_id,user:users(id,name,avatar_url)')
            .in('product_id', productIds)
        : { data: [], error: null };

    if (reviewsError) {
      console.warn(
        'Employee store reviews unavailable:',
        reviewsError.message ?? 'unknown error',
      );
    }

    const reviewsByProduct = new Map<string, PublicEmployeeProduct['reviews']>();
    for (const review of reviews ?? []) {
      const current = reviewsByProduct.get(review.product_id) ?? [];
      current.push({
        id: review.id,
        rating: review.rating,
        user_id: review.user_id,
        user: Array.isArray(review.user) ? (review.user[0] ?? null) : (review.user ?? null),
      });
      reviewsByProduct.set(review.product_id, current);
    }

    const ownerMap = new Map(safeOwners.map((owner) => [owner.id, owner]));

    return publicStores.map((store) => ({
      ...(store as PublicEmployeeStore),
      owner: ownerMap.get(store.owner_id) ?? null,
      products: safeProducts
        .filter((product) => product.store_id === store.id)
        .map((product) => ({
          ...(product as PublicEmployeeProduct),
          reviews: reviewsByProduct.get(product.id) ?? [],
        })),
    }));
  },
  ['public-employee-stores:v1'],
  { revalidate: STORE_REVALIDATE_SECONDS },
);
