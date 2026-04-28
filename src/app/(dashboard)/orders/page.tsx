import { mergeOrdersWithMeta, STORE_ORDER_META_PREFIX } from '@/lib/store-helpers';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { OrdersClient } from './OrdersClient';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Order History' };

export default async function OrdersPage() {
  const supabase = await createClient();
  const serviceClient = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: orders } = await serviceClient
    .from('store_orders')
    .select('*, item:store_items(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const orderIds = (orders ?? []).map((order) => order.id);
  const { data: orderSettings } =
    orderIds.length > 0
      ? await serviceClient
          .from('app_settings')
          .select('key, value, updated_at')
          .in(
            'key',
            orderIds.map((orderId) => `${STORE_ORDER_META_PREFIX}${orderId}`),
          )
      : { data: [] };

  // Fetch employee store orders — graceful if table doesn't exist yet
  let enrichedEmpOrders: Parameters<typeof OrdersClient>[0]['initialEmpOrders'] = [];
  try {
    const { data: empOrders } = await serviceClient
      .from('employee_store_orders')
      .select('*, items:employee_store_order_items(*)')
      .eq('buyer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    const empStoreIds = [...new Set((empOrders ?? []).map((o) => o.store_id as string))];
    const empSellerIds = [...new Set((empOrders ?? []).map((o) => o.seller_id as string))];

    const [{ data: empStores }, { data: empSellers }] = await Promise.all([
      empStoreIds.length > 0
        ? serviceClient.from('employee_stores').select('id, slug, name').in('id', empStoreIds)
        : Promise.resolve({ data: [] as { id: string; slug: string; name: string }[] }),
      empSellerIds.length > 0
        ? serviceClient.from('users').select('id, name, email, avatar_url, slack_id').in('id', empSellerIds)
        : Promise.resolve({ data: [] as { id: string; name: string; email: string; avatar_url: string | null; slack_id: string | null }[] }),
    ]);

    const empStoreMap = new Map((empStores ?? []).map((s) => [s.id, s]));
    const empSellerMap = new Map((empSellers ?? []).map((s) => [s.id, s]));

    enrichedEmpOrders = (empOrders ?? []).map((o) => ({
      id: o.id as string,
      store_id: o.store_id as string,
      seller_id: o.seller_id as string,
      buyer_id: o.buyer_id as string,
      total_dop: o.total_dop as number,
      status: o.status as string,
      contact_method: (o.contact_method ?? null) as string | null,
      buyer_notes: (o.buyer_notes ?? null) as string | null,
      created_at: o.created_at as string,
      items: (o.items ?? []) as Parameters<typeof OrdersClient>[0]['initialEmpOrders'][0]['items'],
      store: (empStoreMap.get(o.store_id as string) ?? null) as Parameters<typeof OrdersClient>[0]['initialEmpOrders'][0]['store'],
      seller: (empSellerMap.get(o.seller_id as string) ?? null) as Parameters<typeof OrdersClient>[0]['initialEmpOrders'][0]['seller'],
    }));
  } catch {
    // Table may not exist yet; render page without emp orders
  }

  return (
    <OrdersClient
      initialOrders={mergeOrdersWithMeta(orders || [], orderSettings || [])}
      initialEmpOrders={enrichedEmpOrders}
    />
  );
}
