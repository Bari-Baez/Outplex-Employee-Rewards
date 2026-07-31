import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { OTManagerClient } from '@frontend/modules/ot/ui/OTManagerClient';
import { getCurrentOTDateTime, shiftOTDate } from '@backend/modules/ot/domain/schedule';

export const metadata: Metadata = {
  title: 'OT Manager',
};

export default async function OTManagerPage() {
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

  if (!profile || !['moderator', 'moderator_a1', 'moderator_b1', 'admin'].includes(profile.role)) {
    redirect('/dashboard');
  }

  const serviceClient = await createServiceClient();
  const { date: todayIso } = getCurrentOTDateTime();
  const sixtyDaysAgoIso = shiftOTDate(todayIso, -60);
  const ninetyDaysAheadIso = shiftOTDate(todayIso, 90);

  const [slotsResult, usersResult] = await Promise.all([
    serviceClient
      .from('ot_slots')
      .select('*, claimedByUser:claimed_by(id, name, avatar_url, employee_id), batch:batch_id(id, name, status, published_at)')
      .gte('date', sixtyDaysAgoIso)
      .lte('date', ninetyDaysAheadIso)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true }),
    serviceClient
      .from('users')
      .select('id, name, email, employee_id, role, avatar_url, supervisor, supervisor_id')
      .order('name', { ascending: true }),
  ]);

  return (
    <OTManagerClient
      currentUser={profile}
      initialSlots={slotsResult.data ?? []}
      users={usersResult.data ?? []}
    />
  );
}
