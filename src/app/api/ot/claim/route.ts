import 'server-only';

import { authorizeCapability } from '@/platform/auth/capabilities';
import { getAppOrigin } from '@/platform/config/server-env';
import { isSameOriginRequest } from '@/platform/http/redirects';
import { readJsonObject, RequestBodyError } from '@/platform/http/request-body';
import { errorResponse, jsonResponse } from '@/platform/http/responses';
import { getRequestId, logServerError } from '@/platform/observability/request-context';
import { consumeRateLimit } from '@/platform/security/rate-limit';
import { claimOtSlot } from '@/modules/ot/application/claim-slot';
import type { OtMutationCode } from '@/modules/ot/application/ports';
import { claimOtSlotInputSchema } from '@/modules/ot/contracts/claim';
import { createSupabaseOtClaimRepository } from '@/modules/ot/infrastructure/supabase-ot-claim-repository';

const MAX_BODY_BYTES = 8 * 1024;

const ERRORS: Record<OtMutationCode, { status: number; message: string }> = {
  claim_changed: { status: 409, message: 'This slot changed while it was being claimed. Please try another.' },
  daily_claim_exists: { status: 409, message: 'Only one OT slot per day is allowed.' },
  forbidden: { status: 403, message: 'Forbidden' },
  invalid_claim_kind: { status: 400, message: 'Select a valid OT type.' },
  not_claimed: { status: 409, message: 'This OT slot is not claimed.' },
  not_owner: { status: 403, message: 'You can only change your own OT slot.' },
  slot_not_found: { status: 404, message: 'Slot not found.' },
  slot_unavailable: { status: 409, message: 'This slot has already been claimed. Please select another one.' },
  unclaim_window_expired: { status: 409, message: 'The OT release window has expired.' },
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
      scope: 'ot:claim',
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

    const parsed = claimOtSlotInputSchema.safeParse(await readJsonObject(request, MAX_BODY_BYTES));
    if (!parsed.success) {
      return errorResponse(requestId, 400, 'Invalid OT claim request.');
    }

    const result = await claimOtSlot(
      createSupabaseOtClaimRepository(),
      authorization.profile.id,
      parsed.data,
    );
    if (!result.ok) {
      const failure = ERRORS[result.code];
      return errorResponse(requestId, failure.status, failure.message);
    }

    return jsonResponse(requestId, { data: result.slot, message: 'Slot claimed successfully!' });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return errorResponse(requestId, error.status, error.publicMessage);
    }
    logServerError('api.ot.claim', requestId, error);
    return errorResponse(requestId, 500, 'Unable to claim the OT slot.');
  }
}
