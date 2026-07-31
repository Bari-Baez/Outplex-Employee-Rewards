import {
  loadStoreOperationsPage,
  type StoreOperationsSearchParams,
} from '@backend/modules/store/application/load-store-operations-page';
import { ModeratorStoreClient } from '@frontend/modules/store/ui/ModeratorStoreClient';
import { redirect } from 'next/navigation';

export type StoreOperationsTab =
  | 'orders'
  | 'inventory'
  | 'settings'
  | 'analytics'
  | 'recycle_bin';

export async function renderStoreOperationsPage({
  searchParams,
  initialTab,
}: {
  searchParams?: StoreOperationsSearchParams | Promise<StoreOperationsSearchParams>;
  initialTab: StoreOperationsTab;
}) {
  const result = await loadStoreOperationsPage({ searchParams });

  if (!result.ok) {
    redirect(result.redirectTo);
  }

  return <ModeratorStoreClient {...result.data} initialTab={initialTab} />;
}
