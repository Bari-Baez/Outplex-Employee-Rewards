import type { Metadata } from 'next';
import { renderStoreOperationsPage } from '@/app/_composition/store-operations-page';

export const metadata: Metadata = { title: 'Store Operations · Theme' };

export default async function StoreOperationsThemePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderStoreOperationsPage({ searchParams, initialTab: 'settings' });
}
