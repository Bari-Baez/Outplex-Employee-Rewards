import type { ReactNode } from 'react';

interface SystemStateProps {
  eyebrow: string;
  title: string;
  description: string;
  icon: ReactNode;
  actions: ReactNode;
  referenceCode?: string;
}

export function SystemState({
  eyebrow,
  title,
  description,
  icon,
  actions,
  referenceCode,
}: SystemStateProps) {
  return (
    <main className="relative isolate grid min-h-[100dvh] place-items-center overflow-hidden bg-[var(--bg-base)] px-6 py-16 text-[var(--text-primary)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_20%,rgba(99,102,241,0.18),transparent_42%)]"
      />
      <section
        aria-labelledby="system-state-title"
        className="w-full max-w-xl rounded-3xl border border-[var(--border-default)] bg-[var(--bg-card)] p-7 shadow-[var(--shadow-premium)] backdrop-blur-xl sm:p-10"
      >
        <div className="mb-6 inline-flex size-12 items-center justify-center rounded-2xl border border-[rgba(129,140,248,0.3)] bg-[rgba(99,102,241,0.12)] text-[var(--brand-primary-light)]">
          {icon}
        </div>
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--brand-primary-light)]">
          {eyebrow}
        </p>
        <h1 id="system-state-title" className="m-0 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="mt-4 max-w-lg text-base leading-7 text-[var(--text-secondary)]">
          {description}
        </p>
        {referenceCode && (
          <p className="mt-4 text-xs text-[var(--text-muted)]">
            Reference code: <code className="font-mono">{referenceCode}</code>
          </p>
        )}
        <div className="mt-8 flex flex-wrap gap-3">{actions}</div>
      </section>
    </main>
  );
}
