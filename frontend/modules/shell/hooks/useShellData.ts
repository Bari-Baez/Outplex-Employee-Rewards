'use client';

import useSWR from 'swr';
import type { Notification, SupportTicket, User } from '@shared/contracts/database';

export type ShellNotification = Notification & {
  sender?: Pick<User, 'id' | 'name' | 'avatar_url' | 'role'> | null;
};

export type ShellSharedSnapshot = {
  availableOtCount: number;
  firstAvailableSlot: {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    shift_label: string | null;
  } | null;
  liveRaffle: {
    id: string;
    title: string | null;
    draw_date: string | null;
    status: string;
  } | null;
  upcomingRaffle: {
    id: string;
    title: string | null;
    draw_date: string | null;
    status: string;
  } | null;
};

export type ShellDataResponse = {
  notifications: ShellNotification[];
  tickets: SupportTicket[];
  pointsBalance: number;
  shared: ShellSharedSnapshot;
};

export function useShellData(enabled: boolean) {
  return useSWR<ShellDataResponse>(enabled ? '/api/dashboard/shell' : null, {
    refreshInterval: 20_000,
    refreshWhenHidden: false,
  });
}
