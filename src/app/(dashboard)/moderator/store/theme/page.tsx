import type { Metadata } from 'next';
import { renderStoreOperationsPage } from '../renderStoreOperationsPage';

export const metadata: Metadata = { title: 'Store Operations · Theme' };

export default async function StoreOperationsThemePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderStoreOperationsPage({ searchParams, initialTab: 'settings' });
}

