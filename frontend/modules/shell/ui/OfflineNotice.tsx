'use client';

import { CloudOff } from 'lucide-react';
import { useOnlineStatus } from '@frontend/shared/hooks/useOnlineStatus';

export function OfflineNotice() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      className="fixed inset-x-4 top-20 z-[1200] mx-auto flex max-w-xl items-center justify-center gap-2 rounded-xl border border-amber-400/30 bg-[rgba(40,28,8,0.96)] px-4 py-2.5 text-center text-sm font-semibold text-amber-100 shadow-xl backdrop-blur-lg"
      role="status"
      aria-live="polite"
    >
      <CloudOff aria-hidden="true" size={17} />
      You are offline. Some information may be out of date.
    </div>
  );
}
