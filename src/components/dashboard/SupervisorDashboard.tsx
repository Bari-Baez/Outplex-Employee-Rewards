'use client';

import { useMemo, useState } from 'react';
import { Users, Zap, Clock, Store, LayoutList, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

interface SupervisorDashboardProps {
  stats: {
    teamSize: number;
    teamPendingStoreRequests: number;
    teamTotalPoints: number;
    teamOTHours: number;
  };
  userName: string;
}

type MobileMetricKey = 'team' | 'hours' | 'requests' | 'points';

export function SupervisorDashboard({ stats, userName }: SupervisorDashboardProps) {
  const mobileMetrics = useMemo(
    () => [
      {
        key: 'team' as const,
        label: 'Team',
        value: stats.teamSize.toString(),
        helper: 'Assigned members under your supervision.',
        href: '/moderator/users',
        icon: <Users size={16} />,
        color: 'var(--brand-primary)',
      },
      {
        key: 'hours' as const,
        label: 'OT Hours',
        value: stats.teamOTHours.toFixed(1),
        helper: 'Claimed OT hours this month.',
        href: '/moderator/ot-manager',
        icon: <Clock size={16} />,
        color: '#10b981',
      },
      {
        key: 'requests' as const,
        label: 'Requests',
        value: stats.teamPendingStoreRequests.toString(),
        helper: 'Pending store actions for your team.',
        href: '/moderator/employee-stores',
        icon: <Store size={16} />,
        color: '#06b6d4',
      },
      {
        key: 'points' as const,
        label: 'Points',
        value: stats.teamTotalPoints.toLocaleString(),
        helper: 'Combined points balance across your team.',
        href: '/moderator/users',
        icon: <Zap size={16} />,
        color: '#fbbf24',
      },
    ],
    [stats.teamOTHours, stats.teamPendingStoreRequests, stats.teamSize, stats.teamTotalPoints],
  );
  const [activeMobileMetric, setActiveMobileMetric] = useState<MobileMetricKey>('team');

  const activeMetric = mobileMetrics.find((metric) => metric.key === activeMobileMetric) ?? mobileMetrics[0];
  const shortcuts = [
    { href: '/moderator/users', title: 'Team Directory', desc: 'Review members and point balances.', icon: <Users size={18} /> },
    { href: '/moderator/ot-manager', title: 'Team OT View', desc: 'Inspect claimed and open OT.', icon: <Clock size={18} /> },
    { href: '/moderator/store/orders', title: 'Order Fulfillment', desc: 'Process storefront orders.', icon: <Store size={18} /> },
    { href: '/moderator/employee-stores', title: 'Store Requests', desc: 'Moderate employee store applications.', icon: <LayoutList size={18} /> },
  ];
  const desktopStats = [
    { href: '/moderator/users', label: 'My Team', value: stats.teamSize.toString(), icon: <Users size={16} />, sublabel: 'Assigned members', color: 'var(--brand-primary)' },
    { href: '/moderator/ot-manager', label: 'Team OT Hours', value: stats.teamOTHours.toFixed(1), icon: <Clock size={16} />, sublabel: 'Logged this month', color: 'var(--status-available)' },
    { href: '/moderator/employee-stores', label: 'Team Requests', value: stats.teamPendingStoreRequests.toString(), icon: <Store size={16} />, sublabel: 'Pending store review', color: 'var(--brand-accent)' },
    { href: '/moderator/users', label: 'Team Points', value: stats.teamTotalPoints.toLocaleString(), icon: <Zap size={16} />, sublabel: 'Cumulative balance', color: '#fbbf24' },
  ];

  return (
    <div className="flex flex-col gap-5 md:gap-8 w-full max-w-[1600px] p-3 md:p-6 animate-fade-in">
      <div className="dashboard-mobile-only supervisor-mobile-shell">
        <div className="card supervisor-mobile-hero">
          <span className="supervisor-mobile-kicker">Supervisor</span>
          <h1 className="supervisor-mobile-title">Team dashboard</h1>
          <p className="supervisor-mobile-copy">Hello {userName.split(' ')[0]}, tap any icon to inspect the current team snapshot.</p>
          <div className="supervisor-mobile-metrics">
            {mobileMetrics.map((metric) => (
              <button
                key={metric.key}
                type="button"
                className={`supervisor-mobile-metric ${activeMobileMetric === metric.key ? 'supervisor-mobile-metric-active' : ''}`}
                style={{ ['--metric-color' as string]: metric.color }}
                onClick={() => setActiveMobileMetric(metric.key)}
              >
                <span className="supervisor-mobile-metric-icon">{metric.icon}</span>
                <span className="supervisor-mobile-metric-label">{metric.label}</span>
              </button>
            ))}
          </div>
          <Link href={activeMetric.href} className="supervisor-mobile-detail supervisor-mobile-detail-link" style={{ ['--metric-color' as string]: activeMetric.color }}>
            <div className="supervisor-mobile-detail-row">
              <span className="supervisor-mobile-detail-label">{activeMetric.label}</span>
              <strong>{activeMetric.value}</strong>
            </div>
            <p>{activeMetric.helper}</p>
          </Link>
        </div>

        <div className="supervisor-mobile-shortcuts">
          {shortcuts.map((shortcut) => (
            <Link key={shortcut.href} href={shortcut.href} className="supervisor-mobile-shortcut">
              <span className="supervisor-mobile-shortcut-icon">{shortcut.icon}</span>
              <div>
                <strong>{shortcut.title}</strong>
                <p>{shortcut.desc}</p>
              </div>
              <ChevronRight size={16} className="text-[var(--brand-primary-light)] shrink-0" />
            </Link>
          ))}
        </div>
      </div>

      <div className="dashboard-desktop-only-block dashboard-header">
        <div>
          <h1 className="dashboard-title">
            Supervisor <span className="gradient-text">Dashboard</span>
          </h1>
          <p className="dashboard-subtitle">
            Hello {userName}, managing your team and overseeing store operations.
          </p>
        </div>
      </div>

      <div className="dashboard-desktop-only-grid stats-grid">
        {desktopStats.map((card) => (
          <StatCard
            key={card.label}
            href={card.href}
            label={card.label}
            value={card.value}
            icon={card.icon}
            sublabel={card.sublabel}
            color={card.color}
          />
        ))}
      </div>

      <div className="dashboard-desktop-only-grid dashboard-grid">
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">
              <LayoutList size={20} style={{ color: 'var(--brand-primary-light)' }} />
              Management Shortcuts
            </h2>
          </div>
          <div className="tools-grid">
            <ToolLink
              href="/moderator/users"
              title="Team Directory"
              desc="View your team members and their point balances."
              icon={<Users size={20} />}
            />
            <ToolLink
              href="/moderator/ot-manager"
              title="Team OT View"
              desc="Oversee overtime shifts assigned to your team."
              icon={<Clock size={20} />}
            />
            <ToolLink
              href="/moderator/store/orders"
              title="Order Fulfillment"
              desc="Review and process storefront orders."
              icon={<Store size={20} />}
            />
            <ToolLink
              href="/moderator/employee-stores"
              title="Store Requests"
              desc="Monitor your team's micro-store applications."
              icon={<LayoutList size={20} />}
            />
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">
              <Zap size={20} style={{ color: 'var(--brand-accent)' }} />
              Team Activity Insights
            </h2>
          </div>
          <div className="activity-placeholder">
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Detailed activity logs for your team will appear here as members interact with the store and OT calendar.
            </p>
            <div className="action-row">
              <span>View full directory</span>
              <Link href="/moderator/users" className="icon-link"><ChevronRight size={18} /></Link>
            </div>
          </div>
        </section>
      </div>

      <style>{`
        .dashboard-header {
          margin-bottom: 2rem;
        }
        .dashboard-desktop-only-block,
        .dashboard-desktop-only-grid {
          display: none !important;
        }
        .dashboard-title {
          font-size: 2.25rem;
          font-weight: 900;
          letter-spacing: -0.04em;
          margin: 0 0 0.5rem;
        }
        .dashboard-subtitle {
          color: var(--text-secondary);
          font-size: 1rem;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1.25rem;
          margin-bottom: 2rem;
        }
        .dashboard-grid {
          display: grid;
          grid-template-columns: 1.5fr 1fr;
          gap: 1.5rem;
        }
        .tools-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
          margin-top: 0.5rem;
        }
        .supervisor-mobile-shell {
          display: grid;
          gap: 0.9rem;
        }
        .supervisor-mobile-hero {
          display: grid;
          gap: 0.9rem;
          padding: 1rem;
        }
        .supervisor-mobile-kicker {
          display: inline-flex;
          width: fit-content;
          padding: 0.28rem 0.6rem;
          border-radius: 999px;
          background: rgba(124,108,255,0.14);
          color: #a78bfa;
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .supervisor-mobile-title {
          margin: 0;
          color: white;
          font-size: 1.45rem;
          line-height: 1.05;
        }
        .supervisor-mobile-copy {
          margin: 0;
          color: var(--text-secondary);
          font-size: 0.84rem;
          line-height: 1.5;
        }
        .supervisor-mobile-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.65rem;
        }
        .supervisor-mobile-metric {
          display: grid;
          place-items: center;
          gap: 0.4rem;
          padding: 0.72rem 0.35rem;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          color: var(--text-secondary);
          text-align: center;
        }
        .supervisor-mobile-metric-active {
          border-color: color-mix(in srgb, var(--metric-color) 45%, rgba(255,255,255,0.1));
          background: color-mix(in srgb, var(--metric-color) 12%, rgba(255,255,255,0.02));
          color: white;
        }
        .supervisor-mobile-metric-icon,
        .supervisor-mobile-shortcut-icon {
          width: 2.4rem;
          height: 2.4rem;
          border-radius: 14px;
          display: grid;
          place-items: center;
          background: rgba(124,108,255,0.14);
          color: #8b7bff;
          flex-shrink: 0;
        }
        .supervisor-mobile-metric-active .supervisor-mobile-metric-icon {
          background: color-mix(in srgb, var(--metric-color) 16%, rgba(255,255,255,0.08));
          color: var(--metric-color);
        }
        .supervisor-mobile-metric-label {
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          line-height: 1.2;
        }
        .supervisor-mobile-detail {
          display: grid;
          gap: 0.45rem;
          padding: 0.9rem 1rem;
          border-radius: 18px;
          border: 1px solid color-mix(in srgb, var(--metric-color) 30%, rgba(255,255,255,0.08));
          background: color-mix(in srgb, var(--metric-color) 10%, rgba(255,255,255,0.02));
        }
        .supervisor-mobile-detail-link {
          text-decoration: none;
        }
        .supervisor-mobile-detail-row {
          display: flex;
          justify-content: space-between;
          gap: 0.7rem;
          align-items: center;
        }
        .supervisor-mobile-detail-label {
          color: var(--metric-color);
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .supervisor-mobile-detail strong {
          color: white;
          font-size: 1.32rem;
        }
        .supervisor-mobile-detail p {
          margin: 0;
          color: var(--text-secondary);
          font-size: 0.84rem;
          line-height: 1.5;
        }
        .supervisor-mobile-shortcuts {
          display: grid;
          gap: 0.8rem;
        }
        .supervisor-mobile-shortcut {
          display: flex;
          align-items: center;
          gap: 0.8rem;
          padding: 0.95rem 1rem;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          text-decoration: none;
        }
        .supervisor-mobile-shortcut strong {
          display: block;
          color: white;
          font-size: 0.95rem;
        }
        .supervisor-mobile-shortcut p {
          margin: 0.22rem 0 0;
          color: var(--text-secondary);
          font-size: 0.78rem;
          line-height: 1.45;
        }
        .action-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 0;
          border-top: 1px solid var(--border-subtle);
        }
        .action-row span {
          color: var(--text-primary);
          font-size: 0.9rem;
          font-weight: 600;
        }
        .icon-link {
          color: var(--brand-primary-light);
        }
        .supervisor-stat-link {
          text-decoration: none;
        }
        @media (min-width: 1024px) {
          .dashboard-mobile-only {
            display: none !important;
          }
          .dashboard-desktop-only-block {
            display: block !important;
          }
          .dashboard-desktop-only-grid {
            display: grid !important;
          }
        }
        @media (max-width: 1279px) {
          .stats-grid { grid-template-columns: repeat(2, 1fr); }
          .dashboard-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

function StatCard({ href, label, value, icon, sublabel, color }: { href: string; label: string; value: string; icon: ReactNode; sublabel: string; color: string }) {
  return (
    <Link href={href} className="card supervisor-stat-link flex flex-col gap-5 border-l-4 transition-all hover:bg-white/5" style={{ borderLeftColor: color }}>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        <span style={{ color }}>{icon}</span> {label}
      </div>
      <div style={{ fontSize: '2.5rem', fontWeight: 900, lineHeight: 1, color: 'white' }}>{value}</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 500 }}>{sublabel}</div>
    </Link>
  );
}

function ToolLink({ href, title, desc, icon }: { href: string; title: string; desc: string; icon: ReactNode }) {
  return (
    <Link href={href} className="tool-card">
      <div className="tool-icon">{icon}</div>
      <div className="tool-info">
        <strong>{title}</strong>
        <p>{desc}</p>
      </div>
      <style>{`
        .tool-card {
          display: flex;
          gap: 1rem;
          padding: 1.25rem;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          text-decoration: none;
          transition: all 0.2s ease;
        }
        .tool-card:hover {
          border-color: var(--brand-primary);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(124, 108, 255, 0.1);
        }
        .tool-icon {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(124, 108, 255, 0.1);
          color: var(--brand-primary);
          border-radius: 10px;
          flex-shrink: 0;
        }
        .tool-info strong {
          display: block;
          color: var(--text-primary);
          font-size: 1rem;
          margin-bottom: 0.25rem;
        }
        .tool-info p {
          color: var(--text-secondary);
          font-size: 0.8rem;
          margin: 0;
          line-height: 1.4;
        }
      `}</style>
    </Link>
  );
}
