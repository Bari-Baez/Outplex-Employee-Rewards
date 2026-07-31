import { createBrowserClient } from '@supabase/ssr';
import { createBrowserSupabaseFetch } from '@frontend/platform/supabase/browser-fetch';
import { createRecoveringSupabaseStorage } from '@frontend/platform/supabase/browser-session';
import { getSupabaseBrowserEnv } from '@frontend/platform/supabase/env';

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
