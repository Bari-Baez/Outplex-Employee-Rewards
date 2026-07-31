import 'server-only';

import { authorizeCapability } from '@backend/platform/auth/capabilities';
import { getAppOrigin, getMediaProxyAllowedHosts } from '@backend/platform/config/server-env';
import { isSameOriginRequest } from '@backend/platform/http/redirects';
import { fetchSafeBytes, SafeFetchError } from '@backend/platform/http/safe-fetch';
import { errorResponse, rateLimitedResponse } from '@backend/platform/http/responses';
import { getRequestId, logServerError } from '@backend/platform/observability/request-context';
import { consumeRateLimit } from '@backend/platform/security/rate-limit';

export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_URL_LENGTH = 4_096;

function getSafeRangeHeader(request: Request): string | null {
  const range = request.headers.get('range');
  if (!range) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match || (!match[1] && !match[2])) return null;
  return range.trim();
}

function isAllowedMediaType(contentType: string): boolean {
  const mime = contentType.split(';', 1)[0].trim().toLowerCase();
  if (mime === 'image/svg+xml') return false;
  return mime.startsWith('image/')
    || mime.startsWith('audio/')
    || mime.startsWith('video/')
    || mime === 'application/pdf'
    || mime === 'application/octet-stream';
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  if (!isSameOriginRequest(request, getAppOrigin())) {
    return errorResponse(requestId, 403, 'Forbidden');
  }
  const auth = await authorizeCapability('media:proxy');
  if (!auth.ok) return errorResponse(requestId, auth.status, auth.error);

  const rateLimit = await consumeRateLimit({
    scope: 'media:proxy',
    subject: auth.profile.id,
    limit: 120,
    windowSeconds: 60,
    requestId,
  });
  if (!rateLimit.allowed) return rateLimitedResponse(requestId, rateLimit.retryAfterSeconds);

  const rawUrl = new URL(request.url).searchParams.get('url');
  if (!rawUrl) return errorResponse(requestId, 400, 'Missing url param.');
  if (rawUrl.length > MAX_URL_LENGTH) return errorResponse(requestId, 400, 'Invalid url.');

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return errorResponse(requestId, 400, 'Invalid url.');
  }

  const requestedRange = request.headers.has('range') ? getSafeRangeHeader(request) : null;
  if (request.headers.has('range') && !requestedRange) {
    return errorResponse(requestId, 416, 'Invalid range.');
  }

  try {
    const upstream = await fetchSafeBytes(target, {
      headers: requestedRange ? { Range: requestedRange, Accept: 'image/*,audio/*,video/*,application/pdf' } : {
        Accept: 'image/*,audio/*,video/*,application/pdf',
      },
      maxBytes: MAX_BYTES,
      maxRedirects: 3,
      timeoutMs: 20_000,
      allowedHosts: getMediaProxyAllowedHosts(),
    });

    const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
    if (!isAllowedMediaType(contentType)) {
      return errorResponse(requestId, 415, 'Unsupported upstream media type.');
    }

    const headers = new Headers({
      'Cache-Control': 'private, max-age=86400',
      'Content-Length': String(upstream.bytes.byteLength),
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'X-Request-ID': requestId,
    });

    if (upstream.headers.get('accept-ranges')?.toLowerCase() === 'bytes') {
      headers.set('Accept-Ranges', 'bytes');
    }
    const contentRange = upstream.headers.get('content-range');
    if (contentRange && /^bytes \d+-\d+\/(?:\d+|\*)$/.test(contentRange)) {
      headers.set('Content-Range', contentRange);
    }

    const body = new Uint8Array(upstream.bytes.byteLength);
    body.set(upstream.bytes);
    return new Response(body.buffer, { status: upstream.status, headers });
  } catch (error) {
    if (error instanceof SafeFetchError) {
      if (error.failure === 'size') return errorResponse(requestId, 413, 'File too large.');
      if (error.failure === 'timeout') return errorResponse(requestId, 504, 'Upstream request timed out.');
      if (error.failure === 'blocked' || error.failure === 'invalid') {
        return errorResponse(requestId, 400, 'Blocked url.');
      }
      return errorResponse(requestId, 502, 'Unable to retrieve upstream media.');
    }

    logServerError('media.proxy', requestId, error);
    return errorResponse(requestId, 502, 'Unable to retrieve upstream media.');
  }
}
