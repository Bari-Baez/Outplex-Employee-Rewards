'use client';

import { useMemo, useState } from 'react';
import { BellRing, CalendarClock, PackageOpen, UserRoundCheck } from 'lucide-react';
import type { BroadcastNotification } from '@/types/database';
import { formatCommunicationDate, getBroadcastCategoryLabel, getCommunicationDateKey } from '@/lib/communications';

type CategoryFilter = 'all' | 'availability' | 'stock' | 'site_visit' | 'general';

export function NotificationsCenterClient({
  initialBroadcasts,
}: {
  initialBroadcasts: BroadcastNotification[];
}) {
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const todayKey = getCommunicationDateKey(new Date());

  const filteredBroadcasts = useMemo(
    () =>
      initialBroadcasts.filter((item) => {
        if (filter === 'all') return true;
        return item.category === filter;
      }),
    [filter, initialBroadcasts],
  );

  const stats = useMemo(() => {
    const todayItems = initialBroadcasts.filter((item) => item.publish_at && getCommunicationDateKey(item.publish_at) === todayKey);
    return {
      today: todayItems.length,
      latest: initialBroadcasts[0]?.publish_at ?? null,
      availability: initialBroadcasts.filter((item) => item.category === 'availability').length,
      stock: initialBroadcasts.filter((item) => item.category === 'stock').length,
    };
  }, [initialBroadcasts, todayKey]);

  return (
    <div className="notifications-shell">
      <section className="notifications-hero card animate-fade-in">
        <div>
          <div className="notifications-kicker">Communications</div>
          <h1 className="notifications-title">Company Notifications</h1>
          <p className="notifications-subtitle">
            A focused feed for quick updates about availability, stock refreshes, and in-person visits.
          </p>
        </div>
        <div className="notifications-summary-grid">
          <div className="notifications-summary-card">
            <BellRing size={16} />
            <strong>{stats.today}</strong>
            <span>Published today</span>
          </div>
          <div className="notifications-summary-card">
            <UserRoundCheck size={16} />
            <strong>{stats.availability}</strong>
            <span>Availability notices</span>
          </div>
          <div className="notifications-summary-card">
            <PackageOpen size={16} />
            <strong>{stats.stock}</strong>
            <span>Stock updates</span>
          </div>
          <div className="notifications-summary-card">
            <CalendarClock size={16} />
            <strong>{stats.latest ? formatCommunicationDate(stats.latest, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'None'}</strong>
            <span>Latest post</span>
          </div>
        </div>
      </section>

      <section className="card animate-fade-in delay-100">
        <div className="notifications-toolbar">
          <div>
            <h2 className="notifications-section-title">Latest feed</h2>
            <p className="notifications-section-copy">Up to three company-wide broadcasts can go out each day.</p>
          </div>
          <div className="notifications-filter-row">
            {(['all', 'availability', 'stock', 'site_visit', 'general'] as const).map((entry) => (
              <button
                key={entry}
                type="button"
                className={`notifications-filter-chip ${filter === entry ? 'notifications-filter-chip-active' : ''}`}
                onClick={() => setFilter(entry)}
              >
                {entry === 'all' ? 'All' : getBroadcastCategoryLabel(entry)}
              </button>
            ))}
          </div>
        </div>

        {filteredBroadcasts.length === 0 ? (
          <div className="notifications-empty">
            <BellRing size={20} />
            <span>No notifications in this category yet.</span>
          </div>
        ) : (
          <div className="notifications-feed">
            {filteredBroadcasts.map((broadcast, index) => (
              <article key={broadcast.id} className={`notification-card animate-slide-up delay-${Math.min((index + 1) * 100, 500)}`}>
                <div className="notification-card-head">
                  <div className={`notification-card-pill notification-card-pill-${broadcast.category}`}>
                    {getBroadcastCategoryLabel(broadcast.category)}
                  </div>
                  <span className="notification-card-date">{formatCommunicationDate(broadcast.publish_at ?? broadcast.created_at)}</span>
                </div>
                <h3 className="notification-card-title">{broadcast.title}</h3>
                <p className="notification-card-message">{broadcast.message}</p>
                <div className="notification-card-meta">
                  <span>{broadcast.author?.name ?? 'Outplex moderator'}</span>
                  <span>{broadcast.sent_at ? 'Delivered to all employees' : 'Pending delivery'}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <style>{`
        .notifications-shell {
          display: grid;
          gap: 1.35rem;
        }

        .notifications-hero {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(360px, 0.9fr);
          gap: 1.25rem;
          background:
            radial-gradient(circle at top left, rgba(34, 211, 238, 0.16), transparent 32%),
            radial-gradient(circle at bottom right, rgba(99, 102, 241, 0.18), transparent 28%),
            linear-gradient(145deg, rgba(11, 14, 28, 0.98), rgba(18, 23, 43, 0.92));
        }

        .notifications-kicker {
          font-size: 0.72rem;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #67e8f9;
          font-weight: 700;
          margin-bottom: 0.55rem;
        }

        .notifications-title {
          margin: 0;
          font-size: clamp(2rem, 3.2vw, 3rem);
          line-height: 1;
          letter-spacing: -0.04em;
        }

        .notifications-subtitle {
          margin: 0.85rem 0 0;
          max-width: 56ch;
          color: var(--text-secondary);
        }

        .notifications-summary-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.9rem;
        }

        .notifications-summary-card {
          min-height: 122px;
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.07);
          background: rgba(255, 255, 255, 0.04);
          padding: 1rem;
          display: grid;
          align-content: space-between;
          gap: 0.5rem;
        }

        .notifications-summary-card svg {
          color: #93c5fd;
        }

        .notifications-summary-card strong {
          font-size: 1.05rem;
          color: var(--text-primary);
        }

        .notifications-summary-card span {
          color: var(--text-secondary);
          font-size: 0.83rem;
        }

        .notifications-toolbar {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
          margin-bottom: 1rem;
          flex-wrap: wrap;
        }

        .notifications-section-title {
          margin: 0;
          font-size: 1.05rem;
        }

        .notifications-section-copy {
          margin: 0.35rem 0 0;
          color: var(--text-muted);
          font-size: 0.85rem;
        }

        .notifications-filter-row {
          display: flex;
          gap: 0.6rem;
          flex-wrap: wrap;
        }

        .notifications-filter-chip {
          border-radius: 999px;
          border: 1px solid var(--border-subtle);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-secondary);
          padding: 0.55rem 0.85rem;
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.2s ease, border-color 0.2s ease, color 0.2s ease;
        }

        .notifications-filter-chip:hover,
        .notifications-filter-chip-active {
          transform: translateY(-1px);
          border-color: rgba(34, 211, 238, 0.28);
          color: var(--text-primary);
        }

        .notifications-feed {
          display: grid;
          gap: 0.9rem;
        }

        .notification-card {
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background:
            linear-gradient(145deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.015)),
            linear-gradient(120deg, rgba(10, 14, 28, 0.98), rgba(19, 24, 42, 0.94));
          padding: 1.1rem 1.15rem;
        }

        .notification-card-head,
        .notification-card-meta {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          align-items: center;
          flex-wrap: wrap;
        }

        .notification-card-pill {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 0.36rem 0.78rem;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          border: 1px solid transparent;
        }

        .notification-card-pill-availability {
          background: rgba(16, 185, 129, 0.12);
          border-color: rgba(16, 185, 129, 0.26);
          color: #6ee7b7;
        }

        .notification-card-pill-stock {
          background: rgba(59, 130, 246, 0.12);
          border-color: rgba(59, 130, 246, 0.26);
          color: #93c5fd;
        }

        .notification-card-pill-site_visit {
          background: rgba(249, 115, 22, 0.12);
          border-color: rgba(249, 115, 22, 0.26);
          color: #fdba74;
        }

        .notification-card-pill-general {
          background: rgba(124, 108, 255, 0.12);
          border-color: rgba(124, 108, 255, 0.26);
          color: #c4b5fd;
        }

        .notification-card-date,
        .notification-card-meta {
          color: var(--text-muted);
          font-size: 0.8rem;
        }

        .notification-card-title {
          margin: 0.85rem 0 0.45rem;
          font-size: 1.1rem;
          letter-spacing: -0.02em;
        }

        .notification-card-message {
          margin: 0;
          color: var(--text-secondary);
          line-height: 1.65;
        }

        .notification-card-meta {
          margin-top: 1rem;
        }

        .notifications-empty {
          display: inline-flex;
          align-items: center;
          gap: 0.65rem;
          color: var(--text-muted);
        }

        @media (max-width: 980px) {
          .notifications-hero {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .notifications-summary-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
