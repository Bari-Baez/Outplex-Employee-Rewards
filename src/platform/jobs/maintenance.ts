import 'server-only';

import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';

const maintenanceResultSchema = z.object({
  rateLimitBuckets: z.number().int().nonnegative(),
  idempotencyKeys: z.number().int().nonnegative(),
  outboxJobs: z.number().int().nonnegative(),
}).strict();

export type PlatformMaintenanceResult = z.infer<typeof maintenanceResultSchema>;

export async function runPlatformMaintenance(limit = 1_000): Promise<PlatformMaintenanceResult> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
    throw new Error('Invalid maintenance batch limit.');
  }

  const service = await createServiceClient();
  const { data, error } = await service.rpc('cleanup_platform_runtime_data', { p_limit: limit });
  if (error) throw new Error('Platform maintenance RPC failed.');

  const parsed = maintenanceResultSchema.safeParse(data);
  if (!parsed.success) throw new Error('Platform maintenance returned an invalid result.');
  return parsed.data;
}
