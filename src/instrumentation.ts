import type { Instrumentation } from 'next';
import { writeOperationalEvent } from '@/platform/observability/operational-events';

const SAFE_METHOD = /^(?:DELETE|GET|HEAD|OPTIONS|PATCH|POST|PUT)$/;

export function register(): void {
  writeOperationalEvent('info', 'application.server_started', {
    runtime: process.env.NEXT_RUNTIME === 'edge' ? 'edge' : 'nodejs',
  });
}

export const onRequestError: Instrumentation.onRequestError = (
  error,
  _request,
  context,
) => {
  const rawType = error instanceof Error ? error.name : 'UnknownError';
  const errorType = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(rawType) ? rawType : 'UnknownError';

  writeOperationalEvent('error', 'application.request_failed', {
    error_type: errorType,
    router_kind: context.routerKind,
    route_path: context.routePath,
    route_type: context.routeType,
    method: SAFE_METHOD.test(_request.method) ? _request.method : 'UNKNOWN',
  });
};
