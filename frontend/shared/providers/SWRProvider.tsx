'use client';

import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';
import { fetchJson } from '@frontend/shared/lib/http-client';

export function AppSWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: fetchJson,
        dedupingInterval: 15_000,
        focusThrottleInterval: 10_000,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        keepPreviousData: true,
        shouldRetryOnError: false,
      }}
    >
      {children}
    </SWRConfig>
  );
}
