import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';
import { processFileBuffer, sha256 } from '@/lib/breaks';
import { createScheduleBatchAndSchedules } from '@/lib/breaks-server';

export const maxDuration = 60; // Allow up to 60s for large CSVs

// ─── POST /api/breaks/upload ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // 1. Auth check — only moderator_a1 and admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || !['moderator_a1', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = await createServiceClient();
  const maintenance = await enforceSectionAvailability({
    serviceClient: service,
    toolKey: 'breaks_manager',
    sectionKey: 'main',
    userRole: profile.role as string,
    bypassForAdmin: true,
  });
  if (maintenance) {
    return maintenance;
  }

  // 2. Read multipart form data
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const forceReplace = formData.get('force_replace') === 'true';

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const allowedTypes = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
  ];
  if (!allowedTypes.some((t) => file.type.includes(t.split('/')[1]) || file.name.match(/\.(csv|xlsx|xls)$/i))) {
    return NextResponse.json({ error: 'Only CSV and Excel files are supported' }, { status: 400 });
  }

  // 3. Read file content and compute hash for deduplication
  const fileBuffer = await file.arrayBuffer();
  // Decode a sample for hashing (or use the buffer directly if sha256 supports it)
  const fileText = new TextDecoder().decode(fileBuffer.slice(0, 5000)); 
  const contentHash = await sha256(fileText + file.name + file.size);

  // 4. Duplicate check
  const { data: existing } = await service
    .from('schedule_upload_batches')
    .select('id, name, status, schedule_date')
    .eq('file_hash', contentHash)
    .maybeSingle();

  if (existing && !forceReplace) {
    return NextResponse.json(
      {
        conflict: true,
        existingBatchId: existing.id,
        existingBatchName: existing.name,
        existingStatus: existing.status,
        existingDate: existing.schedule_date,
        message: 'This file has already been uploaded. Do you want to replace it?',
      },
      { status: 409 },
    );
  }

  // 5. Unified Parse
  const { rows: parsedRows, errors: parseErrors } = await processFileBuffer(fileBuffer, file.name);

  if (parseErrors.length > 0 && parsedRows.length === 0) {
    return NextResponse.json(
      { error: 'Failed to parse file or no valid data found.', details: parseErrors },
      { status: 400 },
    );
  }

  // 7. Processing (Database matching & insertion)
  try {
    const resultBatch = await createScheduleBatchAndSchedules({
      parsedRows,
      uploadedBy: user.id,
      sourceType: 'csv',
      fileHash: contentHash,
      forceReplace,
    });

    return NextResponse.json({
      success: true,
      batchId: resultBatch.batchId,
      batchName: resultBatch.batchName,
      scheduleDate: resultBatch.scheduleDate,
      matched: resultBatch.matchedCount,
      pendingReview: resultBatch.pendingReview,
      pendingReviewCount: resultBatch.pendingReview.length,
      message: resultBatch.pendingReview.length > 0
        ? `${resultBatch.matchedCount} employees matched. ${resultBatch.pendingReview.length} agents need manual assignment.`
        : `All ${resultBatch.matchedCount} employees matched successfully.`,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'DUPLICATE_FILE') {
      // Re-fetch existing batch for the conflict response
      const { data: existing } = await service
        .from('schedule_upload_batches')
        .select('id, name, status, schedule_date')
        .eq('file_hash', contentHash)
        .maybeSingle();

      return NextResponse.json(
        {
          conflict: true,
          existingBatchId: existing?.id,
          existingBatchName: existing?.name,
          existingStatus: existing?.status,
          existingDate: existing?.schedule_date,
          message: 'This file has already been uploaded. Do you want to replace it?',
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Processing failed' },
      { status: 500 },
    );
  }
}
