import { createClient, createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ShieldCheck, Users, Zap } from 'lucide-react';
import type { Metadata } from 'next';
import {
  getCurrentOTDateTime,
  getOTMonthStart,
  isOTSlotCompleted,
  isOTSlotUpcoming,
  shiftOTDate,
} from '@/lib/ot';
import { EmployeeDashboard } from '@/components/dashboard/EmployeeDashboard';
import { WorkforceDashboard } from '@/components/dashboard/WorkforceDashboard';
import { SupervisorDashboard } from '@/components/dashboard/SupervisorDashboard';

export const metadata: Metadata = {
  title: 'Dashboard',
};

type SupervisorScopedRow = { user?: { supervisor_id?: string | null } | null };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  const currentMoment = getCurrentOTDateTime();
  const todayIso = currentMoment.date;
  const sixtyDaysAgoIso = shiftOTDate(todayIso, -60);
  const ninetyDaysAheadIso = shiftOTDate(todayIso, 90);
  const startOfMonthIso = getOTMonthStart(todayIso);
  const currentMonthPrefix = `${todayIso.slice(0, 7)}-`;

  const [claimedSlotsResult, rafflesResult, dailySchedulesResult] = await Promise.all([
    supabase
      .from('ot_slots')
      .select('*')
      .eq('claimed_by', user.id)
      .eq('status', 'claimed')
      .gte('date', sixtyDaysAgoIso)
      .lte('date', ninetyDaysAheadIso)
      .order('date', { ascending: false })
      .order('start_time', { ascending: false }),
    supabase
      .from('raffles')
      .select('*')
      .in('status', ['upcoming', 'live'])
      .order('draw_date', { ascending: true })
      .limit(3),
    supabase
      .from('daily_schedules')
      .select('*')
      .eq('employee_id', user.id)
      .gte('schedule_date', sixtyDaysAgoIso)
      .lte('schedule_date', ninetyDaysAheadIso)
      .order('schedule_date', { ascending: false })
  ]);

  const claimedSlotsRaw = claimedSlotsResult.data ?? [];
  const claimMetaKeys = claimedSlotsRaw.map(s => `ot_claim_meta:${s.id}`);
  const claimMetasMap: Record<string, import('@/lib/ot-claim-meta').OTClaimKind> = {};
  if (claimMetaKeys.length > 0) {
    const { data: metaRows } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', claimMetaKeys);
    if (metaRows) {
      const { parseOTClaimMeta } = await import('@/lib/ot-claim-meta');
      for (const row of metaRows) {
        const meta = parseOTClaimMeta(row.value);
        if (meta) claimMetasMap[meta.slotId] = meta.claimKind;
      }
    }
  }

  const claimedSlots = claimedSlotsRaw;
  const raffles = rafflesResult.data ?? [];
  const dailySchedulesRaw = dailySchedulesResult.data ?? [];

  // --- Moderator A1 / Admin Data ---
  let workforceStats = null;
  if (['admin', 'moderator_a1', 'moderator'].includes(profile.role)) {
    const service = await createServiceClient();
    const [empCount, otPending, storePending, activeStores, pointsSum] = await Promise.all([
      service.from('users').select('*', { count: 'exact', head: true }),
      service.from('ot_slots').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      service.from('employee_store_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      service.from('employee_stores').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      service.from('users').select('points'),
    ]);

    workforceStats = {
      totalEmployees: empCount.count ?? 0,
      pendingOT: otPending.count ?? 0,
      pendingStoreRequests: storePending.count ?? 0,
      activeStores: activeStores.count ?? 0,
      pointsDistributed: pointsSum.data?.reduce((acc, u) => acc + (u.points || 0), 0) ?? 0,
    };
  }

  // --- Moderator B1 (Supervisor) Data ---
  let supervisorStats = null;
  if (profile.role === 'moderator_b1') {
    const service = await createServiceClient();
    
    const [teamMembers, teamStoreRequests, teamOT] = await Promise.all([
      service.from('users').select('points').eq('supervisor_id', profile.id),
      service.from('employee_store_requests').select('id, user:users!employee_store_requests_user_id_fkey(supervisor_id)').eq('status', 'pending'),
      service.from('ot_slots').select('duration_hrs, user:users!ot_slots_claimed_by_fkey(supervisor_id)').eq('status', 'claimed').gte('date', startOfMonthIso),
    ]);

    const filteredStoreRequests = ((teamStoreRequests.data ?? []) as SupervisorScopedRow[]).filter(
      (request) => request.user?.supervisor_id === profile.id,
    );
    const filteredOT = ((teamOT.data ?? []) as Array<SupervisorScopedRow & { duration_hrs?: number | null }>).filter(
      (slot) => slot.user?.supervisor_id === profile.id,
    );

    supervisorStats = {
      teamSize: teamMembers.data?.length ?? 0,
      teamTotalPoints: teamMembers.data?.reduce((acc, u) => acc + (u.points || 0), 0) ?? 0,
      teamPendingStoreRequests: filteredStoreRequests.length,
      teamOTHours: filteredOT.reduce((acc, s) => acc + (s.duration_hrs || 0), 0),
    };
  }

  const upcomingSlots = claimedSlots
    .filter((slot) => isOTSlotUpcoming(slot, currentMoment))
    .sort((left, right) => {
      const dateCompare = left.date.localeCompare(right.date);
      return dateCompare !== 0 ? dateCompare : left.start_time.localeCompare(right.start_time);
    })
    .slice(0, 5);
    
  const recentSlots = claimedSlots
    .filter(
      (slot) =>
        slot.date >= sixtyDaysAgoIso &&
        isOTSlotCompleted(slot, currentMoment),
    )
    .sort((left, right) => {
      const dateCompare = right.date.localeCompare(left.date);
      return dateCompare !== 0 ? dateCompare : right.start_time.localeCompare(left.start_time);
    })
    .slice(0, 10);

  const monthSlots = claimedSlots.filter(
    (slot) => slot.date >= startOfMonthIso && slot.date.startsWith(currentMonthPrefix),
  );

  const totalHours = monthSlots.reduce((sum, slot) => sum + (slot.duration_hrs || 0), 0);
  const recentHours = recentSlots.reduce((sum, slot) => sum + (slot.duration_hrs || 0), 0);
  const name = profile?.name?.split(' ')[0] ?? 'there';

  if (workforceStats) {
    return <WorkforceDashboard stats={workforceStats} userName={profile.name} />;
  }

  if (supervisorStats) {
    return <SupervisorDashboard stats={supervisorStats} userName={profile.name} />;
  }

  return (
    <>
      {process.env.NEXT_PUBLIC_ENABLE_DEMO_FEATURES === 'true' && ['admin', 'moderator', 'moderator_a1'].includes(profile.role) && (
        <TestProfileGrid />
      )}
      <EmployeeDashboard
        profile={profile}
        name={name}
        totalHours={totalHours}
        recentHours={recentHours}
        upcomingSlots={upcomingSlots}
        raffles={raffles}
        claimedSlots={claimedSlots}
        currentMoment={currentMoment}
        claimMetas={claimMetasMap}
        dailySchedules={dailySchedulesRaw}
      />
    </>
  );
}

function TestProfileGrid() {
  const profiles = [
    { role: 'IT ADMIN', email: 'it@outplex.test', icon: <Zap size={18} /> },
    { role: 'MODERADOR A1', email: 'a1@outplex.test', icon: <ShieldCheck size={18} /> },
    { role: 'MODERADOR B1', email: 'b1@outplex.test', icon: <Users size={18} /> },
    { role: 'EMPLOYEE', email: 'employee@outplex.test', icon: <Zap size={18} /> },
  ];

  return (
    <div className="test-profiles-section" style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '20px', border: '1px solid var(--border-subtle)', marginBottom: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <Zap size={20} className="text-brand" />
        <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>Active Test Profiles</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        {profiles.map((p) => (
          <div key={p.role} style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem', color: 'var(--brand-primary-light)', fontWeight: 700, fontSize: '0.85rem' }}>
              {p.icon}
              <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{p.role}</span>
            </div>
            <code style={{ fontSize: '0.95rem', color: 'var(--text-primary)', wordBreak: 'break-all' }}>{p.email}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
