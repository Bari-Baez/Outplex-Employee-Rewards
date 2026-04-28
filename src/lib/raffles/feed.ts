import { type Raffle, type ApiResponse } from '@/types/database';
import {
  buildRaffleViewModel,
  type RaffleRuntimeState,
  type RaffleViewModel,
} from './runtime';

export type RaffleFeedFilter = 'everything' | 'upcoming' | 'live' | 'past';

interface RaffleFeedItem {
  raffle: Raffle;
  runtime: RaffleRuntimeState | null;
}

export const RAFFLE_FEED_FILTERS: Array<{
  value: RaffleFeedFilter;
  label: string;
}> = [
  { value: 'everything', label: 'Everything' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'live', label: 'Live' },
  { value: 'past', label: 'Past' },
];

export function sortRaffles(left: RaffleViewModel, right: RaffleViewModel) {
  const rank = (item: RaffleViewModel) => {
    if (item.raffle.status === 'live') return 0;
    if (item.raffle.status === 'upcoming') return 1;
    return 2;
  };

  const diff = rank(left) - rank(right);
  if (diff !== 0) return diff;

  if (left.raffle.status === 'completed' && right.raffle.status === 'completed') {
    return new Date(right.raffle.created_at).getTime() - new Date(left.raffle.created_at).getTime();
  }

  return (
    new Date(left.raffle.draw_date ?? left.raffle.created_at).getTime() -
    new Date(right.raffle.draw_date ?? right.raffle.created_at).getTime()
  );
}

export function filterRaffles(raffles: RaffleViewModel[], filter: RaffleFeedFilter) {
  if (filter === 'everything') {
    return raffles;
  }

  return raffles.filter((item) => {
    if (filter === 'past') {
      return item.raffle.status === 'completed';
    }

    return item.raffle.status === filter;
  });
}

export async function fetchRaffleFeed() {
  const response = await fetch('/api/raffles', {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = (await response.json()) as ApiResponse<RaffleFeedItem[]>;
  if (!response.ok || !payload.data) {
    throw new Error(payload.error ?? 'Unable to load raffles.');
  }

  return payload.data
    .map((item) => buildRaffleViewModel(item.raffle, item.runtime))
    .sort(sortRaffles);
}

export async function syncRaffleFeed() {
  const response = await fetch('/api/raffles/sync', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = (await response.json()) as ApiResponse<RaffleFeedItem[]>;
  if (!response.ok || !payload.data) {
    throw new Error(payload.error ?? 'Unable to sync raffles.');
  }

  return payload.data
    .map((item) => buildRaffleViewModel(item.raffle, item.runtime))
    .sort(sortRaffles);
}

export async function pruneExpiredRaffleRecords() {
  const response = await fetch('/api/raffles', {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = (await response.json()) as ApiResponse<{ deletedCount: number }>;
  if (!response.ok || !payload.data) {
    throw new Error(payload.error ?? 'Unable to delete old raffle records.');
  }

  return payload.data.deletedCount;
}
