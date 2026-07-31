import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFile(path.join(root, file), 'utf8');

test('store mutation endpoints and their clients share the idempotency contract', async () => {
  const [checkoutRoute, cancelRoute, checkoutClient, cancelClient] = await Promise.all([
    read('src/app/api/store/checkout/route.ts'),
    read('src/app/api/orders/cancel/route.ts'),
    read('frontend/modules/store/ui/CheckoutScreen.tsx'),
    read('frontend/modules/store/ui/OrdersClient.tsx'),
  ]);
  assert.match(checkoutRoute, /parseIdempotencyKey\(request\)/);
  assert.match(cancelRoute, /parseIdempotencyKey\(request\)/);
  assert.match(checkoutClient, /'Idempotency-Key': checkoutIdempotencyKey\.current/);
  assert.match(cancelClient, /'Idempotency-Key': `order-cancel:\$\{orderId\}`/);
  assert.match(checkoutClient, /checkoutIdempotencyKey\.current = null/);
});

test('store checkout and cancellation are database transactions with an outbox consumer', async () => {
  const [migration, checkoutRoute, cancelRoute, jobRoute, handlers] = await Promise.all([
    read('supabase/migrations/2026-07-31_integrity_platform_primitives.sql'),
    read('src/app/api/store/checkout/route.ts'),
    read('src/app/api/orders/cancel/route.ts'),
    read('src/app/api/moderator/maintenance/cleanup-logs/route.ts'),
    read('backend/modules/store/infrastructure/outbox-handlers.ts'),
  ]);
  assert.match(migration, /checkout_store_order_transactional/);
  assert.match(migration, /cancel_store_order_transactional/);
  assert.match(migration, /private\.store_order_lines/);
  assert.match(migration, /store\.order_created/);
  assert.match(migration, /store\.order_cancelled/);
  assert.doesNotMatch(checkoutRoute, /\brollback\b/i);
  assert.doesNotMatch(cancelRoute, /\.from\('store_items'\)/);
  assert.match(jobRoute, /dispatchOutboxBatch/);
  assert.match(handlers, /onConflict: 'outbox_event_id,user_id'/);
});
