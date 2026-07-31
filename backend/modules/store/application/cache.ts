import { revalidatePath, revalidateTag } from 'next/cache';

export const STORE_CACHE_TAGS = {
  catalog: 'store-catalog',
  publicEmployeeStores: 'public-employee-stores',
  reviewSummary: 'store-review-summary',
} as const;

export function revalidateCompanyStoreViews() {
  revalidateTag(STORE_CACHE_TAGS.catalog, 'max');
  revalidateTag(STORE_CACHE_TAGS.reviewSummary, 'max');
  revalidatePath('/store');
  revalidatePath('/moderator/store/inventory');
  revalidatePath('/moderator/store/analytics');
}

export function revalidateEmployeeStoreViews() {
  revalidateTag(STORE_CACHE_TAGS.publicEmployeeStores, 'max');
  revalidatePath('/store');
  revalidatePath('/my-store');
}

export function revalidateAllStoreViews() {
  revalidateCompanyStoreViews();
  revalidateEmployeeStoreViews();
}
