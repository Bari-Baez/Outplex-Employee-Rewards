'use client';

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

export function SupervisorDashboard({ stats, userName }: SupervisorDashboardProps) {
  return (
    <div className="flex flex-col gap-8 w-full max-w-[1600px] p-4 md:p-6 animate-fade-in">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">
            Supervisor <span className="gradient-text">Dashboard</span>
          </h1>
          <p className="dashboard-subtitle">
            Hello {userName}, managing your team and overseeing store operations.
          </p>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard 
          label="My Team" 
          value={stats.teamSize.toString()} 
          icon={<Users size={16} />} 
          sublabel="Assigned members" 
          color="var(--brand-primary)"
        />
        <StatCard 
          label="Team OT Hours" 
          value={stats.teamOTHours.toFixed(1)} 
          icon={<Clock size={16} />} 
          sublabel="Logged this month" 
          color="var(--status-available)"
        />
        <StatCard 
          label="Team Requests" 
          value={stats.teamPendingStoreRequests.toString()} 
          icon={<Store size={16} />} 
          sublabel="Pending store review" 
          color="var(--brand-accent)"
        />
        <StatCard 
          label="Team Points" 
          value={stats.teamTotalPoints.toLocaleString()} 
          icon={<Zap size={16} />} 
          sublabel="Cumulative balance" 
          color="#fbbf24"
        />
      </div>

      <div className="dashboard-grid">
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
        @media (max-width: 1024px) {
          .stats-grid { grid-template-columns: repeat(2, 1fr); }
          .dashboard-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

function StatCard({ label, value, icon, sublabel, color }: { label: string; value: string; icon: ReactNode; sublabel: string; color: string }) {
  return (
    <div className="card flex flex-col gap-5 border-l-4 transition-all hover:bg-white/5" style={{ borderLeftColor: color }}>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        <span style={{ color: color }}>{icon}</span> {label}
      </div>
      <div style={{ fontSize: '2.5rem', fontWeight: 900, lineHeight: 1, color: 'white' }}>{value}</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 500 }}>{sublabel}</div>
    </div>
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
