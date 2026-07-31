import { type NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import { isModeratorRole } from '@backend/modules/access/domain/roles';
import { canonicalizeOTLob, getCurrentOTDateTime, isOTSlotRecentlyAdded, isOTSlotUpcoming } from '@backend/modules/ot/domain/schedule';
import type { OTSlot } from '@shared/contracts/database';

export const maxDuration = 15;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !isModeratorRole(profile.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const status           = sp.get('status') ?? 'all';
  const dateFrom         = sp.get('dateFrom') ?? '';
  const dateTo           = sp.get('dateTo') ?? '';
  const supervisorFilter = sp.get('supervisorFilter') ?? 'all';
  const employeeQuery    = sp.get('employeeQuery')?.toLowerCase() ?? '';

  const today = new Date();
  const defaultFrom = new Date(today); defaultFrom.setDate(today.getDate() - 60);
  const defaultTo   = new Date(today); defaultTo.setDate(today.getDate() + 90);
  const effectiveFrom = dateFrom || defaultFrom.toISOString().slice(0, 10);
  const effectiveTo   = dateTo   || defaultTo.toISOString().slice(0, 10);

  const service = await createServiceClient();

  const [slotsRes, usersRes] = await Promise.all([
    service
      .from('ot_slots')
      .select('*, claimedByUser:claimed_by(id, name, avatar_url, employee_id), batch:batch_id(id, name, status, published_at)')
      .gte('date', effectiveFrom)
      .lte('date', effectiveTo)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true }),
    service
      .from('users')
      .select('id, name, email, employee_id, supervisor, supervisor_id')
      .order('name', { ascending: true }),
  ]);

  if (slotsRes.error) return NextResponse.json({ error: slotsRes.error.message }, { status: 500 });
  if (usersRes.error) return NextResponse.json({ error: usersRes.error.message }, { status: 500 });

  type UserRow = { id: string; name: string; email: string | null; employee_id: string | null; supervisor: string | null; supervisor_id: string | null };
  const usersById = new Map<string, UserRow>((usersRes.data ?? []).map(u => [u.id, u as UserRow]));

  let slots = (slotsRes.data ?? []) as OTSlot[];

  const currentMoment = getCurrentOTDateTime();
  const now = new Date();

  if (status === 'claimed') slots = slots.filter(s => s.status === 'claimed');
  else if (status === 'available') slots = slots.filter(s => s.status === 'available');
  else if (status === 'upcoming') slots = slots.filter(s => isOTSlotUpcoming(s, currentMoment));
  else if (status === 'recently_added') slots = slots.filter(s => isOTSlotRecentlyAdded(s, now, 5));

  if (supervisorFilter === 'my-team') {
    slots = slots.filter(s => {
      const u = usersById.get(s.claimed_by ?? '');
      return u?.supervisor_id === user.id;
    });
  } else if (supervisorFilter && supervisorFilter !== 'all') {
    slots = slots.filter(s => {
      const u = usersById.get(s.claimed_by ?? '');
      return u?.supervisor_id === supervisorFilter;
    });
  }

  if (employeeQuery) {
    slots = slots.filter(s => {
      const u = usersById.get(s.claimed_by ?? '');
      const slotAny = s as OTSlot & { claimedByUser?: { name?: string; employee_id?: string } };
      const name  = (slotAny.claimedByUser?.name ?? u?.name ?? '').toLowerCase();
      const empId = (slotAny.claimedByUser?.employee_id ?? u?.employee_id ?? '').toLowerCase();
      const email = (u?.email ?? '').toLowerCase();
      return name.includes(employeeQuery) || empId.includes(employeeQuery) || email.includes(employeeQuery);
    });
  }

  const rows = slots.map(slot => {
    const u = usersById.get(slot.claimed_by ?? '');
    const slotAny = slot as OTSlot & { claimedByUser?: { name?: string; employee_id?: string } };
    return {
      employee_name:     slotAny.claimedByUser?.name ?? u?.name ?? 'Unassigned',
      employee_id:       slotAny.claimedByUser?.employee_id ?? u?.employee_id ?? '',
      employee_email:    u?.email ?? '',
      employee_superior: u?.supervisor ?? '',
      spot_id:           slot.spot_id ?? '',
      lob:               canonicalizeOTLob(slot.lob),
      date:              slot.date,
      start_time:        String(slot.start_time),
      end_time:          String(slot.end_time),
      duration_hrs:      String(slot.duration_hrs ?? ''),
      shift_label:       slot.shift_label ?? '',
      csv_status:        slot.csv_status ?? '',
      ot_status:         slot.status,
    };
  });

  return NextResponse.json({ rows, dateFrom: effectiveFrom, dateTo: effectiveTo });
}
