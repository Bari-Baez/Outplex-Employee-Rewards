import { NextResponse } from 'next/server';
import {
  appendOrderStatus,
  canUndoCompletedOrder,
  getOrderItemName,
  getOrderLineItems,
  getStoreOrderMetaKey,
  isModeratorOrderDeleteEligible,
  parseStoreOrderMeta,
} from '@/lib/store-helpers';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { OrderStatus, StorePickupMode } from '@/types/database';
import { isModeratorRole } from '@/lib/auth/roles';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';

interface UpdateOrderRequest {
  status?: OrderStatus;
  pickupMode?: StorePickupMode | null;
  pickupDate?: string | null;
  pickupTime?: string | null;
  pickupDeadline?: string | null;
  pickupNote?: string | null;
  denialReason?: string | null;
}

async function getAuthorizedModerator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('id, role, name')
    .eq('id', user.id)
    .single();

  if (!profile || !isModeratorRole(profile.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user, profile };
}

function buildNotificationMessage(status: OrderStatus, orderName: string, payload: UpdateOrderRequest) {
  switch (status) {
    case 'approved':
      return {
        title: 'Store order approved',
        message: `Your order for ${orderName} was approved and is being prepared.`,
      };
    case 'ready_for_pickup':
      if (payload.pickupMode === 'scheduled' && payload.pickupDate) {
        const deadline = payload.pickupDeadline ? ` Please pick it up before ${payload.pickupDeadline}.` : '';
        const time = payload.pickupTime ? ` at ${payload.pickupTime}` : '';
        return {
          title: 'Pickup scheduled',
          message: `${orderName} will be ready for pickup on ${payload.pickupDate}${time}.${deadline}`,
        };
      }

      return {
        title: 'Ready for pickup',
        message: `${orderName} is ready for pickup now.${payload.pickupDeadline ? ` Please pick it up before ${payload.pickupDeadline}.` : ''}`,
      };
    case 'rejected':
      return {
        title: 'Store order denied',
        message: payload.denialReason
          ? `${orderName} could not be fulfilled: ${payload.denialReason}. Your points were refunded.`
          : `${orderName} could not be fulfilled. Your points were refunded.`,
      };
    case 'cancelled':
      return {
        title: 'Store order cancelled',
        message: payload.denialReason
          ? `${orderName} was cancelled: ${payload.denialReason}. Your points were refunded.`
          : `${orderName} was cancelled and your points were refunded.`,
      };
    case 'completed':
      return {
        title: 'Store order completed',
        message: `${orderName} was marked as completed.`,
      };
    default:
      return {
        title: 'Store order updated',
        message: `${orderName} was updated.`,
      };
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ orderId: string }> }) {
  const auth = await getAuthorizedModerator();
  if (auth.error) {
    return auth.error;
  }

  const serviceClient = await createServiceClient();
  const maintenance = await enforceSectionAvailability({
    serviceClient: serviceClient,
    toolKey: 'store_operations',
    sectionKey: 'orders',
    userRole: auth.profile.role as string,
    bypassForAdmin: true,
  });
  if (maintenance) {
    return maintenance;
  }
  const { orderId } = await context.params;
  const payload = (await req.json()) as UpdateOrderRequest;

  if (!payload.status) {
    return NextResponse.json({ error: 'Missing status.' }, { status: 400 });
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
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  if (metaError) {
    throw metaError;
  }

  const currentMeta = parseStoreOrderMeta(metaSetting?.value);
  const lineItems = getOrderLineItems({
    item: Array.isArray(order.item) ? order.item[0] : order.item,
    meta: currentMeta,
  });
  const orderName = currentMeta?.orderLabel ?? getOrderItemName({ item: Array.isArray(order.item) ? order.item[0] : order.item, meta: currentMeta });

  if (payload.status === 'ready_for_pickup' && payload.pickupMode === 'scheduled') {
    if (!payload.pickupDate || !payload.pickupDeadline) {
      return NextResponse.json(
        { error: 'Scheduled pickup requires a pickup date and a pickup deadline.' },
        { status: 400 },
      );
    }
  }

  if ((payload.status === 'rejected' || payload.status === 'cancelled') && ['rejected', 'cancelled'].includes(order.status)) {
    return NextResponse.json({ error: 'This order has already been refunded.' }, { status: 400 });
  }

  if (payload.status === 'completed' && !['approved', 'ready_for_pickup'].includes(order.status)) {
    return NextResponse.json(
      { error: 'Only approved or ready-for-pickup orders can be completed.' },
      { status: 400 },
    );
  }

  if (payload.status === 'ready_for_pickup' && order.status === 'completed' && !canUndoCompletedOrder(currentMeta)) {
    return NextResponse.json(
      { error: 'The 15-minute undo window for this completed order has expired.' },
      { status: 400 },
    );
  }

  let nextMeta = appendOrderStatus(
    currentMeta,
    payload.status,
    payload.denialReason ?? payload.pickupNote ?? null,
    auth.profile.name,
  );

  if (payload.status === 'ready_for_pickup') {
    nextMeta = {
      ...nextMeta,
      pickupMode: payload.pickupMode ?? 'immediate',
      pickupDate: payload.pickupDate ?? null,
      pickupTime: payload.pickupTime ?? null,
      pickupDeadline: payload.pickupDeadline ?? null,
      pickupNote: payload.pickupNote ?? null,
      denialReason: null,
    };
  }

  if (payload.status === 'approved') {
    nextMeta = {
      ...nextMeta,
      denialReason: null,
    };
  }

  if (payload.status === 'rejected' || payload.status === 'cancelled') {
    nextMeta = {
      ...nextMeta,
      denialReason: payload.denialReason ?? null,
    };
  }

  if (payload.status === 'ready_for_pickup' && order.status === 'completed') {
    nextMeta = {
      ...nextMeta,
      hiddenFromModerators: false,
      moderatorArchivedAt: null,
    };
  }

  const { error: updateOrderError } = await serviceClient
    .from('store_orders')
    .update({ status: payload.status })
    .eq('id', orderId);

  if (updateOrderError) {
    throw updateOrderError;
  }

  if (payload.status === 'rejected' || payload.status === 'cancelled') {
    const restorableLines = lineItems.filter((line) => line.itemId && line.quantity > 0);

    for (const line of restorableLines) {
      const { data: linkedItem, error: itemError } = await serviceClient
        .from('store_items')
        .select('id, stock')
        .eq('id', line.itemId)
        .maybeSingle();

      if (itemError) {
        throw itemError;
      }

      if (linkedItem && linkedItem.stock !== -1) {
        const { error: restoreStockError } = await serviceClient
          .from('store_items')
          .update({ stock: linkedItem.stock + line.quantity })
          .eq('id', line.itemId);

        if (restoreStockError) {
          throw restoreStockError;
        }
      }
    }

    const { data: targetUser, error: userError } = await serviceClient
      .from('users')
      .select('points')
      .eq('id', order.user_id)
      .single();

    if (userError || !targetUser) {
      throw userError ?? new Error('Unable to load employee profile for refund.');
    }

    const { error: refundError } = await serviceClient
      .from('users')
      .update({ points: targetUser.points + order.points_spent })
      .eq('id', order.user_id);

    if (refundError) {
      throw refundError;
    }

    await serviceClient.from('points_ledger').insert({
      user_id: order.user_id,
      points_added: order.points_spent,
      granted_by: auth.user.id,
      reason: `Store order ${payload.status} (${orderId})`,
    });
  }

  const { error: metaUpsertError } = await serviceClient.from('app_settings').upsert(
    {
      key: getStoreOrderMetaKey(orderId),
      value: nextMeta,
    },
    { onConflict: 'key' },
  );

  if (metaUpsertError) {
    throw metaUpsertError;
  }

  const notification = buildNotificationMessage(payload.status, orderName, payload);
  await serviceClient.from('notifications').insert({
    user_id: order.user_id,
    title: notification.title,
    message: notification.message,
    type: 'store',
  });

  return NextResponse.json({ success: true, meta: nextMeta });
}

export async function DELETE(_: Request, context: { params: Promise<{ orderId: string }> }) {
  const auth = await getAuthorizedModerator();
  if (auth.error) {
    return auth.error;
  }

  const serviceClient = await createServiceClient();
  const maintenance = await enforceSectionAvailability({
    serviceClient: serviceClient,
    toolKey: 'store_operations',
    sectionKey: 'orders',
    userRole: auth.profile.role as string,
    bypassForAdmin: true,
  });
  if (maintenance) {
    return maintenance;
  }
  const { orderId } = await context.params;

  const { data: order, error: orderError } = await serviceClient
    .from('store_orders')
    .select('id, status, created_at')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  const eligible = isModeratorOrderDeleteEligible(order);

  if (!eligible) {
    return NextResponse.json(
      { error: 'Pending orders cannot be deleted. Process the order first, then delete the record.' },
      { status: 400 },
    );
  }

  const { data: metaSetting, error: metaError } = await serviceClient
    .from('app_settings')
    .select('key, value')
    .eq('key', getStoreOrderMetaKey(orderId))
    .maybeSingle();

  if (metaError) {
    throw metaError;
  }

  const currentMeta = parseStoreOrderMeta(metaSetting?.value);
  const nextMeta = {
    ...(currentMeta ?? {
      quantity: 1,
      unitPoints: 0,
      itemName: 'Store Item',
      itemImageUrl: null,
      itemDescription: null,
      lineItems: [],
      buyerName: null,
      buyerEmail: null,
      buyerEmployeeId: null,
      orderLabel: null,
      pickupMode: null,
      pickupDate: null,
      pickupTime: null,
      pickupDeadline: null,
      pickupNote: null,
      denialReason: null,
      hiddenFromModerators: false,
      moderatorArchivedAt: null,
      statusHistory: [],
    }),
    hiddenFromModerators: true,
    moderatorArchivedAt: new Date().toISOString(),
  };

  const { error: metaUpsertError } = await serviceClient.from('app_settings').upsert(
    {
      key: getStoreOrderMetaKey(orderId),
      value: nextMeta,
    },
    { onConflict: 'key' },
  );

  if (metaUpsertError) {
    throw metaUpsertError;
  }

  return NextResponse.json({ success: true, archived: true });
}

