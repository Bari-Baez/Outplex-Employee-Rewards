import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import { MyStoreClient } from '@frontend/modules/store/ui/MyStoreClient';
import type { Notification } from '@shared/contracts/database';

export const metadata: Metadata = { title: 'My Store' };

export default async function MyStorePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const service = await createServiceClient();
  let roleAllowed = true;

  try {
    const { data: userProfile } = await service
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    // Only regular employees can own stores; moderators/admins manage the platform
    roleAllowed = !userProfile || userProfile.role === 'employee';
  } catch {
    // If users table is inaccessible or profile missing, default to allowed for safety
    // or handle as restricted based on policy. Here we allow to avoid blocking employees.
  }

  let store: Parameters<typeof MyStoreClient>[0]['initialStore'] = null;
  let latestRequest: Parameters<typeof MyStoreClient>[0]['initialLatestRequest'] = null;
  let products: Parameters<typeof MyStoreClient>[0]['initialProducts'] = [];
  let orders: Parameters<typeof MyStoreClient>[0]['initialOrders'] = [];
  let moderationNotifications: Notification[] = [];

  if (roleAllowed) {
    try {
      const [{ data: storeData }, { data: requestData }] = await Promise.all([
        service
          .from('employee_stores')
          .select('*')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        service
          .from('employee_store_requests')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      store = (storeData as typeof store) ?? null;
      latestRequest = (requestData as typeof latestRequest) ?? null;

      if (storeData) {
        // Clean up orders older than 30 days to save space
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        await service
          .from('employee_store_orders')
          .delete()
          .eq('store_id', storeData.id)
          .lt('created_at', thirtyDaysAgo.toISOString());

        const [{ data: productsData }, { data: ordersData }] = await Promise.all([
          service
            .from('employee_store_products')
            .select('*')
            .eq('store_id', storeData.id)
            .order('created_at', { ascending: false }),
          service
            .from('employee_store_orders')
            .select(`
              *,
              items:employee_store_order_items(*),
              buyer:users!employee_store_orders_buyer_id_fkey(id, name, email, avatar_url)
            `)
            .eq('store_id', storeData.id)
            .order('created_at', { ascending: false })
        ]);
        products = (productsData ?? []) as typeof products;
        orders = (ordersData ?? []) as typeof orders;
      }

      const { data: notificationData } = await service
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', 'store')
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(10);
      moderationNotifications = (notificationData ?? []) as Notification[];
    } catch {
      // Employee store tables may not exist yet (migration pending)
    }
  }

  return (
    <MyStoreClient
      initialStore={store}
      initialLatestRequest={latestRequest}
      initialProducts={products}
      initialOrders={orders}
      moderationNotifications={moderationNotifications}
      roleAllowed={roleAllowed}
    />
  );
}
