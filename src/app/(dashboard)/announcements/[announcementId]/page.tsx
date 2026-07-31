import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, CalendarDays, TimerReset, User } from 'lucide-react';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import { runCommunicationsMaintenance, normalizeAnnouncementRecord } from '@backend/modules/communications/application/communications-service';
import { announcementDurationLabel, formatCommunicationDate } from '@backend/modules/communications/domain/announcements';
import { AnnouncementRenderer } from '@frontend/modules/communications/ui/AnnouncementRenderer';
import type { CompanyAnnouncement, EmployeeAnnouncement } from '@shared/contracts/database';

export const metadata: Metadata = { title: 'Announcement detail' };

export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ announcementId: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  await runCommunicationsMaintenance();

  const { announcementId } = await params;
  const serviceClient = await createServiceClient();
  const { data: companyAnnouncementResult } = await serviceClient
    .from('company_announcements')
    .select('*, author:users!company_announcements_created_by_fkey(id, name, avatar_url, role)')
    .eq('id', announcementId)
    .eq('status', 'published')
    .maybeSingle();

  const { data: employeeAnnouncementResult } = companyAnnouncementResult
    ? { data: null }
    : await serviceClient
        .from('employee_announcements')
        .select('*, author:users!employee_announcements_created_by_fkey(id, name, avatar_url, role)')
        .eq('id', announcementId)
        .eq('status', 'published')
        .maybeSingle();

  const isCompanyAnnouncement = !!companyAnnouncementResult;
  const announcementResult = companyAnnouncementResult ?? employeeAnnouncementResult;

  if (!announcementResult) notFound();

  const announcement = normalizeAnnouncementRecord(
    announcementResult as (CompanyAnnouncement | EmployeeAnnouncement) & { content: unknown },
  );

  const { data: relatedResult } = await serviceClient
    .from(isCompanyAnnouncement ? 'company_announcements' : 'employee_announcements')
    .select('id, title')
    .eq('status', 'published')
    .neq('id', announcement.id)
    .order('publish_at', { ascending: false })
    .limit(4);

  return (
    <div className="announcement-detail-shell">
      <Link href="/announcements" className="btn btn-ghost btn-sm">
        <ArrowLeft size={15} />
        Back to announcements
      </Link>

      <section className="announcement-detail-header card animate-fade-in">
        <div className="announcement-detail-meta">
          <span><CalendarDays size={14} /> {formatCommunicationDate(announcement.publish_at ?? announcement.created_at)}</span>
          <span><TimerReset size={14} /> Visible for {announcementDurationLabel(announcement.duration_days)}</span>
          <span><User size={14} /> {announcement.author?.name ?? (isCompanyAnnouncement ? 'Outplex moderator' : 'Outplex employee')}</span>
        </div>
        <h1 className="announcement-detail-title">{announcement.title}</h1>
        <AnnouncementRenderer announcement={announcement} showCover />
      </section>

      {relatedResult && relatedResult.length > 0 ? (
        <section className="card animate-fade-in delay-100">
          <h2 style={{ marginTop: 0 }}>{isCompanyAnnouncement ? 'More company updates' : 'More employee announcements'}</h2>
          <div className="related-announcements">
            {relatedResult.map((item) => (
              <Link key={item.id} href={`/announcements/${item.id}`} className="related-announcement-link">
                <span>{item.title}</span>
                <ArrowLeft size={14} style={{ transform: 'rotate(180deg)' }} />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <style>{`
        .announcement-detail-shell {
          display: grid;
          gap: 1.35rem;
        }

        .announcement-detail-header {
          background:
            radial-gradient(circle at top left, rgba(34, 211, 238, 0.12), transparent 28%),
            radial-gradient(circle at bottom right, rgba(249, 115, 22, 0.12), transparent 28%),
            linear-gradient(155deg, rgba(10, 14, 28, 0.98), rgba(17, 22, 40, 0.94));
        }

        .announcement-detail-meta {
          display: flex;
          gap: 0.9rem;
          flex-wrap: wrap;
          color: var(--text-muted);
          font-size: 0.82rem;
          margin-bottom: 1rem;
        }

        .announcement-detail-meta span {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
        }

        .announcement-detail-title {
          margin: 0 0 1.2rem;
          font-size: clamp(2rem, 3vw, 3.1rem);
          line-height: 0.98;
          letter-spacing: -0.05em;
        }

        .related-announcements {
          display: grid;
          gap: 0.7rem;
        }

        .related-announcement-link {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.75rem;
          padding: 0.95rem 1rem;
          border-radius: 16px;
          border: 1px solid var(--border-subtle);
          color: var(--text-primary);
          text-decoration: none;
          background: rgba(255, 255, 255, 0.03);
          transition: transform 0.2s ease, border-color 0.2s ease;
        }

        .related-announcement-link:hover {
          transform: translateY(-1px);
          border-color: rgba(34, 211, 238, 0.22);
        }
      `}</style>
    </div>
  );
}
