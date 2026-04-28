import type { Metadata } from 'next';
import { renderStoreOperationsPage } from '../renderStoreOperationsPage';

export const metadata: Metadata = { title: 'Store Operations · Analytics' };

export default async function StoreOperationsAnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderStoreOperationsPage({ searchParams, initialTab: 'analytics' });
}

