'use client';

import type { ReactNode } from 'react';
import { cn } from '@frontend/shared/lib/cn';

type SectionTone = 'default' | 'danger' | 'warning' | 'success';

export interface SectionJumpNavItem {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: number | string | null;
  tone?: SectionTone;
  disabled?: boolean;
}

const TONE_STYLES: Record<SectionTone, string> = {
  default: 'border-white/10 bg-white/[0.03] text-slate-200',
  danger: 'border-red-400/25 bg-red-500/10 text-red-200',
  warning: 'border-amber-400/25 bg-amber-500/10 text-amber-100',
  success: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100',
};

interface SectionJumpNavProps {
  items: SectionJumpNavItem[];
  activeId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
}

export function SectionJumpNav({
  items,
  activeId,
  onSelect,
  className,
}: SectionJumpNavProps) {
  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        'flex gap-2 overflow-x-auto rounded-[20px] border border-white/10 bg-[rgba(10,14,28,0.58)] px-2 py-2 backdrop-blur-xl scrollbar-none',
        className,
      )}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            onClick={() => onSelect?.(item.id)}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-left text-[0.78rem] font-semibold transition',
              isActive
                ? 'border-violet-400/40 bg-violet-500/18 text-white shadow-[0_10px_24px_rgba(99,102,241,0.25)]'
                : TONE_STYLES[item.tone ?? 'default'],
              item.disabled ? 'cursor-not-allowed opacity-45' : 'hover:-translate-y-0.5 hover:border-violet-400/30 hover:text-white',
            )}
          >
            {item.icon ? (
              <span className="flex h-4 w-4 items-center justify-center text-current/90">
                {item.icon}
              </span>
            ) : null}
            <span className="whitespace-nowrap">{item.label}</span>
            {item.badge !== undefined && item.badge !== null && item.badge !== '' ? (
              <span
                className={cn(
                  'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[0.68rem] font-bold',
                  isActive
                    ? 'bg-white/18 text-white'
                    : item.tone === 'danger'
                      ? 'bg-red-400/18 text-red-100'
                      : item.tone === 'warning'
                        ? 'bg-amber-400/18 text-amber-100'
                        : item.tone === 'success'
                          ? 'bg-emerald-400/18 text-emerald-100'
                          : 'bg-white/12 text-slate-200',
                )}
              >
                {item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
