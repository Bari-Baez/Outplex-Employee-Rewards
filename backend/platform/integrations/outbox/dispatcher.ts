import 'server-only';

import { z } from 'zod';
import { createServiceClient } from '@backend/platform/supabase/server';
import { writeOperationalEvent } from '@backend/platform/observability/operational-events';

const outboxJobSchema = z.object({
  id: z.string().uuid(),
  event_type: z.string().min(1).max(120),
  aggregate_type: z.string().min(1).max(80),
  aggregate_id: z.string().min(1).max(160),
  payload: z.unknown(),
  attempts: z.number().int().positive(),
}).passthrough();

export type OutboxJob = z.infer<typeof outboxJobSchema>;
export type OutboxHandler = (job: OutboxJob) => Promise<void>;

function errorCode(error: unknown): string {
  const name = error instanceof Error ? error.name : 'unknown_error';
  const normalized = name.toLowerCase().replace(/[^a-z0-9_.-]/g, '_').slice(0, 80);
  return normalized || 'unknown_error';
}

export async function dispatchOutboxBatch(input: {
  workerId: string;
  handlers: Readonly<Record<string, OutboxHandler>>;
  limit?: number;
}): Promise<{ claimed: number; processed: number; failed: number }> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(input.workerId)) {
    throw new Error('Invalid outbox worker ID.');
  }
  const limit = input.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid outbox batch limit.');

  const service = await createServiceClient();
  const { data, error } = await service.rpc('claim_integration_outbox_jobs', {
    p_worker_id: input.workerId,
    p_limit: limit,
  });
  if (error) throw new Error('Unable to claim integration jobs.');

  const jobs = z.array(outboxJobSchema).parse(data ?? []);
  let processed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const handler = input.handlers[job.event_type];
      if (!handler) throw new Error('UnsupportedEventType');
      await handler(job);
      const completion = await service.rpc('complete_integration_outbox_job', {
        p_job_id: job.id,
        p_worker_id: input.workerId,
      });
      if (completion.error || completion.data !== true) throw new Error('OutboxCompletionError');
      processed += 1;
    } catch (jobError) {
      failed += 1;
      await service.rpc('fail_integration_outbox_job', {
        p_job_id: job.id,
        p_worker_id: input.workerId,
        p_error_code: errorCode(jobError),
      });
      writeOperationalEvent('warn', 'integration.outbox_job_failed', {
        event_type: job.event_type,
        attempts: job.attempts,
        error_type: errorCode(jobError),
      });
    }
  }

  return { claimed: jobs.length, processed, failed };
}
