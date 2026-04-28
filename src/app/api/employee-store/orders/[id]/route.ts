import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

type AllowedStatus = 'ready_for_pickup' | 'completed' | 'cancelled';

interface StatusHistoryEntry {
  status: string;
  at: string;
  note?: string | null;
  updatedBy?: string | null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const service = await createServiceClient();
  const { id: orderId } = await params;
  const body = (await request.json()) as {
    status?: AllowedStatus;
    pickupMode?: 'immediate' | 'scheduled' | null;
    pickupAt?: string | null;
    pickupDeadline?: string | null;
    pickupNote?: string | null;
  };

  if (!orderId || !body.status) {
    return NextResponse.json({ error: 'Missing orderId or status.' }, { status: 400 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: existingOrder, error: fetchError } = await service
    .from('employee_store_orders')
    .select('id, store_id, buyer_id, status, status_history')
    .eq('id', orderId)
    .single();

  if (fetchError || !existingOrder) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  const { data: store } = await service
    .from('employee_stores')
    .select('id, owner_id')
    .eq('id', existingOrder.store_id)
    .single();

  if (!store || store.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (body.status === 'completed' && existingOrder.status !== 'ready_for_pickup') {
    return NextResponse.json(
      { error: 'Only orders ready for pickup can be completed.' },
      { status: 409 },
    );
  }

  if (body.status === 'ready_for_pickup' && existingOrder.status !== 'pending') {
    return NextResponse.json(
      { error: 'Only pending orders can be marked as ready for pickup.' },
      { status: 409 },
    );
  }

  if (body.status === 'cancelled' && !['pending', 'ready_for_pickup'].includes(existingOrder.status)) {
    return NextResponse.json(
      { error: 'Only pending or ready-for-pickup orders can be cancelled.' },
      { status: 409 },
    );
  }

  const statusHistory: StatusHistoryEntry[] = Array.isArray(existingOrder.status_history)
    ? (existingOrder.status_history as StatusHistoryEntry[])
    : [];

  const patch: Record<string, unknown> = {
    status: body.status,
    status_history: [
      ...statusHistory,
      {
        status: body.status,
        at: new Date().toISOString(),
        note: body.pickupNote ?? null,
        updatedBy: user.id,
      } satisfies StatusHistoryEntry,
    ],
  };

  if (body.status === 'ready_for_pickup') {
    if (body.pickupMode !== 'immediate' && body.pickupMode !== 'scheduled') {
      return NextResponse.json(
        { error: 'Pickup mode must be immediate or scheduled.' },
        { status: 400 },
      );
    }

    patch.pickup_mode = body.pickupMode;
    patch.pickup_at = body.pickupMode === 'scheduled' ? body.pickupAt ?? null : null;
    patch.pickup_deadline = body.pickupMode === 'scheduled' ? body.pickupDeadline ?? null : null;
    patch.pickup_note = body.pickupNote ?? null;

    if (body.pickupMode === 'scheduled' && (!body.pickupAt || !body.pickupDeadline)) {
      return NextResponse.json(
        { error: 'Scheduled pickup requires both pickup date/time and deadline.' },
        { status: 400 },
      );
    }

    if (body.pickupMode === 'scheduled' && body.pickupAt && body.pickupDeadline) {
      const pickupAtTime = new Date(body.pickupAt).getTime();
      const pickupDeadlineTime = new Date(body.pickupDeadline).getTime();
      if (!Number.isFinite(pickupAtTime) || !Number.isFinite(pickupDeadlineTime)) {
        return NextResponse.json(
          { error: 'Invalid pickup date/time values.' },
          { status: 400 },
        );
      }
      if (pickupDeadlineTime <= pickupAtTime) {
        return NextResponse.json(
          { error: 'Pickup deadline must be later than pickup date/time.' },
          { status: 400 },
        );
      }
    }
  }

  if (body.status === 'cancelled') {
    patch.pickup_mode = null;
    patch.pickup_at = null;
    patch.pickup_deadline = null;
  }

  const { data: updatedOrder, error: updateError } = await service
    .from('employee_store_orders')
    .update(patch)
    .eq('id', orderId)
    .select(`
      *,
      items:employee_store_order_items(*),
      buyer:users!employee_store_orders_buyer_id_fkey(id, name, email, avatar_url)
    `)
    .single();

  if (updateError || !updatedOrder) {
    return NextResponse.json({ error: updateError?.message ?? 'Unable to update order.' }, { status: 500 });
  }

  let title = 'Order update';
  let message = 'Your employee-store order was updated.';

  if (body.status === 'ready_for_pickup') {
    title = 'Order ready for pickup';
    message =
      body.pickupMode === 'scheduled' && body.pickupAt
        ? `Your order is ready. Pickup is scheduled for ${new Date(body.pickupAt).toLocaleString()}.`
        : 'Your order is ready for immediate pickup.';
  } else if (body.status === 'completed') {
    title = 'Order completed';
    message = 'Your order was marked as completed by the store owner.';
  } else if (body.status === 'cancelled') {
    title = 'Order cancelled';
    message = 'This order was cancelled by the store owner.';
  }

  await service.from('notifications').insert({
    user_id: updatedOrder.buyer_id,
    title,
    message,
    type: 'store',
    is_read: false,
  });

  return NextResponse.json({ order: updatedOrder });
}
