import 'server-only';

import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import type { OutboxHandler } from '@/platform/integrations/outbox/dispatcher';

const orderCreatedSchema = z.object({
  orderId: z.string().uuid(),
  userId: z.string().uuid(),
  totalUnits: z.number().int().positive(),
  productCount: z.number().int().positive(),
});
const orderCancelledSchema = z.object({
  orderId: z.string().uuid(),
  userId: z.string().uuid(),
  pointsRefunded: z.number().int().nonnegative(),
});
const lowStockSchema = z.object({ orderId: z.string().uuid(), itemId: z.string().uuid() });

async function insertNotification(input: {
  eventId: string;
  userId: string;
  title: string;
  message: string;
}): Promise<void> {
  const service = await createServiceClient();
  const { error } = await service.from('notifications').upsert(
    {
      outbox_event_id: input.eventId,
      user_id: input.userId,
      title: input.title,
      message: input.message,
      type: 'store',
    },
    { onConflict: 'outbox_event_id,user_id', ignoreDuplicates: true },
  );
  if (error) throw new Error('NotificationInsertError');
}

const orderCreated: OutboxHandler = async (job) => {
  const payload = orderCreatedSchema.parse(job.payload);
  await insertNotification({
    eventId: job.id,
    userId: payload.userId,
    title: 'Store order received',
    message: `Your order with ${payload.totalUnits} item${payload.totalUnits === 1 ? '' : 's'} across ${payload.productCount} reward${payload.productCount === 1 ? '' : 's'} is now pending review. We will notify you when it is approved or ready for pickup.`,
  });
};

const orderCancelled: OutboxHandler = async (job) => {
  const payload = orderCancelledSchema.parse(job.payload);
  await insertNotification({
    eventId: job.id,
    userId: payload.userId,
    title: 'Store order cancelled',
    message: `Your order was cancelled and ${payload.pointsRefunded} points were refunded.`,
  });
};

const lowStock: OutboxHandler = async (job) => {
  const payload = lowStockSchema.parse(job.payload);
  const service = await createServiceClient();
  const [{ data: item, error: itemError }, { data: moderators, error: moderatorError }] = await Promise.all([
    service.from('store_items').select('name,stock,is_active').eq('id', payload.itemId).maybeSingle(),
    service.from('users').select('id').eq('is_approved', true).in('role', ['moderator', 'moderator_a1', 'admin']),
  ]);
  if (itemError || moderatorError) throw new Error('LowStockLookupError');
  if (!item || !item.is_active || item.stock < 0 || item.stock > 2) return;

  for (const moderator of moderators ?? []) {
    await insertNotification({
      eventId: job.id,
      userId: moderator.id,
      title: 'Low stock alert',
      message: `${item.name} has ${item.stock} unit${item.stock === 1 ? '' : 's'} remaining.`,
    });
  }
};

export const storeOutboxHandlers: Readonly<Record<string, OutboxHandler>> = {
  'store.order_created': orderCreated,
  'store.order_cancelled': orderCancelled,
  'store.low_stock': lowStock,
};
