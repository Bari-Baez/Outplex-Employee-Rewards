import 'server-only';

import { authorizeCapability } from '@backend/platform/auth/capabilities';
import { getAppOrigin } from '@backend/platform/config/server-env';
import { isSameOriginRequest } from '@backend/platform/http/redirects';
import { readJsonObject, RequestBodyError } from '@backend/platform/http/request-body';
import { errorResponse, jsonResponse, rateLimitedResponse } from '@backend/platform/http/responses';
import { notifyOtSlotsPublished, type OtSlotsNotification } from '@backend/platform/integrations/slack/notify';
import { getRequestId, logServerError } from '@backend/platform/observability/request-context';
import { consumeRateLimit } from '@backend/platform/security/rate-limit';

export const runtime = 'nodejs';

function parseNotification(value: Record<string, unknown>): OtSlotsNotification | null {
  const batchName = value.batchName === undefined
    ? 'New OT Batch'
    : typeof value.batchName === 'string'
      ? value.batchName.trim()
      : '';
  const slotsCount = typeof value.slotsCount === 'number' ? value.slotsCount : Number.NaN;
  const firstDate = typeof value.firstDate === 'string' ? value.firstDate.trim() : '';
  const lastDate = typeof value.lastDate === 'string' ? value.lastDate.trim() : '';

  if (!batchName || batchName.length > 120) return null;
  if (!Number.isSafeInteger(slotsCount) || slotsCount < 1 || slotsCount > 100_000) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDate) || !/^\d{4}-\d{2}-\d{2}$/.test(lastDate)) return null;
  return { batchName, slotsCount, firstDate, lastDate };
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    if (!isSameOriginRequest(request, getAppOrigin())) {
      return errorResponse(requestId, 403, 'Forbidden');
    }

    const auth = await authorizeCapability('slack:notify');
    if (!auth.ok) return errorResponse(requestId, auth.status, auth.error);

    const rateLimit = await consumeRateLimit({
      scope: 'slack:notify',
      subject: auth.profile.id,
      limit: 10,
      windowSeconds: 60,
      requestId,
    });
    if (!rateLimit.allowed) return rateLimitedResponse(requestId, rateLimit.retryAfterSeconds);

    const payload = parseNotification(await readJsonObject(request, 8 * 1024));
    if (!payload) {
      return errorResponse(requestId, 400, 'Invalid notification payload');
    }

    const result = await notifyOtSlotsPublished(payload);
    return jsonResponse(requestId, { ok: true, ...result });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return errorResponse(requestId, error.status, error.publicMessage);
    }
    logServerError('slack.notify', requestId, error);
    return errorResponse(requestId, 502, 'Slack notification failed');
  }
}
