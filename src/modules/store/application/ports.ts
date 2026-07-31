import type { CancelOrderInput } from '@/modules/store/contracts/orders';

export type StoreOrderMutationCode =
  | 'forbidden'
  | 'idempotency_conflict'
  | 'idempotency_in_progress'
  | 'insufficient_points'
  | 'insufficient_stock'
  | 'invalid_cart'
  | 'item_not_found'
  | 'item_unavailable'
  | 'lines_unavailable'
  | 'not_pending'
  | 'order_not_found'
  | 'unavailable'
  | 'window_expired';

export type StoreOrderMutationResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; code: StoreOrderMutationCode };

export interface StoreOrderRepository {
  checkout(input: {
    userId: string;
    cart: Array<{ itemId: string; quantity: number }>;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<StoreOrderMutationResult>;
  cancel(input: CancelOrderInput & {
    userId: string;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<StoreOrderMutationResult>;
}
