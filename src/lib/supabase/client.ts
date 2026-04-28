import { createBrowserClient } from '@supabase/ssr';
import { createBrowserSupabaseFetch } from './browser-fetch';
import { createRecoveringSupabaseStorage } from './browser-session';
import { getSupabaseBrowserEnv } from './env';

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (browserClient) {
    return browserClient;
  }

  const { url, anonKey } = getSupabaseBrowserEnv();
  const proxiedFetch = createBrowserSupabaseFetch(url);

  browserClient = createBrowserClient(
    url,
    anonKey,
    {
      global: {
        fetch: proxiedFetch,
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storage: createRecoveringSupabaseStorage(url, anonKey, proxiedFetch),
      },
    },
  );

  return browserClient;
}
