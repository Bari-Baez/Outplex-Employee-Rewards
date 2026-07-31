import 'server-only';

import { NextResponse } from 'next/server';

type JsonObject = Record<string, unknown>;

const JSON_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

export function jsonResponse(
  requestId: string,
  body: JsonObject,
  init: ResponseInit = {},
): NextResponse {
  const headers = new Headers(init.headers);
  headers.set('X-Request-ID', requestId);
  for (const [name, value] of Object.entries(JSON_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }

  return NextResponse.json(body, { ...init, headers });
}

export function errorResponse(
  requestId: string,
  status: number,
  error: string,
  extra: JsonObject = {},
): NextResponse {
  return jsonResponse(requestId, { error, ...extra }, { status });
}

export function rateLimitedResponse(requestId: string, retryAfterSeconds: number): NextResponse {
  return jsonResponse(
    requestId,
    { error: 'Too many requests. Please try again shortly.' },
    {
      status: 429,
      headers: { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds))) },
    },
  );
}

export function withRequestId<T extends Response>(response: T, requestId: string): T {
  response.headers.set('X-Request-ID', requestId);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}
