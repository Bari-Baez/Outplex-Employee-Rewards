import { NextResponse } from 'next/server';
import {
  appendOrderStatus,
  getOrderItemName,
  getOrderLineItems,
  getStoreOrderMetaKey,
  ORDER_CANCELLATION_WINDOW_MS,
  parseStoreOrderMeta,
} from '@/lib/store-helpers';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const { orderId } = (await req.json()) as { orderId?: string };
    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }

    const supabase = await createClient();
    const serviceClient = await createServiceClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [{ data: order, error: orderError }, { data: metaSetting, error: metaError }] = await Promise.all([
      serviceClient
        .from('store_orders')
        .select('id, item_id, user_id, points_spent, status, created_at, item:store_items(id, name, stock, image_url, description)')
        .eq('id', orderId)
        .single(),
      serviceClient
        .from('app_settings')
        .select('key, value')
        .eq('key', getStoreOrderMetaKey(orderId))
        .maybeSingle(),
    ]);

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (metaError) {
      throw metaError;
    }

    if (order.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (order.status !== 'pending') {
      return NextResponse.json({ error: 'Only pending orders can be cancelled.' }, { status: 400 });
    }

    const elapsedMs = Date.now() - new Date(order.created_at).getTime();
    if (elapsedMs > ORDER_CANCELLATION_WINDOW_MS) {
      return NextResponse.json({ error: 'The 5-minute cancellation window has expired.' }, { status: 400 });
    }

    const meta = parseStoreOrderMeta(metaSetting?.value);
    const lineItems = getOrderLineItems({
      item: Array.isArray(order.item) ? order.item[0] : order.item,
      meta,
    });

    const { error: updateOrderError } = await serviceClient
      .from('store_orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId);

    if (updateOrderError) {
      throw updateOrderError;
    }

    for (const line of lineItems) {
      const { data: linkedItem, error: itemError } = await serviceClient
        .from('store_items')
        .select('id, stock')
        .eq('id', line.itemId)
        .maybeSingle();

      if (itemError) {
        throw itemError;
      }

      if (linkedItem && linkedItem.stock !== -1) {
        const { error: stockError } = await serviceClient
          .from('store_items')
          .update({ stock: linkedItem.stock + line.quantity })
          .eq('id', line.itemId);

        if (stockError) {
          throw stockError;
        }
      }
    }

    const { data: profile, error: profileError } = await serviceClient
      .from('users')
      .select('points')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      throw profileError ?? new Error('Unable to load profile for refund.');
    }

    const { error: refundError } = await serviceClient
      .from('users')
      .update({ points: profile.points + order.points_spent })
      .eq('id', user.id);

    if (refundError) {
      throw refundError;
    }

    await serviceClient.from('points_ledger').insert({
      user_id: user.id,
      points_added: order.points_spent,
      reason: `Store order cancelled (${orderId})`,
    });

    const updatedMeta = appendOrderStatus(meta, 'cancelled', 'Cancelled by employee');
    await serviceClient.from('app_settings').upsert(
      {
        key: getStoreOrderMetaKey(orderId),
        value: updatedMeta,
      },
      { onConflict: 'key' },
    );

    await serviceClient.from('notifications').insert({
      user_id: user.id,
      title: 'Store order cancelled',
      message: `Your order for ${meta?.orderLabel ?? getOrderItemName({ item: Array.isArray(order.item) ? order.item[0] : order.item, meta })} was cancelled and your points were refunded.`,
      type: 'store',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error cancelling order:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 },
    );
  }
}

