'use client';

import { Users, Package, CalendarDays, Zap, Clock, Store, LayoutList, Activity } from 'lucide-react';
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

export function WorkforceDashboard({ stats, userName }: WorkforceDashboardProps) {
  return (
    <div className="flex flex-col gap-8 w-full max-w-[1600px] p-4 md:p-6">
      {/* Page Header - Bento Card Full */}
      <div className="glass-card bento-card--full flex justify-between items-center bg-gradient-to-r from-[rgba(109,93,252,0.1)] to-transparent border-l-4 border-l-[#6d5dfc]">
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

      {/* Stats Bento Grid */}
      <div className="bento-grid">
        <StatCard 
          label="Total Employees" 
          value={stats.totalEmployees.toString()} 
          icon={<Users size={16} />} 
          sublabel="Registered Users" 
          color="#6d5dfc"
          className="bento-card"
        />
        <StatCard 
          label="Pending OT" 
          value={stats.pendingOT.toString()} 
          icon={<Clock size={16} />} 
          sublabel="Awaiting Review" 
          color="#10b981"
          className="bento-card"
        />
        <StatCard 
          label="Store Requests" 
          value={stats.pendingStoreRequests.toString()} 
          icon={<Store size={16} />} 
          sublabel="Pending Approval" 
          color="#06b6d4"
          className="bento-card"
        />
        <StatCard 
          label="Points Flow" 
          value={stats.pointsDistributed.toLocaleString()} 
          icon={<Zap size={16} />} 
          sublabel="Total Economy" 
          color="#fbbf24"
          className="bento-card"
        />

        {/* Quick Tools - Bento Wide */}
        <div className="bento-card--wide glass-card">
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

        {/* Operational Health - Bento Column */}
        <div className="bento-card glass-card flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-[#06b6d4]/20 rounded-lg text-[#06b6d4]"><Activity size={20} /></div>
            <h2 className="text-xl font-black text-white">Health</h2>
          </div>
          <div className="flex-1 space-y-4">
            <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex justify-between items-center">
              <span className="text-sm font-bold text-slate-400">Active Stores</span>
              <span className="text-xl font-black text-white">{stats.activeStores}</span>
            </div>
            <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex justify-between items-center">
              <span className="text-sm font-bold text-slate-400">Total Decisions</span>
              <span className={`text-xl font-black ${stats.pendingStoreRequests + stats.pendingOT > 10 ? 'text-red-500' : 'text-[#6d5dfc]'}`}>
                {stats.pendingStoreRequests + stats.pendingOT}
              </span>
            </div>
            <div className="mt-auto p-4 bg-[#6d5dfc]/10 rounded-2xl text-center">
              <p className="text-[10px] font-black uppercase text-[#6d5dfc] tracking-widest">Operational Status</p>
              <p className="text-sm text-white font-bold mt-1">Sytem Optimal</p>
            </div>
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
        .bento-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1.5rem;
        }
        .bento-card--full { grid-column: span 4; }
        .bento-card--wide { grid-column: span 3; }
        .bento-card { grid-column: span 1; }
        
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
        .metric-row {
          display: flex;
          justify-content: space-between;
          padding: 1rem 0;
          border-bottom: 1px solid var(--border-subtle);
        }
        .metric-row:last-child {
          border-bottom: none;
        }
        .metric-row span {
          color: var(--text-secondary);
          font-size: 0.95rem;
        }
        .metric-row strong {
          font-size: 1.1rem;
          font-weight: 700;
        }
        @media (max-width: 1024px) {
          .stats-grid { grid-template-columns: repeat(2, 1fr); }
          .dashboard-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

function StatCard({ label, value, icon, sublabel, color, className }: { label: string; value: string; icon: ReactNode; sublabel: string; color: string; className?: string }) {
  return (
    <div className={`glass-card ${className || ''} flex flex-col gap-4 border-l-4 transition-all hover:bg-white/5`} style={{ borderLeftColor: color }}>
      <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.15em] font-black text-slate-500">
        <span style={{ color: color }}>{icon}</span>
        {label}
      </div>
      <div className="text-4xl font-black text-white lining-nums">{value}</div>
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{sublabel}</div>
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
