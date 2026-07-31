import { getSupabaseServerEnv } from '@backend/platform/supabase/env.server';
import { fetchWithSupabaseDns } from '@backend/platform/supabase/server-fetch';
import { createClient } from '@backend/platform/supabase/server';

export const runtime = 'nodejs';

type ProxyContext = {
  params: Promise<{
    supabasePath: string[];
  }>;
};

async function forwardRequest(request: Request, context: ProxyContext) {
  const { supabasePath } = await context.params;
  const pathStr = supabasePath.join('/');

  // Auth endpoints must be allowed through unauthenticated (login flow).
  // All other Supabase API paths require a valid session.
  if (!pathStr.startsWith('auth/v1/')) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  const { url } = getSupabaseServerEnv();
  const upstreamUrl = new URL(url);
  const incomingUrl = new URL(request.url);

  upstreamUrl.pathname = `/${supabasePath.join('/')}`;
  upstreamUrl.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  headers.delete('host');

  const method = request.method.toUpperCase();
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();

  const upstreamResponse = await fetchWithSupabaseDns(upstreamUrl.toString(), {
    method,
    headers,
    body,
    redirect: 'manual',
  });

  return new Response(await upstreamResponse.arrayBuffer(), {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: new Headers(upstreamResponse.headers),
  });
}

export async function GET(request: Request, context: ProxyContext) {
  return forwardRequest(request, context);
}

export async function POST(request: Request, context: ProxyContext) {
  return forwardRequest(request, context);
}

export async function PUT(request: Request, context: ProxyContext) {
  return forwardRequest(request, context);
}

export async function PATCH(request: Request, context: ProxyContext) {
  return forwardRequest(request, context);
}

export async function DELETE(request: Request, context: ProxyContext) {
  return forwardRequest(request, context);
}

export async function OPTIONS(request: Request, context: ProxyContext) {
  return forwardRequest(request, context);
}

export async function HEAD(request: Request, context: ProxyContext) {
  return forwardRequest(request, context);
}
