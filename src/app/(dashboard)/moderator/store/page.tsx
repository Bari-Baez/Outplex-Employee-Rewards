import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import type { StoreOperationsTab } from './renderStoreOperationsPage';

export const metadata: Metadata = { title: 'Store Operations' };

export default async function ModeratorStorePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = searchParams ? await searchParams : {};
  const tabRaw = Array.isArray(resolved.tab) ? resolved.tab[0] : resolved.tab;

  const tab = typeof tabRaw === 'string' ? tabRaw : '';
  const map: Record<string, { href: string; tab?: StoreOperationsTab }> = {
    orders: { href: '/moderator/store/orders', tab: 'orders' },
    inventory: { href: '/moderator/store/inventory', tab: 'inventory' },
    settings: { href: '/moderator/store/theme', tab: 'settings' },
    analytics: { href: '/moderator/store/analytics', tab: 'analytics' },
    recycle_bin: { href: '/moderator/store/recycle-bin', tab: 'recycle_bin' },
  };

  const target = map[tab] ?? map.orders;
  const lowStock = resolved.lowStock === '1' ? '?lowStock=1' : '';
  redirect(`${target.href}${lowStock}`);
}
