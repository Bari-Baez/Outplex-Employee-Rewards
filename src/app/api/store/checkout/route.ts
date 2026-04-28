import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import {
  buildInitialStoreOrderMeta,
  buildStoreOrderLineItem,
  getStoreOrderMetaKey,
} from '@/lib/store-helpers';
import { notifyModeratorsOfLowStock, shouldNotifyLowStock } from '@/lib/store-notifications';
import type { StoreItem } from '@/types/database';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';

interface IncomingCartItem {
  item: Pick<StoreItem, 'id'>;
  quantity: number;
}

interface RequestedLine {
  item: StoreItem;
  quantity: number;
}

function normalizeCart(cart: IncomingCartItem[]) {
  const quantities = new Map<string, number>();

  for (const cartItem of cart) {
    if (!cartItem?.item?.id) {
      continue;
    }

    const requestedQuantity = Number.isFinite(cartItem.quantity)
      ? Math.max(1, Math.floor(cartItem.quantity))
      : 1;

    quantities.set(cartItem.item.id, (quantities.get(cartItem.item.id) ?? 0) + requestedQuantity);
  }

  return [...quantities.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
}

export async function POST(req: Request) {
  let originalPoints = 0;
  let pointsDeducted = false;
  const stockRollbacks: Array<{ itemId: string; stock: number }> = [];
  let insertedOrderId: string | null = null;
  let insertedMetaKey: string | null = null;

  const rollback = async (serviceClient: Awaited<ReturnType<typeof createServiceClient>>, userId: string) => {
    if (insertedMetaKey) {
      await serviceClient.from('app_settings').delete().eq('key', insertedMetaKey);
    }

    if (insertedOrderId) {
      await serviceClient.from('store_orders').delete().eq('id', insertedOrderId);
    }

    if (pointsDeducted) {
      await serviceClient.from('users').update({ points: originalPoints }).eq('id', userId);
    }

    for (const rollbackEntry of stockRollbacks) {
      await serviceClient
        .from('store_items')
        .update({ stock: rollbackEntry.stock })
        .eq('id', rollbackEntry.itemId);
    }
  };

  try {
    const lowStockAlerts: Array<Pick<StoreItem, 'id' | 'name' | 'stock' | 'is_active'>> = [];
    const { cart } = (await req.json()) as { cart?: IncomingCartItem[] };
    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return NextResponse.json({ error: 'Your cart is empty.' }, { status: 400 });
    }

    const normalizedCart = normalizeCart(cart);
    if (normalizedCart.length === 0) {
      return NextResponse.json({ error: 'Your cart is empty.' }, { status: 400 });
    }

    const supabase = await createClient();
    const serviceClient = await createServiceClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const itemIds = normalizedCart.map((entry) => entry.itemId);
    const [{ data: items, error: itemsError }, { data: profile, error: profileError }] = await Promise.all([
      serviceClient
        .from('store_items')
        .select('id, name, description, points_cost, image_url, stock, is_active')
        .in('id', itemIds),
      serviceClient.from('users').select('id, role, points, name, email, employee_id').eq('id', user.id).single(),
    ]);

    if (itemsError) {
      throw itemsError;
    }

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User profile not found.' }, { status: 404 });
    }

    const maintenance = await enforceSectionAvailability({
      serviceClient: serviceClient,
      toolKey: 'store',
      sectionKey: 'checkout',
      userRole: profile.role as string,
      bypassForAdmin: true,
    });
    if (maintenance) {
      return maintenance;
    }

    originalPoints = profile.points;

    const itemMap = new Map((items ?? []).map((item) => [item.id, item as StoreItem]));
    const requestedLines: RequestedLine[] = [];
    let totalPoints = 0;

    for (const entry of normalizedCart) {
      const item = itemMap.get(entry.itemId);
      if (!item) {
        return NextResponse.json({ error: 'One of the selected items no longer exists.' }, { status: 400 });
      }

      if (!item.is_active) {
        return NextResponse.json(
          { error: `${item.name} is not available right now.` },
          { status: 400 },
        );
      }

      if (item.stock !== -1 && item.stock < entry.quantity) {
        return NextResponse.json(
          {
            error:
              item.stock === 0
                ? `${item.name} is currently out of stock.`
                : `Only ${item.stock} unit${item.stock === 1 ? '' : 's'} available for ${item.name}.`,
          },
          { status: 409 },
        );
      }

      requestedLines.push({ item, quantity: entry.quantity });
      totalPoints += item.points_cost * entry.quantity;
    }

    if (profile.points < totalPoints) {
      return NextResponse.json({ error: 'You do not have enough points for this order.' }, { status: 400 });
    }

    for (const line of requestedLines) {
      if (line.item.stock === -1) {
        continue;
      }

      const nextStock = line.item.stock - line.quantity;
      const { data: updatedItem, error: stockError } = await serviceClient
        .from('store_items')
        .update({ stock: nextStock })
        .eq('id', line.item.id)
        .eq('stock', line.item.stock)
        .select('id, name, stock, is_active')
        .maybeSingle();

      if (stockError || !updatedItem) {
        await rollback(serviceClient, user.id);
        return NextResponse.json(
          {
            error: `${line.item.name} changed while you were checking out. Please review your cart and try again.`,
          },
          { status: 409 },
        );
      }

      if (shouldNotifyLowStock(line.item.stock, nextStock, line.item.is_active)) {
        lowStockAlerts.push({
          id: line.item.id,
          name: line.item.name,
          stock: nextStock,
          is_active: line.item.is_active,
        });
      }

      stockRollbacks.push({ itemId: line.item.id, stock: line.item.stock });
    }

    const { data: updatedProfile, error: deductError } = await serviceClient
      .from('users')
      .update({ points: profile.points - totalPoints })
      .eq('id', user.id)
      .eq('points', profile.points)
      .select('id, points')
      .maybeSingle();

    if (deductError || !updatedProfile) {
      await rollback(serviceClient, user.id);
      return NextResponse.json(
        { error: 'Your points changed while you were checking out. Please refresh and try again.' },
        { status: 409 },
      );
    }

    pointsDeducted = true;

    const primaryItem = requestedLines[0]?.item;
    const { data: insertedOrder, error: insertOrderError } = await serviceClient
      .from('store_orders')
      .insert({
        item_id: primaryItem.id,
        user_id: user.id,
        points_spent: totalPoints,
        status: 'pending',
      })
      .select('id, item_id, user_id, points_spent, status, created_at')
      .single();

    if (insertOrderError || !insertedOrder) {
      await rollback(serviceClient, user.id);
      throw insertOrderError ?? new Error('Unable to create your store order.');
    }

    insertedOrderId = insertedOrder.id;

    insertedMetaKey = getStoreOrderMetaKey(insertedOrder.id);
    const orderMeta = buildInitialStoreOrderMeta(
      requestedLines.map((line) => buildStoreOrderLineItem(line.item, line.quantity)),
      insertedOrder.created_at,
      {
        name: profile.name,
        email: profile.email,
        employeeId: profile.employee_id,
      },
    );

    const { error: metadataError } = await serviceClient
      .from('app_settings')
      .upsert(
        {
          key: insertedMetaKey,
          value: orderMeta,
        },
        { onConflict: 'key' },
      );

    if (metadataError) {
      await rollback(serviceClient, user.id);
      throw metadataError;
    }

    await serviceClient.from('points_ledger').insert({
      user_id: user.id,
      points_added: -totalPoints,
      reason: `Store checkout (1 grouped order, ${requestedLines.length} product${requestedLines.length === 1 ? '' : 's'})`,
    });

    const totalUnits = requestedLines.reduce((sum, line) => sum + line.quantity, 0);
    await serviceClient.from('notifications').insert({
      user_id: user.id,
      title: 'Store order received',
      message: `Your order with ${totalUnits} item${totalUnits === 1 ? '' : 's'} across ${requestedLines.length} reward${requestedLines.length === 1 ? '' : 's'} is now pending review. We will notify you when it is approved or ready for pickup.`,
      type: 'store',
    });

    for (const lowStockItem of lowStockAlerts) {
      await notifyModeratorsOfLowStock(serviceClient, lowStockItem);
    }

    return NextResponse.json({
      success: true,
      totalPoints,
      orderCount: 1,
      orderId: insertedOrder.id,
    });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 },
    );
  }
}

