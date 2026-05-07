import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { sanitizeOTRows } from '@/lib/ot';
import type { CSVRow, BatchStatus } from '@/types/database';
import { isModeratorRole } from '@/lib/auth/roles';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';
import type { OTDateFormat } from '@/lib/utils';

async function requireModeratorOrAdmin() {
  const supabase = await createClient();
  const serviceClient = await createServiceClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !isModeratorRole(profile.role)) {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  const maintenance = await enforceSectionAvailability({
    serviceClient: serviceClient,
    toolKey: 'ot_staging',
    sectionKey: 'main',
    userRole: profile.role as string,
    bypassForAdmin: true,
  });
  if (maintenance) {
    return { error: maintenance };
  }

  return { user, serviceClient };
}

type PublishPayload = {
  rows: CSVRow[];
  batchName: string;
  batchId?: string | null;
  status?: BatchStatus;
  dateFormat?: OTDateFormat;
};

export async function POST(request: NextRequest) {
  const auth = await requireModeratorOrAdmin();
  if ('error' in auth) {
    return auth.error;
  }

  const { user, serviceClient } = auth;
  const payload = (await request.json()) as PublishPayload;
  const status = payload.status ?? 'published';
  const sanitizedRows = sanitizeOTRows(payload.rows ?? [], payload.dateFormat ?? 'auto');
  const batchName = payload.batchName?.trim() || `Batch ${new Date().toLocaleDateString()}`;

  if (sanitizedRows.length === 0) {
    return NextResponse.json({ error: 'No OT rows were provided.' }, { status: 400 });
  }

  const batchMutation = {
    name: batchName,
    status,
    uploaded_by: user.id,
    published_at: status === 'published' ? new Date().toISOString() : null,
    csv_data: sanitizedRows,
  };

  let batch:
    | {
        id: string;
        name: string;
        status: BatchStatus;
        published_at: string | null;
        csv_data: CSVRow[] | null;
        created_at: string;
      }
    | null = null;

  if (payload.batchId) {
    const { data, error } = await serviceClient
      .from('ot_batches')
      .update(batchMutation)
      .eq('id', payload.batchId)
      .select('id, name, status, published_at, csv_data, created_at')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Draft batch not found.' }, { status: 404 });
    }

    batch = data;
  } else {
    const { data, error } = await serviceClient
      .from('ot_batches')
      .insert(batchMutation)
      .select('id, name, status, published_at, csv_data, created_at')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Unable to create OT batch.' }, { status: 500 });
    }

    batch = data;
  }

  if (!batch) {
    return NextResponse.json({ error: 'Unable to save the OT batch.' }, { status: 500 });
  }

  if (status === 'draft') {
    await serviceClient.from('ot_slots').delete().eq('batch_id', batch.id);

    return NextResponse.json({
      data: [],
      batch,
      message: 'Draft saved successfully.',
    });
  }

  const { error: deleteError } = await serviceClient.from('ot_slots').delete().eq('batch_id', batch.id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const otSlots = sanitizedRows.map((row) => ({
    spot_id: row.spot_id,
    lob: row.lob || 'NYT VOICE',
    date: row.date,
    start_time: row.start_time,
    end_time: row.end_time,
    duration_hrs: row.duration_hrs ?? null,
    shift_label: row.shift_label ?? null,
    csv_status: row.csv_status ?? 'Pending',
    status: 'available' as const,
    published_by: user.id,
    batch_id: batch.id,
  }));

  // Insert in chunks to avoid oversized payloads / timeouts.
  const chunkSize = 500;
  for (let i = 0; i < otSlots.length; i += chunkSize) {
    const chunk = otSlots.slice(i, i + chunkSize);
    const { error: insertError } = await serviceClient.from('ot_slots').insert(chunk);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  if (status === 'published') {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/slack/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchName: batch.name,
          slotsCount: otSlots.length,
          firstDate: sanitizedRows[0]?.date,
          lastDate: sanitizedRows[sanitizedRows.length - 1]?.date,
        }),
      });
    } catch {
      console.error('Failed to notify Slack');
    }
  }

  return NextResponse.json({
    data: [],
    batch,
    message:
      status === 'published'
        ? `${otSlots.length} OT slots published successfully.`
        : `${otSlots.length} OT slots scheduled successfully.`,
  });
}
