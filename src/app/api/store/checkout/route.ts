import 'server-only';

import { createServiceClient } from '@backend/platform/supabase/server';
import { enforceSectionAvailability } from '@backend/modules/shell/application/section-guard';
import type { StoreOrderMutationCode } from '@backend/modules/store/application/ports';
import { checkoutInputSchema, normalizeCheckoutCart } from '@backend/modules/store/contracts/orders';
import { createSupabaseStoreOrderRepository } from '@backend/modules/store/infrastructure/supabase-store-order-repository';
import { authorizeCapability } from '@backend/platform/auth/capabilities';
import { getAppOrigin } from '@backend/platform/config/server-env';
import { hashIdempotentRequest, parseIdempotencyKey } from '@backend/platform/idempotency/guard';
import { isSameOriginRequest } from '@backend/platform/http/redirects';
import { readJsonObject, RequestBodyError } from '@backend/platform/http/request-body';
import { errorResponse, jsonResponse, rateLimitedResponse, withRequestId } from '@backend/platform/http/responses';
import { getRequestId, logServerError } from '@backend/platform/observability/request-context';
import { consumeRateLimit } from '@backend/platform/security/rate-limit';

const ERRORS: Record<StoreOrderMutationCode, { status: number; message: string }> = {
  forbidden: { status: 403, message: 'Forbidden' },
  idempotency_conflict: { status: 409, message: 'This idempotency key was used for a different request.' },
  idempotency_in_progress: { status: 409, message: 'This checkout is already being processed.' },
  insufficient_points: { status: 400, message: 'You do not have enough points for this order.' },
  insufficient_stock: { status: 409, message: 'Stock changed while you were checking out. Please review your cart.' },
  invalid_cart: { status: 400, message: 'Your cart is invalid.' },
  item_not_found: { status: 400, message: 'One of the selected items no longer exists.' },
  item_unavailable: { status: 400, message: 'One of the selected items is not available right now.' },
  lines_unavailable: { status: 409, message: 'Order line details are unavailable.' },
  not_pending: { status: 409, message: 'Only pending orders can be changed.' },
  order_not_found: { status: 404, message: 'Order not found.' },
  unavailable: { status: 503, message: 'Checkout is temporarily unavailable.' },
  window_expired: { status: 409, message: 'The cancellation window has expired.' },
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
      scope: 'store:checkout', subject: auth.profile.id, limit: 10, windowSeconds: 60, requestId,
    });
    if (!rate.allowed) return rateLimitedResponse(requestId, rate.retryAfterSeconds);

    const parsed = checkoutInputSchema.safeParse(await readJsonObject(request, 64 * 1024));
    if (!parsed.success) return errorResponse(requestId, 400, 'Your cart is invalid.');
    let cart: Array<{ itemId: string; quantity: number }>;
    try {
      cart = normalizeCheckoutCart(parsed.data);
    } catch {
      return errorResponse(requestId, 400, 'Your cart is invalid.');
    }

    const service = await createServiceClient();
    const maintenance = await enforceSectionAvailability({
      serviceClient: service,
      toolKey: 'store', sectionKey: 'checkout', userRole: auth.profile.role, bypassForAdmin: true,
    });
    if (maintenance) return withRequestId(maintenance, requestId);

    const requestHash = hashIdempotentRequest(new TextEncoder().encode(JSON.stringify(cart)));
    const result = await createSupabaseStoreOrderRepository().checkout({
      userId: auth.profile.id, cart, idempotencyKey: key, requestHash,
    });
    if (!result.ok) {
      const failure = ERRORS[result.code];
      return errorResponse(requestId, failure.status, failure.message);
    }
    return jsonResponse(requestId, result.data);
  } catch (error) {
    if (error instanceof RequestBodyError) return errorResponse(requestId, error.status, error.publicMessage);
    logServerError('api.store.checkout', requestId, error);
    return errorResponse(requestId, 500, 'Unable to complete checkout.');
  }
}
