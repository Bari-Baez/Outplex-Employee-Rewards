import type { ReactNode } from 'react';
import { AlertTriangle, CloudOff, Inbox, LoaderCircle, LockKeyhole } from 'lucide-react';

export type AsyncStateKind = 'loading' | 'empty' | 'error' | 'forbidden' | 'offline';

const DEFAULTS: Record<AsyncStateKind, { title: string; description: string; icon: ReactNode }> = {
  loading: {
    title: 'Loading',
    description: 'Please wait while the latest information is retrieved.',
    icon: <LoaderCircle aria-hidden="true" className="animate-spin" size={22} />,
  },
  empty: {
    title: 'Nothing here yet',
    description: 'New items will appear here when they become available.',
    icon: <Inbox aria-hidden="true" size={22} />,
  },
  error: {
    title: 'Unable to load this section',
    description: 'Try again. If the problem continues, contact IT support.',
    icon: <AlertTriangle aria-hidden="true" size={22} />,
  },
  forbidden: {
    title: 'Access restricted',
    description: 'Your account does not have permission to view this section.',
    icon: <LockKeyhole aria-hidden="true" size={22} />,
  },
  offline: {
    title: 'You are offline',
    description: 'Reconnect to the internet to load current information.',
    icon: <CloudOff aria-hidden="true" size={22} />,
  },
};

interface AsyncStateProps {
  kind: AsyncStateKind;
  title?: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function AsyncState({
  kind,
  title,
  description,
  action,
  compact = false,
  className = '',
}: AsyncStateProps) {
  const defaults = DEFAULTS[kind];
  const isUrgent = kind === 'error' || kind === 'forbidden' || kind === 'offline';

  return (
    <section
      className={`grid place-items-center rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] text-center ${compact ? 'min-h-40 p-5' : 'min-h-72 p-8'} ${className}`}
      role={isUrgent ? 'alert' : 'status'}
      aria-live={isUrgent ? 'assertive' : 'polite'}
      aria-busy={kind === 'loading'}
    >
      <div className="max-w-md">
        <div className="mx-auto mb-4 grid size-11 place-items-center rounded-xl border border-[var(--border-default)] bg-[var(--glass-bg)] text-[var(--brand-primary-light)]">
          {defaults.icon}
        </div>
        <h2 className="m-0 text-lg font-bold text-[var(--text-primary)]">{title ?? defaults.title}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          {description ?? defaults.description}
        </p>
        {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
      </div>
    </section>
  );
}
