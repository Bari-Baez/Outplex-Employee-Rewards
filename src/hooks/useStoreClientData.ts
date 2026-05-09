'use client';

import useSWR from 'swr';

export type StoreClientDataResponse = {
  favoriteItemIds: string[];
  summary: Record<string, { avg: number; count: number }>;
};

export function useStoreClientData(enabled: boolean) {
  return useSWR<StoreClientDataResponse>(enabled ? '/api/store/client-data' : null, {
    refreshInterval: 60_000,
    refreshWhenHidden: false,
  });
}

export function useStoreFavorites(enabled: boolean) {
  return useSWR<Pick<StoreClientDataResponse, 'favoriteItemIds'>>(
    enabled ? '/api/store/client-data' : null,
    {
      refreshInterval: 60_000,
      refreshWhenHidden: false,
    },
  );
}

export function useStoreReviewSummary(enabled: boolean) {
  return useSWR<Pick<StoreClientDataResponse, 'summary'>>(
    enabled ? '/api/store/client-data' : null,
    {
      refreshInterval: 60_000,
      refreshWhenHidden: false,
    },
  );
}
