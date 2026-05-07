import { type NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { isModeratorRole } from '@/lib/auth/roles';
import { generateOTExcel, type OTExcelUser, type OTExcelMeta } from '@/lib/ot-excel';
import type { OTSlot } from '@/types/database';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('role, name')
    .eq('id', user.id)
    .single();

  if (!profile || !isModeratorRole(profile.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Query params ──────────────────────────────────────────────────────────
  const sp = req.nextUrl.searchParams;
  const status          = sp.get('status') ?? 'all';           // 'all' | 'claimed' | 'available'
  const dateFrom        = sp.get('dateFrom') ?? '';
  const dateTo          = sp.get('dateTo') ?? '';
  const supervisorFilter = sp.get('supervisorFilter') ?? 'all'; // 'all' | 'my-team' | supervisor-name
  const employeeQuery   = sp.get('employeeQuery')?.toLowerCase() ?? '';

  // ── Default date range: same window as OT Manager page (-60 / +90 days) ──
  const today = new Date();
  const defaultFrom = new Date(today); defaultFrom.setDate(today.getDate() - 60);
  const defaultTo   = new Date(today); defaultTo.setDate(today.getDate() + 90);
  const effectiveFrom = dateFrom || defaultFrom.toISOString().slice(0, 10);
  const effectiveTo   = dateTo   || defaultTo.toISOString().slice(0, 10);

  // ── DB queries ────────────────────────────────────────────────────────────
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

  const usersById = new Map<string, OTExcelUser>(
    (usersRes.data ?? []).map(u => [u.id, u as OTExcelUser]),
  );

  // ── Filter slots ──────────────────────────────────────────────────────────
  let slots = (slotsRes.data ?? []) as OTSlot[];

  // Status filter
  if (status === 'claimed') {
    slots = slots.filter(s => s.status === 'claimed');
  } else if (status === 'available') {
    slots = slots.filter(s => s.status === 'available');
  }
  // 'all' → no additional filter

  // Supervisor filter
  if (supervisorFilter === 'my-team') {
    slots = slots.filter(s => {
      const u = usersById.get(s.claimed_by ?? '');
      return u?.supervisor_id === user.id;
    });
  } else if (supervisorFilter && supervisorFilter !== 'all') {
    // supervisorFilter is the supervisor's user ID (UUID), matching client-side behaviour
    slots = slots.filter(s => {
      const u = usersById.get(s.claimed_by ?? '');
      return u?.supervisor_id === supervisorFilter;
    });
  }

  // Employee search filter (name / email / employee_id)
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

  // ── Build meta ────────────────────────────────────────────────────────────
  const labelMap: Record<string, string> = {
    all:       'All Slots',
    claimed:   'Claimed Slots',
    available: 'Pending Slots',
  };
  const filterParts: string[] = [labelMap[status] ?? 'All Slots'];
  if (supervisorFilter === 'my-team') filterParts.push('My Team');
  else if (supervisorFilter && supervisorFilter !== 'all') filterParts.push(`Supervisor: ${supervisorFilter}`);
  if (employeeQuery) filterParts.push(`Employee: "${employeeQuery}"`);

  const meta: OTExcelMeta = {
    dateFrom:    effectiveFrom,
    dateTo:      effectiveTo,
    filterLabel: filterParts.join('  |  '),
    generatedBy: (profile.name as string | null) ?? user.email ?? 'System',
    generatedAt: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
  };

  // ── Generate XLSX ─────────────────────────────────────────────────────────
  let buffer: Buffer;
  try {
    buffer = await generateOTExcel(slots, usersById, meta);
  } catch (err) {
    console.error('[ot/export/xlsx]', err);
    return NextResponse.json({ error: 'Failed to generate Excel file.' }, { status: 500 });
  }

  const dateLabel = effectiveFrom === effectiveTo ? effectiveFrom : `${effectiveFrom}_${effectiveTo}`;
  const filename = `Outplex-OT-Report-${dateLabel}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
