/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Megaphone,
  Newspaper,
  Search,
  ShieldCheck,
  TimerReset,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { CompanyAnnouncement, EmployeeAnnouncement, Notification, User } from '@shared/contracts/database';
import { announcementDurationLabel, formatCommunicationDate } from '@backend/modules/communications/domain/announcements';
import { countAnnouncementAssets, normalizeAnnouncementBlocks } from '@backend/modules/communications/domain/announcements';
import { createClient } from '@frontend/platform/supabase/client';
import { formatRelativeTime } from '@shared/utils/format';
import { proxifyMediaUrl } from '@frontend/shared/lib/media-proxy';

type NotificationWithSender = Notification & {
  sender?: Pick<User, 'id' | 'name' | 'avatar_url' | 'role'> | null;
};

export function AnnouncementsHubClient({
  initialCompanyAnnouncements,
  initialEmployeeAnnouncements,
  initialNotifications,
  initialMutedSenders,
  isStoreOwner,
}: {
  initialCompanyAnnouncements: CompanyAnnouncement[];
  initialEmployeeAnnouncements: EmployeeAnnouncement[];
  initialNotifications: NotificationWithSender[];
  initialMutedSenders: Array<Pick<User, 'id' | 'name' | 'avatar_url' | 'role'>>;
  isStoreOwner: boolean;
}) {
  const [supabase] = useState(() => createClient());
  const searchParams = useSearchParams();
  const [activeView, setActiveView] = useState<'announcements' | 'notifications'>(
    () => (searchParams.get('tab') === 'notifications' ? 'notifications' : 'announcements'),
  );
  const [query, setQuery] = useState('');
  const [notifications, setNotifications] = useState<NotificationWithSender[]>(initialNotifications);
  const [mutedSenders, setMutedSenders] = useState(initialMutedSenders);

  const companyAnnouncements = useMemo(
    () =>
      initialCompanyAnnouncements
        .map((item) => ({ ...item, content: normalizeAnnouncementBlocks(item.content) }))
        .filter((item) =>
          `${item.title} ${item.excerpt ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()),
        ),
    [initialCompanyAnnouncements, query],
  );

  const employeeAnnouncements = useMemo(
    () =>
      initialEmployeeAnnouncements
        .map((item) => ({ ...item, content: normalizeAnnouncementBlocks(item.content) }))
        .filter((item) =>
          `${item.title} ${item.excerpt ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()),
        ),
    [initialEmployeeAnnouncements, query],
  );

  const filteredNotifications = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notifications;
    return notifications.filter((n) => `${n.title} ${n.message ?? ''}`.toLowerCase().includes(q));
  }, [notifications, query]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications]);
  const featuredAnnouncement = companyAnnouncements[0] ?? null;

  useEffect(() => {
    if (activeView !== 'notifications') return;
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    void (async () => {
      const result = await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
      if (!result.error) {
        setNotifications((current) => current.map((n) => (unreadIds.includes(n.id) ? { ...n, is_read: true } : n)));
      }
    })();
  }, [activeView, notifications, supabase]);

  const clearAllNotifications = async () => {
    const response = await fetch('/api/notifications', { method: 'DELETE' });
    if (response.ok) {
      setNotifications([]);
    }
  };

  const muteSender = async (senderId: string) => {
    const response = await fetch('/api/notifications/mutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderId }),
    });

    if (!response.ok) return;

    const sender = notifications.find((n) => n.sender?.id === senderId)?.sender ?? null;
    if (sender) {
      setMutedSenders((current) => (current.some((s) => s.id === sender.id) ? current : [sender, ...current]));
    }
    setNotifications((current) => current.filter((n) => n.sender?.id !== senderId));
  };

  const unmuteSender = async (senderId: string) => {
    const response = await fetch(`/api/notifications/mutes/${senderId}`, { method: 'DELETE' });
    if (!response.ok) return;
    setMutedSenders((current) => current.filter((s) => s.id !== senderId));
  };

  return (
    <div className="announcements-shell">
      <section className="announcements-hero card animate-fade-in">
        <div className="announcements-hero-copy">
          <div className="announcements-kicker">Company feed</div>
          <h1 className="announcements-title">Announcements</h1>
          <p className="announcements-subtitle">
            Company updates + employee storefront promos, plus your personal notifications history.
          </p>
        </div>

        <div className="announcements-tab-row">
          <button
            type="button"
            className={`announcements-tab-chip ${activeView === 'announcements' ? 'announcements-tab-chip-active' : ''}`}
            onClick={() => setActiveView('announcements')}
          >
            <Megaphone size={15} />
            Anuncios
          </button>
          <button
            type="button"
            className={`announcements-tab-chip ${activeView === 'notifications' ? 'announcements-tab-chip-active' : ''}`}
            onClick={() => setActiveView('notifications')}
          >
            <Bell size={15} />
            Notificaciones
            {unreadCount > 0 ? (
              <span className="announcements-tab-count">{unreadCount > 99 ? '99+' : unreadCount}</span>
            ) : null}
          </button>
        </div>

        <label className="announcements-search">
          <Search size={16} />
          <input
            className="input"
            placeholder={activeView === 'notifications' ? 'Search notifications' : 'Search announcements'}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </section>

      {activeView === 'announcements' ? (
        <>
          {featuredAnnouncement ? (
            <Link
              href={`/announcements/${featuredAnnouncement.id}`}
              className="featured-announcement card animate-fade-in delay-100"
            >
              <div className="featured-announcement-copy">
                <span className="featured-announcement-pill">
                  <ShieldCheck size={14} />
                  Empresa
                </span>
                <h2>{featuredAnnouncement.title}</h2>
                <p>{featuredAnnouncement.excerpt || 'Open the full announcement to read the complete update.'}</p>
                <div className="featured-announcement-meta">
                  <span>
                    <CalendarDays size={14} />{' '}
                    {formatCommunicationDate(featuredAnnouncement.publish_at ?? featuredAnnouncement.created_at)}
                  </span>
                  <span>
                    <TimerReset size={14} /> Expires after {announcementDurationLabel(featuredAnnouncement.duration_days)}
                  </span>
                </div>
              </div>
              <div className="featured-announcement-cover">
                {featuredAnnouncement.cover_image_url ? (
                  <img src={proxifyMediaUrl(featuredAnnouncement.cover_image_url)} alt={featuredAnnouncement.title} />
                ) : (
                  <div className="featured-announcement-cover-empty">
                    <Newspaper size={24} />
                  </div>
                )}
              </div>
            </Link>
          ) : null}

          <section className="announcements-section">
            <div className="announcements-section-head">
              <h2>
                <ShieldCheck size={16} /> Anuncios de la empresa
              </h2>
              {isStoreOwner ? (
                <Link href="/moderator/communications/notifications" className="btn btn-ghost btn-sm">
                  Crear anuncio / notificación
                  <ArrowRight size={14} />
                </Link>
              ) : null}
            </div>

            <div className="announcements-grid">
              {companyAnnouncements.length === 0 ? (
                <div className="card announcements-empty">
                  <Newspaper size={18} />
                  <span>No announcements match your search yet.</span>
                </div>
              ) : (
                companyAnnouncements.map((announcement, index) => {
                  const assetSummary = countAnnouncementAssets(announcement.content);
                  return (
                    <Link
                      key={announcement.id}
                      href={`/announcements/${announcement.id}`}
                      className={`announcement-card card animate-slide-up delay-${Math.min((index + 1) * 100, 500)}`}
                    >
                      <div className="announcement-card-cover">
                        {announcement.cover_image_url ? (
                          <img src={proxifyMediaUrl(announcement.cover_image_url)} alt={announcement.title} />
                        ) : (
                          <div className="announcement-card-cover-empty">
                            <Newspaper size={22} />
                          </div>
                        )}
                      </div>
                      <div className="announcement-card-body">
                        <div className="announcement-card-topline">
                          <span className="announcement-pill announcement-pill-company">
                            <ShieldCheck size={13} /> Empresa
                          </span>
                        </div>
                        <div className="announcement-card-headline">
                          <h3>{announcement.title}</h3>
                          <ArrowRight size={16} />
                        </div>
                        <p>{announcement.excerpt || 'Open the announcement to see the full story and attached media.'}</p>
                        <div className="announcement-card-footer">
                          <span>
                            {formatCommunicationDate(announcement.publish_at ?? announcement.created_at, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                          <span>
                            {assetSummary.images + assetSummary.slides} media assets · {assetSummary.pdfs} PDFs
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </section>

          <section className="announcements-section">
            <div className="announcements-section-head">
              <div>
                <h2>
                  <Megaphone size={16} /> Anuncios de empleados
                </h2>
                <div className="announcements-section-sub">Promos y actualizaciones de tiendas (no prioritarias).</div>
              </div>
            </div>

            <div className="announcements-grid">
              {employeeAnnouncements.length === 0 ? (
                <div className="card announcements-empty">
                  <Megaphone size={18} />
                  <span>No employee announcements yet.</span>
                </div>
              ) : (
                employeeAnnouncements.map((announcement, index) => {
                  const assetSummary = countAnnouncementAssets(announcement.content);
                  return (
                    <Link
                      key={announcement.id}
                      href={`/announcements/${announcement.id}?scope=employee`}
                      className={`announcement-card card animate-slide-up delay-${Math.min((index + 1) * 100, 500)}`}
                    >
                      <div className="announcement-card-cover">
                        {announcement.cover_image_url ? (
                          <img src={proxifyMediaUrl(announcement.cover_image_url)} alt={announcement.title} />
                        ) : (
                          <div className="announcement-card-cover-empty">
                            <Newspaper size={22} />
                          </div>
                        )}
                      </div>
                      <div className="announcement-card-body">
                        <div className="announcement-card-topline">
                          <span className="announcement-pill announcement-pill-employee">
                            <Megaphone size={13} /> Empleado
                          </span>
                        </div>
                        <div className="announcement-card-headline">
                          <h3>{announcement.title}</h3>
                          <ArrowRight size={16} />
                        </div>
                        <p>{announcement.excerpt || 'Open the post to see the full story and attached media.'}</p>
                        <div className="announcement-card-footer">
                          <span>
                            {formatCommunicationDate(announcement.publish_at ?? announcement.created_at, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                          <span>
                            {assetSummary.images + assetSummary.slides} media assets · {assetSummary.pdfs} PDFs
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </section>
        </>
      ) : (
        <section className="card announcements-notifications animate-fade-in delay-100">
          <div className="notifications-head">
            <div>
              <h2>Notificaciones</h2>
              <p>
                Aquí ves todo lo que has recibido. Al abrir esta sección, se marcan como vistas y desaparece la bolita
                azul.
              </p>
            </div>
            <div className="notifications-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void clearAllNotifications()}
                disabled={notifications.length === 0}
              >
                Clear all
              </button>
            </div>
          </div>

          {mutedSenders.length > 0 ? (
            <div className="muted-senders">
              <div className="muted-senders-title">
                <VolumeX size={14} /> Silenciados
              </div>
              <div className="muted-senders-row">
                {mutedSenders.map((sender) => (
                  <button
                    key={sender.id}
                    type="button"
                    className="muted-sender-chip"
                    onClick={() => void unmuteSender(sender.id)}
                  >
                    {sender.name}
                    <span className="muted-sender-chip-x">Unmute</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="notifications-list">
            {filteredNotifications.length === 0 ? (
              <div className="notifications-empty">
                <Bell size={18} />
                <span>No notifications yet.</span>
              </div>
            ) : (
              filteredNotifications.map((n) => {
                const sender = n.sender ?? null;
                const canMuteSender = sender?.role === 'employee';

                return (
                  <article key={n.id} className={`notification-row ${n.is_read ? '' : 'notification-row-unread'}`}>
                    <div className="notification-main">
                      <div className="notification-title-row">
                        <div className="notification-title">
                          {!n.is_read ? <span className="notification-unread-dot" aria-label="Unread" /> : null}
                          <span>{n.title}</span>
                        </div>
                        <span className="notification-time">{formatRelativeTime(n.created_at)}</span>
                      </div>

                      {sender ? (
                        <div className="notification-sender">
                          {sender.role !== 'employee' ? (
                            <span className="notification-sender-pill notification-sender-pill-company">
                              <ShieldCheck size={13} /> Empresa
                            </span>
                          ) : (
                            <span className="notification-sender-pill notification-sender-pill-employee">
                              <Megaphone size={13} /> {sender.name}
                            </span>
                          )}
                        </div>
                      ) : null}

                      {n.message ? <p className="notification-message">{n.message}</p> : null}
                    </div>

                    <div className="notification-side">
                      {canMuteSender ? (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void muteSender(sender!.id)}>
                          <Volume2 size={14} />
                          Silenciar
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      )}

      <style>{`
        .announcements-shell {
          display: grid;
          gap: 1.35rem;
        }

        .announcements-hero {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-end;
          flex-wrap: wrap;
          background:
            radial-gradient(circle at top right, rgba(6, 182, 212, 0.12), transparent 32%),
            radial-gradient(circle at bottom left, rgba(249, 115, 22, 0.14), transparent 30%),
            linear-gradient(155deg, rgba(10, 14, 28, 0.98), rgba(23, 28, 48, 0.92));
        }

        .announcements-kicker {
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #fdba74;
          margin-bottom: 0.5rem;
        }

        .announcements-title {
          margin: 0;
          font-size: clamp(2rem, 3vw, 2.8rem);
          line-height: 1;
          letter-spacing: -0.04em;
        }

        .announcements-subtitle {
          margin: 0.8rem 0 0;
          color: var(--text-secondary);
          max-width: 54ch;
        }

        .announcements-search {
          display: flex;
          align-items: center;
          gap: 0.7rem;
          min-width: min(100%, 320px);
          color: var(--text-muted);
        }

        .announcements-tab-row {
          display: flex;
          gap: 0.7rem;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
        }

        .announcements-tab-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          border-radius: 999px;
          padding: 0.55rem 0.9rem;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          color: var(--text-secondary);
          font-weight: 700;
          cursor: pointer;
          transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
        }

        .announcements-tab-chip:hover {
          transform: translateY(-1px);
          border-color: rgba(99, 102, 241, 0.22);
        }

        .announcements-tab-chip-active {
          background: rgba(99, 102, 241, 0.16);
          border-color: rgba(99, 102, 241, 0.26);
          color: var(--text-primary);
        }

        .announcements-tab-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 22px;
          height: 22px;
          padding: 0 8px;
          border-radius: 999px;
          font-size: 0.75rem;
          font-weight: 900;
          background: rgba(59, 130, 246, 0.22);
          border: 1px solid rgba(59, 130, 246, 0.28);
          color: #bfdbfe;
        }

        .featured-announcement {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
          gap: 1rem;
          text-decoration: none;
          color: inherit;
          overflow: hidden;
        }

        .featured-announcement-copy {
          display: grid;
          gap: 0.9rem;
          align-content: center;
        }

        .featured-announcement-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          width: fit-content;
          border-radius: 999px;
          padding: 0.4rem 0.8rem;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          background: rgba(251, 191, 36, 0.12);
          color: #fcd34d;
          border: 1px solid rgba(251, 191, 36, 0.22);
        }

        .featured-announcement-copy h2 {
          margin: 0;
          font-size: clamp(1.6rem, 2.3vw, 2.4rem);
          letter-spacing: -0.04em;
        }

        .featured-announcement-copy p {
          margin: 0;
          color: var(--text-secondary);
          line-height: 1.7;
        }

        .featured-announcement-meta {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          color: var(--text-muted);
          font-size: 0.82rem;
        }

        .featured-announcement-meta span {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
        }

        .featured-announcement-cover {
          border-radius: 22px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
        }

        .featured-announcement-cover img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .featured-announcement-cover {
          min-height: 320px;
        }

        .featured-announcement-cover-empty,
        .announcement-card-cover-empty {
          width: 100%;
          height: 100%;
          min-height: 220px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          background: linear-gradient(145deg, rgba(17, 24, 39, 0.96), rgba(30, 41, 59, 0.88));
        }

        .announcements-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1rem;
        }

        .announcements-section {
          display: grid;
          gap: 0.8rem;
        }

        .announcements-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .announcements-section-head h2 {
          margin: 0;
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          font-size: 1rem;
          letter-spacing: -0.02em;
        }

        .announcements-section-sub {
          color: var(--text-muted);
          font-size: 0.85rem;
          margin-top: 0.35rem;
        }

        .announcements-empty {
          display: inline-flex;
          align-items: center;
          gap: 0.7rem;
          color: var(--text-muted);
          padding: 1rem;
          border-radius: 16px;
          border: 1px dashed rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.03);
        }

        .announcement-card {
          text-decoration: none;
          color: inherit;
          padding: 0;
        }

        .announcement-card-cover {
          border-top-left-radius: 22px;
          border-top-right-radius: 22px;
          border-bottom-left-radius: 0;
          border-bottom-right-radius: 0;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
        }

        .announcement-card-cover img {
          width: 100%;
          height: 210px;
          object-fit: cover;
          display: block;
        }

        .announcement-card-body {
          padding: 1rem 1.05rem 1.1rem;
          display: grid;
          gap: 0.6rem;
        }

        .announcement-card-headline {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.85rem;
        }

        .announcement-card-headline h3 {
          margin: 0;
          font-size: 1.05rem;
          letter-spacing: -0.03em;
        }

        .announcement-card-body p {
          margin: 0;
          color: var(--text-secondary);
          line-height: 1.65;
        }

        .announcement-card-footer {
          display: flex;
          justify-content: space-between;
          gap: 0.9rem;
          flex-wrap: wrap;
          color: var(--text-muted);
          font-size: 0.8rem;
        }

        .announcement-card-topline {
          display: flex;
          justify-content: flex-start;
          margin-bottom: 0.65rem;
        }

        .announcement-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          border-radius: 999px;
          padding: 0.35rem 0.7rem;
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .announcement-pill-company {
          background: rgba(59, 130, 246, 0.12);
          border: 1px solid rgba(59, 130, 246, 0.22);
          color: #bfdbfe;
        }

        .announcement-pill-employee {
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.2);
          color: #bbf7d0;
        }

        .announcements-notifications {
          background:
            radial-gradient(circle at top left, rgba(59, 130, 246, 0.12), transparent 35%),
            radial-gradient(circle at bottom right, rgba(124, 58, 237, 0.14), transparent 35%),
            linear-gradient(155deg, rgba(10, 14, 28, 0.98), rgba(17, 22, 40, 0.94));
        }

        .notifications-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
          margin-bottom: 1rem;
        }

        .notifications-head h2 {
          margin: 0;
          letter-spacing: -0.03em;
        }

        .notifications-head p {
          margin: 0.5rem 0 0;
          color: var(--text-secondary);
          max-width: 70ch;
          line-height: 1.65;
        }

        .notifications-actions {
          display: flex;
          gap: 0.7rem;
          align-items: center;
        }

        .notifications-list {
          display: grid;
          gap: 0.85rem;
        }

        .notifications-empty {
          display: inline-flex;
          align-items: center;
          gap: 0.7rem;
          color: var(--text-muted);
          padding: 1rem;
          border-radius: 16px;
          border: 1px dashed rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.03);
        }

        .notification-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 1rem;
          padding: 1rem 1.05rem;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
        }

        .notification-row-unread {
          border-color: rgba(59, 130, 246, 0.18);
          box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.06) inset;
        }

        .notification-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.8rem;
        }

        .notification-title {
          display: inline-flex;
          align-items: center;
          gap: 0.65rem;
          font-weight: 800;
          letter-spacing: -0.02em;
        }

        .notification-time {
          color: var(--text-muted);
          font-size: 0.8rem;
          white-space: nowrap;
        }

        .notification-unread-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #3b82f6;
          box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
          flex: 0 0 auto;
        }

        .notification-message {
          margin: 0.55rem 0 0;
          color: var(--text-secondary);
          line-height: 1.65;
        }

        .notification-sender {
          margin-top: 0.6rem;
        }

        .notification-sender-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          border-radius: 999px;
          padding: 0.35rem 0.7rem;
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .notification-sender-pill-company {
          background: rgba(59, 130, 246, 0.12);
          border: 1px solid rgba(59, 130, 246, 0.22);
          color: #bfdbfe;
        }

        .notification-sender-pill-employee {
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.2);
          color: #bbf7d0;
        }

        .muted-senders {
          padding: 0.85rem 0.9rem;
          background: rgba(0, 0, 0, 0.18);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 18px;
          margin-bottom: 1rem;
        }

        .muted-senders-title {
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          color: var(--text-muted);
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          font-size: 0.72rem;
          margin-bottom: 0.6rem;
        }

        .muted-senders-row {
          display: flex;
          gap: 0.6rem;
          flex-wrap: wrap;
        }

        .muted-sender-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.6rem;
          border-radius: 999px;
          padding: 0.45rem 0.8rem;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          color: var(--text-secondary);
          cursor: pointer;
        }

        .muted-sender-chip-x {
          color: #93c5fd;
          font-weight: 800;
          font-size: 0.75rem;
        }

        @media (max-width: 767px) {
          .announcements-shell {
            gap: 0.9rem;
          }

          .announcements-hero {
            padding: 1rem;
            gap: 0.9rem;
            border-radius: 22px;
          }

          .announcements-title {
            font-size: 1.65rem;
          }

          .announcements-subtitle {
            margin-top: 0.55rem;
            font-size: 0.9rem;
            line-height: 1.5;
          }

          .announcements-tab-row {
            justify-content: flex-start;
            gap: 0.55rem;
          }

          .announcements-tab-chip {
            padding: 0.5rem 0.78rem;
            font-size: 0.8rem;
          }

          .announcements-search {
            min-width: 0;
          }

          .featured-announcement {
            grid-template-columns: 1fr;
            gap: 0;
            border-radius: 22px;
          }

          .featured-announcement-copy {
            order: 2;
            padding: 1rem 1rem 1.15rem;
            gap: 0.7rem;
          }

          .featured-announcement-copy h2 {
            font-size: 1.2rem;
          }

          .featured-announcement-copy p {
            font-size: 0.88rem;
            line-height: 1.55;
          }

          .featured-announcement-cover,
          .announcement-card-cover {
            border-radius: 22px 22px 0 0;
            min-height: 0;
          }

          .featured-announcement-cover img,
          .announcement-card-cover img {
            height: 188px;
          }

          .featured-announcement-meta,
          .announcement-card-footer {
            display: grid;
            gap: 0.35rem;
          }

          .announcements-grid {
            grid-template-columns: 1fr;
          }

          .announcement-card {
            border-radius: 22px;
            overflow: hidden;
          }

          .announcement-card-body {
            padding: 0.95rem 1rem 1.05rem;
          }

          .announcement-card-headline h3 {
            font-size: 1rem;
          }

          .announcement-card-body p,
          .notification-message {
            font-size: 0.88rem;
            line-height: 1.55;
          }

          .notifications-head {
            gap: 0.7rem;
          }

          .notification-row {
            grid-template-columns: 1fr;
            padding: 0.9rem;
          }
        }
      `}</style>
    </div>
  );
}
