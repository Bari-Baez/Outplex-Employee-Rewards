import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import { redirect } from 'next/navigation';
import { ShieldCheck, Users, Zap } from 'lucide-react';
import type { Metadata } from 'next';
import {
  getCurrentOTDateTime,
  getOTMonthStart,
  isOTSlotCompleted,
  isOTSlotUpcoming,
  shiftOTDate,
} from '@backend/modules/ot/domain/schedule';
import { EmployeeDashboard } from '@frontend/modules/dashboard/ui/EmployeeDashboard';
import { WorkforceDashboard } from '@frontend/modules/dashboard/ui/WorkforceDashboard';
import { SupervisorDashboard } from '@frontend/modules/dashboard/ui/SupervisorDashboard';
import { getCachedDashboardRaffles } from '@backend/modules/shell/application/shell-read-model';

export const metadata: Metadata = {
  title: 'Dashboard',
};

type SupervisorScopedRow = { user?: { supervisor_id?: string | null } | null };
const DASHBOARD_PROFILE_SELECT =
  'id,slack_id,name,email,avatar_url,role,employee_id,supervisor,supervisor_id,department,points,is_approved,role_revoked_at,created_at';
const CLAIMED_SLOT_SELECT =
  'id,spot_id,date,start_time,end_time,duration_hrs,shift_label,status,claimed_by,claimed_at,published_by,batch_id,created_at,lob,csv_status';
const DAILY_SCHEDULE_SELECT =
  'id,batch_id,employee_id,schedule_date,shift_start,shift_end,shift_length_hrs,first_break_start,first_break_end,lunch_start,lunch_end,second_break_start,second_break_end,third_break_start,third_break_end,is_ot_day,hour_type,lob,supervisor_name,supervisor_id,created_at,updated_at';

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select(DASHBOARD_PROFILE_SELECT)
    .eq('id', user.id)
    .single();

  if (!profile) {
    redirect('/login');
  }

  const currentMoment = getCurrentOTDateTime();
  const todayIso = currentMoment.date;
  const sixtyDaysAgoIso = shiftOTDate(todayIso, -60);
  const ninetyDaysAheadIso = shiftOTDate(todayIso, 90);
  const startOfMonthIso = getOTMonthStart(todayIso);
  const currentMonthPrefix = `${todayIso.slice(0, 7)}-`;

  const [claimedSlotsResult, raffles, dailySchedulesResult] = await Promise.all([
    supabase
      .from('ot_slots')
      .select(CLAIMED_SLOT_SELECT)
      .eq('claimed_by', user.id)
      .eq('status', 'claimed')
      .gte('date', sixtyDaysAgoIso)
      .lte('date', ninetyDaysAheadIso)
      .order('date', { ascending: false })
      .order('start_time', { ascending: false }),
    getCachedDashboardRaffles(),
    supabase
      .from('daily_schedules')
      .select(DAILY_SCHEDULE_SELECT)
      .eq('employee_id', user.id)
      .gte('schedule_date', sixtyDaysAgoIso)
      .lte('schedule_date', ninetyDaysAheadIso)
      .order('schedule_date', { ascending: false })
  ]);

  const claimedSlotsRaw = claimedSlotsResult.data ?? [];
  const claimedSlotIds = claimedSlotsRaw.map((slot) => slot.id);
  const claimMetasMap: Record<string, import('@backend/modules/ot/domain/claim-kind').OTClaimKind> = {};
  if (claimedSlotIds.length > 0) {
    const { data: metaRows } = await supabase.rpc('get_my_ot_claim_metadata', {
      p_slot_ids: claimedSlotIds,
    });
    for (const row of metaRows ?? []) {
      if (
        row.claim_kind === 'day_off'
        || row.claim_kind === 'scheduled_extension'
        || row.claim_kind === 'recovery'
      ) {
        claimMetasMap[row.slot_id] = row.claim_kind;
      }
    }
  }

  const claimedSlots = claimedSlotsRaw;
  const dailySchedulesRaw = dailySchedulesResult.data ?? [];

  // --- Moderator A1 / Admin Data ---
  let workforceStats = null;
  if (['admin', 'moderator_a1', 'moderator'].includes(profile.role)) {
    const service = await createServiceClient();
    const [empCount, otPending, storePending, activeStores, pointsSum] = await Promise.all([
      service.from('users').select('id', { count: 'exact', head: true }),
      service.from('ot_slots').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      service.from('employee_store_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      service.from('employee_stores').select('id', { count: 'exact', head: true }).eq('status', 'active'),
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
