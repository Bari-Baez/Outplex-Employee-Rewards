import 'server-only';

import { timingSafeEqual } from 'node:crypto';
import { authorizeCapability } from '@/platform/auth/capabilities';
import { getAppOrigin, getOptionalServerEnv } from '@/platform/config/server-env';
import { isSameOriginRequest } from '@/platform/http/redirects';
import { errorResponse, jsonResponse, rateLimitedResponse } from '@/platform/http/responses';
import { runPlatformMaintenance } from '@/platform/jobs/maintenance';
import { dispatchOutboxBatch } from '@/platform/integrations/outbox/dispatcher';
import { getRequestId, logServerError } from '@/platform/observability/request-context';
import { consumeRateLimit } from '@/platform/security/rate-limit';
import { storeOutboxHandlers } from '@/modules/store/infrastructure/outbox-handlers';

export const runtime = 'nodejs';

function hasValidCronCredential(request: Request): boolean {
  const expected = getOptionalServerEnv('CRON_SECRET');
  const authorization = request.headers.get('authorization');
  if (!expected || !authorization?.startsWith('Bearer ')) return false;
  const supplied = authorization.slice('Bearer '.length);
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    const cronAuthorized = hasValidCronCredential(request);
    let subject = 'scheduled-job';
    if (!cronAuthorized) {
      if (!isSameOriginRequest(request, getAppOrigin())) {
        return errorResponse(requestId, 403, 'Forbidden');
      }
      const authorization = await authorizeCapability('jobs:maintenance');
      if (!authorization.ok) {
        return errorResponse(requestId, authorization.status, authorization.error);
      }
      subject = authorization.profile.id;
    }

    const rateLimit = await consumeRateLimit({
      scope: 'jobs:platform-maintenance',
      subject,
      limit: 2,
      windowSeconds: 3_600,
      requestId,
    });
    if (!rateLimit.allowed) return rateLimitedResponse(requestId, rateLimit.retryAfterSeconds);

    const outbox = await dispatchOutboxBatch({
      workerId: `maintenance:${requestId}`,
      handlers: storeOutboxHandlers,
      limit: 50,
    });
    const purged = await runPlatformMaintenance(1_000);
    return jsonResponse(requestId, {
      message: 'Bounded platform maintenance completed.',
      purged,
      outbox,
    });
  } catch (error) {
    logServerError('api.jobs.platform_maintenance', requestId, error);
    return errorResponse(requestId, 500, 'Platform maintenance failed.');
  }
}
