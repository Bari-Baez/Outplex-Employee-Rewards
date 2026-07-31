import 'server-only';

import { authorizeCapability } from '@backend/platform/auth/capabilities';
import { getAppOrigin } from '@backend/platform/config/server-env';
import { isSameOriginRequest } from '@backend/platform/http/redirects';
import { readJsonObject, RequestBodyError } from '@backend/platform/http/request-body';
import { errorResponse, jsonResponse } from '@backend/platform/http/responses';
import { getRequestId, logServerError } from '@backend/platform/observability/request-context';
import { consumeRateLimit } from '@backend/platform/security/rate-limit';
import { unclaimOtSlot } from '@backend/modules/ot/application/claim-slot';
import type { OtMutationCode } from '@backend/modules/ot/application/ports';
import { unclaimOtSlotInputSchema } from '@backend/modules/ot/contracts/claim';
import { createSupabaseOtClaimRepository } from '@backend/modules/ot/infrastructure/supabase-ot-claim-repository';

const MAX_BODY_BYTES = 8 * 1024;

const ERRORS: Record<OtMutationCode, { status: number; message: string }> = {
  claim_changed: { status: 409, message: 'This OT slot changed while it was being released.' },
  daily_claim_exists: { status: 409, message: 'An OT scheduling conflict was detected.' },
  forbidden: { status: 403, message: 'Forbidden' },
  invalid_claim_kind: { status: 400, message: 'Invalid OT request.' },
  not_claimed: { status: 409, message: 'This OT slot is no longer claimed.' },
  not_owner: { status: 403, message: 'You can only release your own OT slot.' },
  slot_not_found: { status: 404, message: 'Slot not found.' },
  slot_unavailable: { status: 409, message: 'This OT slot is unavailable.' },
  unclaim_window_expired: { status: 409, message: 'The 20-minute unclaim window has already expired.' },
  unavailable: { status: 503, message: 'OT service is temporarily unavailable.' },
};

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    if (!isSameOriginRequest(request, getAppOrigin())) {
      return errorResponse(requestId, 403, 'Forbidden');
    }

    const authorization = await authorizeCapability('ot:claim');
    if (!authorization.ok) {
      return errorResponse(requestId, authorization.status, authorization.error);
    }

    const rateLimit = await consumeRateLimit({
      scope: 'ot:unclaim',
      subject: authorization.profile.id,
      limit: 10,
      windowSeconds: 60,
      requestId,
    });
    if (!rateLimit.allowed) {
      return jsonResponse(
        requestId,
        { error: 'Too many requests. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
      );
    }

    const parsed = unclaimOtSlotInputSchema.safeParse(await readJsonObject(request, MAX_BODY_BYTES));
    if (!parsed.success) {
      return errorResponse(requestId, 400, 'Invalid OT release request.');
    }

    const result = await unclaimOtSlot(
      createSupabaseOtClaimRepository(),
      authorization.profile.id,
      parsed.data,
    );
    if (!result.ok) {
      const failure = ERRORS[result.code];
      return errorResponse(requestId, failure.status, failure.message);
    }

    return jsonResponse(requestId, { data: result.slot, message: 'OT slot released successfully.' });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return errorResponse(requestId, error.status, error.publicMessage);
    }
    logServerError('api.ot.unclaim', requestId, error);
    return errorResponse(requestId, 500, 'Unable to release the OT slot.');
  }
}
