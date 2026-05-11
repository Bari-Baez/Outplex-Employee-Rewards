'use client';

import type { CSSProperties, ReactNode } from 'react';

interface StickyActionBarProps {
  summary?: ReactNode;
  actions: ReactNode;
  mobileActions?: ReactNode;
  topOffset?: string;
  bottomOffset?: string;
  className?: string;
  showDesktop?: boolean;
  showMobile?: boolean;
}

export function StickyActionBar({
  summary,
  actions,
  mobileActions,
  topOffset = 'calc(env(safe-area-inset-top) + 5rem)',
  bottomOffset = 'calc(env(safe-area-inset-bottom) + 5.25rem)',
  className = '',
  showDesktop = true,
  showMobile = true,
}: StickyActionBarProps) {
  const desktopStyle = { top: topOffset } as CSSProperties;
  const mobileStyle = { bottom: bottomOffset } as CSSProperties;

  return (
    <>
      {showDesktop ? (
        <div
          className={`hidden md:flex sticky z-30 items-center justify-between gap-3 rounded-[22px] border border-white/10 bg-[rgba(10,14,28,0.88)] px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl ${className}`}
          style={desktopStyle}
        >
          <div className="min-w-0 flex-1">{summary}</div>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      ) : null}

      {showMobile ? (
        <div
          className="md:hidden fixed left-1/2 z-[260] flex w-[min(94vw,720px)] -translate-x-1/2 items-center justify-between gap-3 rounded-[22px] border border-white/10 bg-[rgba(10,14,28,0.94)] px-3 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.42)] backdrop-blur-xl"
          style={mobileStyle}
        >
          <div className="min-w-0 flex-1">{summary}</div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            {mobileActions ?? actions}
          </div>
        </div>
      ) : null}
    </>
  );
}
