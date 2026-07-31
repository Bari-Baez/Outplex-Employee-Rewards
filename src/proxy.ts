import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isAllowedMutationOrigin(request: NextRequest) {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site') {
    return false;
  }

  const origin = request.headers.get('origin');
  if (!origin) {
    return true;
  }

  const allowedOrigins = new Set([request.nextUrl.origin]);
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL;
  if (configuredOrigin) {
    try {
      allowedOrigins.add(new URL(configuredOrigin).origin);
    } catch {
      // Invalid deployment configuration fails closed for cross-origin mutations.
    }
  }

  return allowedOrigins.has(origin);
}

export async function proxy(request: NextRequest) {
  const requestId = crypto.randomUUID();

  if (
    request.nextUrl.pathname.startsWith('/api/') &&
    STATE_CHANGING_METHODS.has(request.method) &&
    !isAllowedMutationOrigin(request)
  ) {
    return NextResponse.json(
      { error: 'Cross-origin request rejected.' },
      { status: 403, headers: { 'X-Request-ID': requestId } },
    );
  }

  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set('x-request-id', requestId);

  const { supabaseResponse } = await updateSession(request, forwardedHeaders);
  supabaseResponse.headers.set('X-Request-ID', requestId);
  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
