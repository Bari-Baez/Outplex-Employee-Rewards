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
  recentSlots: OTSlot[];
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
  recentSlots,
  raffles,
  claimedSlots,
  currentMoment,
  claimMetas = {},
  dailySchedules = [],
}: EmployeeDashboardProps) {
  return (
    <div className="flex flex-col gap-8 w-full max-w-[1600px] p-4 md:p-6">
      {/* Header Bento Section */}
      <div className="glass-card bento-card--full flex flex-col md:flex-row justify-between items-center gap-6 bg-gradient-to-br from-white/5 to-transparent border-t border-white/10">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="p-1 px-3 bg-[#6d5dfc]/20 text-[#6d5dfc] text-[10px] font-black rounded-lg uppercase tracking-widest">Dashboard</span>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">
            Welcome back, <span className="text-[#6d5dfc]">{name}</span>
          </h1>
          <p className="text-slate-400 font-medium max-w-lg">Your OT reservations, recent history, and live activity are all synced and ready.</p>
        </div>
        <Link href="/ot-calendar" className="group relative flex items-center gap-3 px-8 py-4 bg-[#6d5dfc] text-white font-black rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-[0_20px_50px_rgba(109,93,252,0.2)]">
          <CalendarDays size={20} />
          BOOK NEW OT
          <div className="absolute inset-0 bg-white/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
      </div>

      {/* Stats Bento Grid */}
      <div className="bento-grid">
        <StatCard 
          label="Hours This Month" 
          value={totalHours.toFixed(1)} 
          icon={<TrendingUp size={16} />} 
          sublabel="OT Hours Tracked" 
          color="#6d5dfc"
          className="col-span-12 sm:col-span-6 lg:col-span-3"
        />
        <StatCard 
          label="Upcoming OT" 
          value={`${upcomingSlots.length}`} 
          icon={<Clock size={16} />} 
          sublabel="Active Reservations" 
          color="#10b981"
          className="col-span-12 sm:col-span-6 lg:col-span-3"
        />
        <StatCard 
          label="Last 60 Days" 
          value={recentHours.toFixed(1)} 
          icon={<History size={16} />} 
          sublabel="Performance Log" 
          color="#06b6d4"
          className="col-span-12 sm:col-span-6 lg:col-span-3"
        />
        <StatCard 
          label="Points Balance" 
          value={`${profile?.points ?? 0}`} 
          icon={<Zap size={16} />} 
          sublabel="Ready to Spend" 
          color="#fbbf24"
          className="col-span-12 sm:col-span-6 lg:col-span-3"
        />

        {/* Breaks Widget - Wide */}
        <div className="bento-card--wide glass-card relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Zap size={120} />
          </div>
          <BreaksLunchWidget />
        </div>

        {/* Raffles Side - Small */}
        <div className="bento-card glass-card flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/20 rounded-lg text-amber-500"><Gift size={18} /></div>
              <h2 className="font-black text-white tracking-tight">Active Raffles</h2>
            </div>
            <Link href="/raffles" className="text-[10px] font-black text-slate-500 hover:text-[#6d5dfc] uppercase tracking-widest transition-colors">See all</Link>
          </div>
          <div className="flex flex-col gap-3 flex-1">
            {raffles.length === 0 ? (
               <div className="flex-1 flex flex-col items-center justify-center text-center p-4 bg-white/5 rounded-2xl border border-dashed border-white/5 opacity-50">
                <Gift size={32} className="mb-2 text-slate-500" />
                <p className="text-xs text-slate-400">No active raffles</p>
              </div>
            ) : (
              raffles.slice(0, 3).map((raffle) => (
                <div key={raffle.id} className="p-4 bg-white/5 border border-white/5 rounded-xl flex justify-between items-center group hover:bg-white/10 transition-all">
                  <div>
                    <p className="text-xs font-black text-white line-clamp-1">{raffle.title}</p>
                    <p className="text-[10px] text-slate-500 font-bold mt-0.5">{raffle.draw_date ? new Date(raffle.draw_date).toDateString() : 'TBD'}</p>
                  </div>
                  <div className={`p-1 px-2 rounded-md text-[9px] font-black uppercase ${raffle.status === 'live' ? 'bg-red-500/20 text-red-500 animate-pulse' : 'bg-blue-500/20 text-blue-500'}`}>
                    {raffle.status}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Upcoming List - Wide */}
        <div className="bento-card--wide glass-card">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#6d5dfc]/20 rounded-lg text-[#6d5dfc]"><Clock size={18} /></div>
              <h2 className="font-black text-white tracking-tight">My Upcoming OT Reservations</h2>
            </div>
          </div>
          {upcomingSlots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 bg-white/5 rounded-3xl border border-dashed border-white/10 opacity-60">
              <CalendarDays size={48} className="mb-4 text-slate-600" />
              <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">No reservations found</p>
              <Link href="/ot-calendar" className="mt-4 text-xs font-black text-[#6d5dfc] hover:underline underline-offset-4">Claim your first slot</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {upcomingSlots.map((slot) => (
                <div key={slot.id} className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center gap-4 hover:border-[#6d5dfc]/30 hover:bg-white/10 transition-all group">
                  <div className="h-14 w-14 rounded-xl bg-white/5 border border-white/5 flex flex-col items-center justify-center overflow-hidden">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter bg-white/5 w-full text-center py-0.5">{new Date(`${slot.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}</span>
                    <span className="text-xl font-black text-white">{new Date(`${slot.date}T00:00:00`).getDate()}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-black text-white">{formatTime(slot.start_time)} — {formatTime(slot.end_time)}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{slot.shift_label || 'Regular OT'}</p>
                  </div>
                  <div className="text-[#6d5dfc]">
                    <ChevronRight size={18} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Counter Card - Small */}
        <div className="bento-card glass-card flex flex-col justify-center items-center text-center bg-[#6d5dfc]/5">
           <div className="p-4 bg-[#6d5dfc]/20 rounded-full text-[#6d5dfc] mb-4">
             <Clock size={32} />
           </div>
           <p className="text-4xl font-black text-white leading-none">{totalHours.toFixed(1)}</p>
           <p className="text-[10px] font-black text-[#6d5dfc] uppercase tracking-[0.2em] mt-2">Hours Logged</p>
        </div>
      </div>

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
  );
}

function StatCard({
  label,
  value,
  icon,
  sublabel,
  color,
  className,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  sublabel: string;
  color: string;
  className?: string;
}) {
  return (
    <div className={`glass-card ${className || ''} flex flex-col gap-6 group hover:border-[#6d5dfc33] transition-all`}>
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 transition-all group-hover:bg-[#6d5dfc11]" style={{ color: color }}>
          {icon}
        </div>
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{label}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-4xl font-black text-white lining-nums group-hover:text-[#6d5dfc] transition-colors">{value}</span>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{sublabel}</span>
      </div>
    </div>
  );
}
