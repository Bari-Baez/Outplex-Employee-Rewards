import 'server-only';

import { readBodyBytes, RequestBodyError } from '@backend/platform/http/request-body';
import { errorResponse, rateLimitedResponse, withRequestId } from '@backend/platform/http/responses';
import { getRequestId, logServerError } from '@backend/platform/observability/request-context';
import { writeOperationalEvent } from '@backend/platform/observability/operational-events';
import { consumeRateLimit } from '@backend/platform/security/rate-limit';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 32 * 1024;
const SAFE_TOKEN = /^[a-z0-9 -]{1,100}$/i;

type CspSummary = {
  directive: string;
  disposition: string;
  statusCode: number;
};

function safeToken(value: unknown, fallback: string): string {
  return typeof value === 'string' && SAFE_TOKEN.test(value) ? value : fallback;
}

function normalizeReport(value: unknown): CspSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const outer = value as Record<string, unknown>;
  const raw = outer['csp-report'] ?? outer.body ?? outer;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const report = raw as Record<string, unknown>;
  const rawStatus = report['status-code'] ?? report.statusCode;
  const statusCode = typeof rawStatus === 'number' && Number.isInteger(rawStatus)
    ? Math.min(599, Math.max(0, rawStatus))
    : 0;

  return {
    directive: safeToken(report['effective-directive'] ?? report.effectiveDirective, 'unknown'),
    disposition: safeToken(report.disposition, 'unknown'),
    statusCode,
  };
}

function parseReports(bytes: Uint8Array): CspSummary[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  const candidates = Array.isArray(parsed) ? parsed.slice(0, 20) : [parsed];
  const reports = candidates.map(normalizeReport).filter((report): report is CspSummary => report !== null);
  return reports.length > 0 ? reports : null;
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (!['application/csp-report', 'application/json', 'application/reports+json'].includes(contentType ?? '')) {
      return errorResponse(requestId, 415, 'Unsupported report content type.');
    }

    const rateLimit = await consumeRateLimit({
      scope: 'observability:csp-report',
      subject: 'public',
      limit: 600,
      windowSeconds: 60,
      requestId,
    });
    if (!rateLimit.allowed) return rateLimitedResponse(requestId, rateLimit.retryAfterSeconds);

    const reports = parseReports(await readBodyBytes(request, MAX_BODY_BYTES));
    if (!reports) return errorResponse(requestId, 400, 'Invalid CSP report.');

    for (const report of reports) {
      writeOperationalEvent('warn', 'security.csp_violation', {
        directive: report.directive,
        disposition: report.disposition,
        status_code: report.statusCode,
      });
    }

    return withRequestId(new Response(null, { status: 204 }), requestId);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return errorResponse(requestId, error.status, error.publicMessage);
    }
    logServerError('api.observability.csp_report', requestId, error);
    return errorResponse(requestId, 500, 'Unable to accept CSP report.');
  }
}
