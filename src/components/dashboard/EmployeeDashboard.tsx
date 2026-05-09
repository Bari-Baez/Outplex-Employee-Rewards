'use client';

import { CalendarDays, Clock, Gift, History, TrendingUp, Zap, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatTime } from '@/lib/utils';
import type { DailySchedule, User, OTSlot, Raffle } from '@/types/database';
import type { OTClaimKind } from '@/lib/ot-claim-meta';
import { EmployeeCompensationCalculator } from '@/app/(dashboard)/dashboard/EmployeeCompensationCalculator';
import { BreaksLunchWidget } from '@/components/dashboard/BreaksLunchWidget';

interface EmployeeDashboardProps {
  profile: User;
  name: string;
  totalHours: number;
  recentHours: number;
  upcomingSlots: OTSlot[];
  raffles: Raffle[];
  claimedSlots: OTSlot[];
  currentMoment: { date: string; time: string };
  claimMetas?: Record<string, OTClaimKind>;
  dailySchedules?: DailySchedule[];
}

export function EmployeeDashboard({
  profile,
  name,
  totalHours,
  recentHours,
  upcomingSlots,
  raffles,
  claimedSlots,
  currentMoment,
  claimMetas = {},
  dailySchedules = [],
}: EmployeeDashboardProps) {
  return (
    <div className="flex flex-col gap-4 md:gap-8 w-full max-w-[1600px] p-3 md:p-6">
      {/* Header */}
      <div className="glass-card bento-card--full flex flex-row justify-between items-center gap-3 bg-gradient-to-br from-white/5 to-transparent border-t border-white/10 py-3 md:py-6 px-4 md:px-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="p-0.5 px-2 bg-[#6d5dfc]/20 text-[#6d5dfc] text-[9px] font-black rounded-md uppercase tracking-widest">Dashboard</span>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
          </div>
          <h1 className="text-xl md:text-4xl font-black text-white tracking-tight leading-tight">
            Hey, <span className="text-[#6d5dfc]">{name}</span>
          </h1>
          <p className="text-slate-400 text-xs md:text-sm font-medium hidden md:block max-w-lg">Your OT reservations, recent history, and live activity are all synced and ready.</p>
        </div>
        <Link href="/ot-calendar" className="group relative flex items-center gap-2 px-4 md:px-8 py-2.5 md:py-4 bg-[#6d5dfc] text-white font-black rounded-xl md:rounded-2xl text-xs md:text-base transition-all hover:scale-105 active:scale-95 shadow-[0_10px_30px_rgba(109,93,252,0.25)] shrink-0">
          <CalendarDays size={16} className="md:hidden" />
          <CalendarDays size={20} className="hidden md:block" />
          <span className="hidden md:inline">BOOK NEW OT</span>
          <span className="md:hidden">Book OT</span>
        </Link>
      </div>

      {/* Stats row — 2×2 grid on mobile, 4 columns on desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
        <StatCard
          label="Hours This Month"
          value={totalHours.toFixed(1)}
          icon={<TrendingUp size={14} />}
          sublabel="OT Tracked"
          color="#6d5dfc"
        />
        <StatCard
          label="Upcoming OT"
          value={`${upcomingSlots.length}`}
          icon={<Clock size={14} />}
          sublabel="Reservations"
          color="#10b981"
        />
        <StatCard
          label="Last 60 Days"
          value={recentHours.toFixed(1)}
          icon={<History size={14} />}
          sublabel="Performance"
          color="#06b6d4"
        />
        <StatCard
          label="Points"
          value={`${profile?.points ?? 0}`}
          icon={<Zap size={14} />}
          sublabel="Ready to Spend"
          color="#fbbf24"
        />
      </div>

      {/* Breaks Widget */}
      <div className="glass-card relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5 hidden md:block">
          <Zap size={120} />
        </div>
        <BreaksLunchWidget />
      </div>

      {/* Upcoming OT */}
      <div className="glass-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="p-1.5 md:p-2 bg-[#6d5dfc]/20 rounded-lg text-[#6d5dfc]"><Clock size={16} /></div>
            <h2 className="font-black text-white tracking-tight text-sm md:text-base">Upcoming OT</h2>
          </div>
        </div>
        {upcomingSlots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 bg-white/5 rounded-2xl border border-dashed border-white/10 opacity-60">
            <CalendarDays size={32} className="mb-2 text-slate-600" />
            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No reservations</p>
            <Link href="/ot-calendar" className="mt-2 text-xs font-black text-[#6d5dfc] hover:underline underline-offset-4">Claim your first slot</Link>
          </div>
        ) : (
          <div className="flex flex-col md:grid md:grid-cols-2 gap-2 md:gap-4">
            {upcomingSlots.map((slot) => (
              <div key={slot.id} className="p-3 md:p-4 bg-white/5 border border-white/5 rounded-xl flex items-center gap-3 hover:border-[#6d5dfc]/30 hover:bg-white/10 transition-all">
                <div className="h-11 w-11 md:h-14 md:w-14 rounded-xl bg-white/5 border border-white/5 flex flex-col items-center justify-center overflow-hidden shrink-0">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-tighter bg-white/5 w-full text-center py-0.5">{new Date(`${slot.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}</span>
                  <span className="text-lg md:text-xl font-black text-white">{new Date(`${slot.date}T00:00:00`).getDate()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs md:text-sm font-black text-white">{formatTime(slot.start_time)} — {formatTime(slot.end_time)}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{slot.shift_label || 'Regular OT'}</p>
                </div>
                <ChevronRight size={16} className="text-[#6d5dfc] shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Raffles */}
      <div className="glass-card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-500/20 rounded-lg text-amber-500"><Gift size={16} /></div>
            <h2 className="font-black text-white tracking-tight text-sm md:text-base">Active Raffles</h2>
          </div>
          <Link href="/raffles" className="text-[10px] font-black text-slate-500 hover:text-[#6d5dfc] uppercase tracking-widest transition-colors">See all</Link>
        </div>
        <div className="flex flex-col gap-2">
          {raffles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 bg-white/5 rounded-xl border border-dashed border-white/5 opacity-50">
              <Gift size={24} className="mb-1 text-slate-500" />
              <p className="text-xs text-slate-400">No active raffles</p>
            </div>
          ) : (
            raffles.slice(0, 3).map((raffle) => (
              <div key={raffle.id} className="p-3 bg-white/5 border border-white/5 rounded-xl flex justify-between items-center">
                <div className="min-w-0 mr-2">
                  <p className="text-xs font-black text-white line-clamp-1">{raffle.title}</p>
                  <p className="text-[10px] text-slate-500 font-bold mt-0.5">{raffle.draw_date ? new Date(raffle.draw_date).toDateString() : 'TBD'}</p>
                </div>
                <div className={`shrink-0 p-1 px-2 rounded-md text-[9px] font-black uppercase ${raffle.status === 'live' ? 'bg-red-500/20 text-red-500 animate-pulse' : 'bg-blue-500/20 text-blue-500'}`}>
                  {raffle.status}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="hidden md:block">
        <EmployeeCompensationCalculator
          userName={profile?.name ?? name}
          currentDate={currentMoment.date}
          currentTime={currentMoment.time}
          claimMetas={claimMetas}
          claimedSlots={claimedSlots.map((slot) => ({
            id: slot.id,
            date: slot.date,
            start_time: slot.start_time,
            end_time: slot.end_time,
            duration_hrs: Number(slot.duration_hrs ?? 0),
            shift_label: slot.shift_label,
          }))}
          dailySchedules={dailySchedules}
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  sublabel,
  color,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  sublabel: string;
  color: string;
}) {
  return (
    <div className="glass-card flex flex-col gap-2 md:gap-6 group hover:border-[#6d5dfc33] transition-all p-3 md:p-6">
      <div className="flex items-center gap-2">
        <div className="p-1.5 md:p-2.5 rounded-lg md:rounded-xl bg-white/5 border border-white/5 transition-all group-hover:bg-[#6d5dfc11]" style={{ color }}>
          {icon}
        </div>
        <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest leading-tight">{label}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-2xl md:text-4xl font-black text-white lining-nums group-hover:text-[#6d5dfc] transition-colors">{value}</span>
        <span className="text-[9px] md:text-[10px] font-bold text-slate-500 uppercase tracking-widest">{sublabel}</span>
      </div>
    </div>
  );
}
