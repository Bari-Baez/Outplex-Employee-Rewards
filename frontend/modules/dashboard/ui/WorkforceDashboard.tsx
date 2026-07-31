'use client';

import { useMemo, useState } from 'react';
import { Users, Package, CalendarDays, Zap, Clock, Store, LayoutList } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

interface WorkforceDashboardProps {
  stats: {
    totalEmployees: number;
    pendingOT: number;
    pendingStoreRequests: number;
    activeStores: number;
    pointsDistributed: number;
  };
  userName: string;
}

type MobileMetricKey = 'employees' | 'ot' | 'store' | 'points';

export function WorkforceDashboard({ stats, userName }: WorkforceDashboardProps) {
  const mobileMetrics = useMemo(
    () => [
      {
        key: 'employees' as const,
        label: 'Team',
        value: stats.totalEmployees.toString(),
        helper: 'Registered users in the platform.',
        href: '/moderator/users',
        icon: <Users size={16} />,
        color: '#6d5dfc',
      },
      {
        key: 'ot' as const,
        label: 'Open OT',
        value: stats.pendingOT.toString(),
        helper: 'OT items waiting for review.',
        href: '/moderator/ot-manager',
        icon: <Clock size={16} />,
        color: '#10b981',
      },
      {
        key: 'store' as const,
        label: 'Store',
        value: stats.pendingStoreRequests.toString(),
        helper: `${stats.activeStores} active employee store(s).`,
        href: '/moderator/employee-stores',
        icon: <Store size={16} />,
        color: '#06b6d4',
      },
      {
        key: 'points' as const,
        label: 'Points',
        value: stats.pointsDistributed.toLocaleString(),
        helper: 'Total points distributed in the economy.',
        href: '/moderator/users',
        icon: <Zap size={16} />,
        color: '#fbbf24',
      },
    ],
    [stats.activeStores, stats.pendingOT, stats.pendingStoreRequests, stats.pointsDistributed, stats.totalEmployees],
  );
  const [activeMobileMetric, setActiveMobileMetric] = useState<MobileMetricKey>('employees');

  const activeMetric = mobileMetrics.find((metric) => metric.key === activeMobileMetric) ?? mobileMetrics[0];
  const mobileActions = [
    { href: '/moderator/ot-manager', title: 'OT Manager', desc: 'Approve and schedule OT.', icon: <CalendarDays size={18} /> },
    { href: '/moderator/users', title: 'Employees', desc: 'Manage teams and profiles.', icon: <Users size={18} /> },
    { href: '/moderator/store/orders', title: 'Store Ops', desc: 'Review orders and stock.', icon: <Package size={18} /> },
    { href: '/moderator/employee-stores', title: 'Stores', desc: 'Moderate employee storefronts.', icon: <Store size={18} /> },
  ];
  const desktopStats = [
    { href: '/moderator/users', label: 'Total Employees', value: stats.totalEmployees.toString(), icon: <Users size={16} />, sublabel: 'Registered Users', color: '#6d5dfc' },
    { href: '/moderator/ot-manager', label: 'Pending OT', value: stats.pendingOT.toString(), icon: <Clock size={16} />, sublabel: 'Awaiting Review', color: '#10b981' },
    { href: '/moderator/employee-stores', label: 'Store Requests', value: stats.pendingStoreRequests.toString(), icon: <Store size={16} />, sublabel: 'Pending Approval', color: '#06b6d4' },
    { href: '/moderator/users', label: 'Points Flow', value: stats.pointsDistributed.toLocaleString(), icon: <Zap size={16} />, sublabel: 'Total Economy', color: '#fbbf24' },
  ];

  return (
    <div className="flex flex-col gap-5 md:gap-8 w-full max-w-[1600px] p-3 md:p-6">
      <div className="dashboard-mobile-only glass-card workforce-mobile-hero">
        <div className="workforce-mobile-kicker">Dashboard</div>
        <div className="workforce-mobile-headline">
          <span className="workforce-mobile-icon"><Zap size={18} /></span>
          <div>
            <strong>Workforce</strong>
            <p>Hello {userName.split(' ')[0]}, review the essentials and jump into the right tool.</p>
          </div>
        </div>
        <div className="workforce-mobile-metrics">
          {mobileMetrics.map((metric) => (
            <button
              key={metric.key}
              type="button"
              className={`workforce-mobile-metric ${activeMobileMetric === metric.key ? 'workforce-mobile-metric-active' : ''}`}
              style={{ ['--metric-color' as string]: metric.color }}
              onClick={() => setActiveMobileMetric(metric.key)}
            >
              <span className="workforce-mobile-metric-icon">{metric.icon}</span>
              <span className="workforce-mobile-metric-label">{metric.label}</span>
            </button>
          ))}
        </div>
        <Link href={activeMetric.href} className="workforce-mobile-detail workforce-mobile-detail-link" style={{ ['--metric-color' as string]: activeMetric.color }}>
          <div className="workforce-mobile-detail-top">
            <span className="workforce-mobile-detail-badge">{activeMetric.label}</span>
            <span className="workforce-mobile-detail-value">{activeMetric.value}</span>
          </div>
          <p>{activeMetric.helper}</p>
        </Link>
      </div>

      <div className="dashboard-desktop-only-flex glass-card bento-card--full justify-between items-center bg-gradient-to-r from-[rgba(109,93,252,0.1)] to-transparent border-l-4 border-l-[#6d5dfc]">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
            <span className="p-2 bg-[#6d5dfc] rounded-xl shadow-[0_0_20px_rgba(109,93,252,0.4)]">
              <Zap size={28} />
            </span>
            Workforce <span className="text-[#6d5dfc]">Command Center</span>
          </h1>
          <p className="text-slate-400 mt-1 font-medium ml-1">Hello {userName}, here is an operational overview of the system.</p>
        </div>
      </div>

      <div className="dashboard-mobile-only workforce-mobile-actions">
        {mobileActions.map((action) => (
          <Link key={action.href} href={action.href} className="workforce-mobile-action">
            <span className="workforce-mobile-action-icon">{action.icon}</span>
            <div>
              <strong>{action.title}</strong>
              <p>{action.desc}</p>
            </div>
          </Link>
        ))}
        <div className="workforce-mobile-health">
          <div className="workforce-mobile-health-row">
            <span>Active stores</span>
            <strong>{stats.activeStores}</strong>
          </div>
          <div className="workforce-mobile-health-row">
            <span>Total decisions</span>
            <strong>{stats.pendingStoreRequests + stats.pendingOT}</strong>
          </div>
        </div>
      </div>

      <div className="dashboard-desktop-only-grid bento-grid">
        {desktopStats.map((card) => (
          <StatCard
            key={card.label}
            href={card.href}
            label={card.label}
            value={card.value}
            icon={card.icon}
            sublabel={card.sublabel}
            color={card.color}
            className="bento-card"
          />
        ))}

        <div className="bento-card--full glass-card">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-[#6d5dfc]/20 rounded-lg text-[#6d5dfc]"><LayoutList size={20} /></div>
            <h2 className="text-xl font-black text-white">System Operations</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ToolLink href="/moderator/ot-manager" title="OT Management" desc="Approve and schedule overtime blocks." icon={<CalendarDays size={20} />} />
            <ToolLink href="/moderator/users" title="Employee Directory" desc="Manage teams, points and profiles." icon={<Users size={20} />} />
            <ToolLink href="/moderator/store/orders" title="Store Operations" desc="Manage inventory and fulfillment." icon={<Package size={20} />} />
            <ToolLink href="/moderator/employee-stores" title="Employee Stores" desc="Review and moderate user storefronts." icon={<Store size={20} />} />
          </div>
        </div>
      </div>

      <style>{`
        .glass-card {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          padding: 1.5rem;
        }
        .dashboard-desktop-only-flex,
        .dashboard-desktop-only-grid {
          display: none !important;
        }
        .bento-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1.5rem;
        }
        .bento-card--full { grid-column: span 4; }
        .bento-card--wide { grid-column: span 3; }
        .bento-card { grid-column: span 1; }
        .workforce-mobile-hero {
          padding: 1rem;
          gap: 0.9rem;
          display: grid;
        }
        .workforce-mobile-kicker {
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
        .workforce-mobile-headline {
          display: flex;
          gap: 0.85rem;
          align-items: flex-start;
        }
        .workforce-mobile-headline strong {
          display: block;
          color: white;
          font-size: 1.35rem;
          line-height: 1.1;
        }
        .workforce-mobile-headline p {
          margin: 0.3rem 0 0;
          color: var(--text-secondary);
          font-size: 0.86rem;
          line-height: 1.5;
        }
        .workforce-mobile-icon,
        .workforce-mobile-action-icon,
        .workforce-mobile-metric-icon {
          width: 2.5rem;
          height: 2.5rem;
          border-radius: 14px;
          display: grid;
          place-items: center;
          background: rgba(124,108,255,0.16);
          color: #8b7bff;
          flex-shrink: 0;
        }
        .workforce-mobile-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.65rem;
        }
        .workforce-mobile-metric {
          display: grid;
          place-items: center;
          gap: 0.4rem;
          padding: 0.7rem 0.35rem;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          color: var(--text-secondary);
          text-align: center;
        }
        .workforce-mobile-metric-active {
          border-color: color-mix(in srgb, var(--metric-color) 45%, rgba(255,255,255,0.1));
          background: color-mix(in srgb, var(--metric-color) 12%, rgba(255,255,255,0.02));
          color: white;
        }
        .workforce-mobile-metric-active .workforce-mobile-metric-icon {
          background: color-mix(in srgb, var(--metric-color) 16%, rgba(255,255,255,0.08));
          color: var(--metric-color);
        }
        .workforce-mobile-metric-label {
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          line-height: 1.2;
        }
        .workforce-mobile-detail {
          display: grid;
          gap: 0.45rem;
          padding: 0.9rem 1rem;
          border-radius: 18px;
          border: 1px solid color-mix(in srgb, var(--metric-color) 30%, rgba(255,255,255,0.08));
          background: color-mix(in srgb, var(--metric-color) 10%, rgba(255,255,255,0.02));
        }
        .workforce-mobile-detail-link {
          text-decoration: none;
        }
        .workforce-mobile-detail-top {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          align-items: center;
        }
        .workforce-mobile-detail-badge {
          color: var(--metric-color);
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .workforce-mobile-detail-value {
          color: white;
          font-size: 1.35rem;
          font-weight: 900;
        }
        .workforce-mobile-detail p {
          margin: 0;
          color: var(--text-secondary);
          font-size: 0.84rem;
          line-height: 1.5;
        }
        .workforce-mobile-actions {
          display: grid;
          gap: 0.85rem;
        }
        .workforce-mobile-action {
          display: flex;
          gap: 0.85rem;
          align-items: center;
          padding: 0.95rem 1rem;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          text-decoration: none;
        }
        .workforce-mobile-action strong {
          display: block;
          color: white;
          font-size: 0.96rem;
        }
        .workforce-mobile-action p {
          margin: 0.25rem 0 0;
          color: var(--text-secondary);
          font-size: 0.78rem;
          line-height: 1.45;
        }
        .workforce-mobile-health {
          display: grid;
          gap: 0.7rem;
          padding: 1rem;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
        }
        .workforce-mobile-health-row {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          align-items: center;
          color: var(--text-secondary);
          font-size: 0.84rem;
        }
        .workforce-mobile-health-row strong {
          color: white;
          font-size: 1rem;
        }
        .stat-card-link {
          text-decoration: none;
        }
        @media (min-width: 1024px) {
          .dashboard-mobile-only {
            display: none !important;
          }
          .dashboard-desktop-only-flex {
            display: flex !important;
          }
          .dashboard-desktop-only-grid {
            display: grid !important;
          }
        }
        @media (max-width: 1279px) {
          .bento-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

function StatCard({ href, label, value, icon, sublabel, color, className }: { href: string; label: string; value: string; icon: ReactNode; sublabel: string; color: string; className?: string }) {
  return (
    <Link href={href} className={`glass-card ${className || ''} stat-card-link flex flex-col gap-4 border-l-4 transition-all hover:bg-white/5`} style={{ borderLeftColor: color }}>
      <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.15em] font-black text-slate-500">
        <span style={{ color }}>{icon}</span>
        {label}
      </div>
      <div className="text-4xl font-black text-white lining-nums">{value}</div>
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{sublabel}</div>
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
