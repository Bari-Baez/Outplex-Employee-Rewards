import 'server-only';

import { randomUUID } from 'node:crypto';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function getRequestId(request: Request): string {
  const supplied = request.headers.get('x-request-id')?.trim();
  return supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID();
}

export function logServerError(scope: string, requestId: string, error: unknown): void {
  const rawType = error instanceof Error ? error.name : 'UnknownError';
  const errorType = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(rawType) ? rawType : 'UnknownError';
  console.error(`[${scope}] request_id=${requestId} error_type=${errorType}`);
}
