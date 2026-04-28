import type { Metadata } from 'next';
import { renderStoreOperationsPage } from '../renderStoreOperationsPage';

export const metadata: Metadata = { title: 'Store Operations · Orders' };

export default async function StoreOperationsOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderStoreOperationsPage({ searchParams, initialTab: 'orders' });
}

