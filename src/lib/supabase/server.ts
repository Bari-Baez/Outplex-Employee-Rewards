import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getSupabaseBrowserEnv, getSupabaseServiceEnv } from './env';
import { fetchWithSupabaseDns } from './server-fetch';

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseBrowserEnv();

  return createServerClient(
    url,
    anonKey,
    {
      global: {
        fetch: fetchWithSupabaseDns,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from Server Component; safe to ignore in middleware
          }
        },
      },
    }
  );
}

export async function createServiceClient() {
  const { url, serviceRoleKey } = getSupabaseServiceEnv();

  return createSupabaseClient(
    url,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: fetchWithSupabaseDns,
        headers: {
          'X-Client-Info': 'outplex-admin',
        },
      },
    }
  );
}
