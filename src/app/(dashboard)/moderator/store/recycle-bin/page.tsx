import type { Metadata } from 'next';
import { renderStoreOperationsPage } from '@/app/_composition/store-operations-page';

export const metadata: Metadata = { title: 'Store Operations · Recycle Bin' };

export default async function StoreOperationsRecycleBinPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderStoreOperationsPage({ searchParams, initialTab: 'recycle_bin' });
}
