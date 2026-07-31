import 'server-only';

import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import type { StoreOrderMutationResult, StoreOrderRepository } from '@/modules/store/application/ports';

const resultSchema = z.union([
  z.object({ ok: z.literal(true), data: z.record(z.string(), z.unknown()) }),
  z.object({
    ok: z.literal(false),
    code: z.enum([
      'forbidden',
      'idempotency_conflict',
      'idempotency_in_progress',
      'insufficient_points',
      'insufficient_stock',
      'invalid_cart',
      'item_not_found',
      'item_unavailable',
      'lines_unavailable',
      'not_pending',
      'order_not_found',
      'window_expired',
    ]),
  }),
]);

function normalize(data: unknown, error: unknown): StoreOrderMutationResult {
  if (error) return { ok: false, code: 'unavailable' };
  const parsed = resultSchema.safeParse(data);
  return parsed.success ? parsed.data : { ok: false, code: 'unavailable' };
}

export function createSupabaseStoreOrderRepository(): StoreOrderRepository {
  return {
    async checkout(input) {
      const service = await createServiceClient();
      const { data, error } = await service.rpc('checkout_store_order_transactional', {
        p_user_id: input.userId,
        p_cart: input.cart,
        p_idempotency_key: input.idempotencyKey,
        p_request_hash: input.requestHash,
      });
      return normalize(data, error);
    },
    async cancel(input) {
      const service = await createServiceClient();
      const { data, error } = await service.rpc('cancel_store_order_transactional', {
        p_user_id: input.userId,
        p_order_id: input.orderId,
        p_idempotency_key: input.idempotencyKey,
        p_request_hash: input.requestHash,
      });
      return normalize(data, error);
    },
  };
}
