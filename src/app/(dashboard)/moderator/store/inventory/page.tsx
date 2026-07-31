import type { Metadata } from 'next';
import { renderStoreOperationsPage } from '@/app/_composition/store-operations-page';

export const metadata: Metadata = { title: 'Store Operations · Inventory' };

export default async function StoreOperationsInventoryPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderStoreOperationsPage({ searchParams, initialTab: 'inventory' });
}
