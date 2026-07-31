import 'server-only';

import type { StoreOrderMutationCode } from '@backend/modules/store/application/ports';
import { cancelOrderInputSchema } from '@backend/modules/store/contracts/orders';
import { createSupabaseStoreOrderRepository } from '@backend/modules/store/infrastructure/supabase-store-order-repository';
import { authorizeCapability } from '@backend/platform/auth/capabilities';
import { getAppOrigin } from '@backend/platform/config/server-env';
import { hashIdempotentRequest, parseIdempotencyKey } from '@backend/platform/idempotency/guard';
import { isSameOriginRequest } from '@backend/platform/http/redirects';
import { readJsonObject, RequestBodyError } from '@backend/platform/http/request-body';
import { errorResponse, jsonResponse, rateLimitedResponse } from '@backend/platform/http/responses';
import { getRequestId, logServerError } from '@backend/platform/observability/request-context';
import { consumeRateLimit } from '@backend/platform/security/rate-limit';

const ERRORS: Record<StoreOrderMutationCode, { status: number; message: string }> = {
  forbidden: { status: 403, message: 'Forbidden' },
  idempotency_conflict: { status: 409, message: 'This idempotency key was used for a different request.' },
  idempotency_in_progress: { status: 409, message: 'This cancellation is already being processed.' },
  insufficient_points: { status: 409, message: 'Unable to refund this order.' },
  insufficient_stock: { status: 409, message: 'Unable to restore order stock.' },
  invalid_cart: { status: 400, message: 'Invalid order request.' },
  item_not_found: { status: 409, message: 'An order item no longer exists.' },
  item_unavailable: { status: 409, message: 'An order item is unavailable.' },
  lines_unavailable: { status: 409, message: 'Order line details are unavailable.' },
  not_pending: { status: 400, message: 'Only pending orders can be cancelled.' },
  order_not_found: { status: 404, message: 'Order not found.' },
  unavailable: { status: 503, message: 'Order cancellation is temporarily unavailable.' },
  window_expired: { status: 400, message: 'The 5-minute cancellation window has expired.' },
};

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    if (!isSameOriginRequest(request, getAppOrigin())) return errorResponse(requestId, 403, 'Forbidden');
    const auth = await authorizeCapability('store:checkout');
    if (!auth.ok) return errorResponse(requestId, auth.status, auth.error);
    const key = parseIdempotencyKey(request);
    if (!key) return errorResponse(requestId, 400, 'A valid Idempotency-Key header is required.');

    const rate = await consumeRateLimit({
      scope: 'store:cancel', subject: auth.profile.id, limit: 10, windowSeconds: 60, requestId,
    });
    if (!rate.allowed) return rateLimitedResponse(requestId, rate.retryAfterSeconds);

    const parsed = cancelOrderInputSchema.safeParse(await readJsonObject(request, 8 * 1024));
    if (!parsed.success) return errorResponse(requestId, 400, 'Invalid order cancellation request.');
    const requestHash = hashIdempotentRequest(new TextEncoder().encode(JSON.stringify(parsed.data)));
    const result = await createSupabaseStoreOrderRepository().cancel({
      userId: auth.profile.id,
      orderId: parsed.data.orderId,
      idempotencyKey: key,
      requestHash,
    });
    if (!result.ok) {
      const failure = ERRORS[result.code];
      return errorResponse(requestId, failure.status, failure.message);
    }
    return jsonResponse(requestId, result.data);
  } catch (error) {
    if (error instanceof RequestBodyError) return errorResponse(requestId, error.status, error.publicMessage);
    logServerError('api.orders.cancel', requestId, error);
    return errorResponse(requestId, 500, 'Unable to cancel the order.');
  }
}
