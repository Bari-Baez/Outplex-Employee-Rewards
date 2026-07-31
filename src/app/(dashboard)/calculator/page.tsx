import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Calculator, ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getCurrentOTDateTime, shiftOTDate } from '@/lib/ot';
import { EmployeeCompensationCalculator } from '@/app/(dashboard)/dashboard/EmployeeCompensationCalculator';

export const metadata: Metadata = {
  title: 'Calculator',
};

export default async function CalculatorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('users')
    .select('id, name, role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'employee') {
    redirect('/dashboard');
  }

  const currentMoment = getCurrentOTDateTime();
  const sixtyDaysAgoIso = shiftOTDate(currentMoment.date, -60);
  const ninetyDaysAheadIso = shiftOTDate(currentMoment.date, 90);

  const [claimedSlotsResult, dailySchedulesResult] = await Promise.all([
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
      .from('daily_schedules')
      .select('*')
      .eq('employee_id', user.id)
      .gte('schedule_date', sixtyDaysAgoIso)
      .lte('schedule_date', ninetyDaysAheadIso)
      .order('schedule_date', { ascending: false }),
  ]);

  const claimedSlotsRaw = claimedSlotsResult.data ?? [];
  const claimedSlotIds = claimedSlotsRaw.map((slot) => slot.id);
  const claimMetasMap: Record<string, import('@/lib/ot-claim-meta').OTClaimKind> = {};

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

  return (
    <div className="flex flex-col gap-4 max-w-[980px] pb-4">
      <section className="card" style={{ padding: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.6rem' }}>
          <div
            style={{
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: '14px',
              display: 'grid',
              placeItems: 'center',
              background: 'rgba(124,108,255,0.14)',
              color: '#8b7bff',
            }}
          >
            <Calculator size={18} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900 }}>Compensation Calculator</h1>
            <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.84rem' }}>
              Mobile view with a dedicated layout so the full calculation is easier to read and edit.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700 }}>
          <ChevronLeft size={14} />
          Open the `More` menu anytime to come back here.
        </div>
      </section>

      <EmployeeCompensationCalculator
        userName={profile.name}
        currentDate={currentMoment.date}
        currentTime={currentMoment.time}
        claimMetas={claimMetasMap}
        claimedSlots={claimedSlotsRaw.map((slot) => ({
          id: slot.id,
          date: slot.date,
          start_time: slot.start_time,
          end_time: slot.end_time,
          duration_hrs: Number(slot.duration_hrs ?? 0),
          shift_label: slot.shift_label,
        }))}
        dailySchedules={dailySchedulesResult.data ?? []}
      />
    </div>
  );
}
