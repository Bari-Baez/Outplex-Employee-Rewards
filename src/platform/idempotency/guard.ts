import 'server-only';

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';

const beginResultSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('acquired') }),
  z.object({ state: z.literal('conflict') }),
  z.object({ state: z.literal('in_progress') }),
  z.object({
    state: z.literal('replay'),
    responseStatus: z.number().int().min(100).max(599),
    responseBody: z.unknown(),
  }),
]);

export type IdempotencyBeginResult = z.infer<typeof beginResultSchema>;

export function hashIdempotentRequest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function parseIdempotencyKey(request: Request): string | null {
  const value = request.headers.get('idempotency-key')?.trim() ?? '';
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(value) ? value : null;
}

export async function beginIdempotentRequest(input: {
  actorId: string;
  scope: string;
  key: string;
  requestHash: string;
  ttlSeconds?: number;
}): Promise<IdempotencyBeginResult> {
  const service = await createServiceClient();
  const { data, error } = await service.rpc('begin_api_idempotency', {
    p_actor_id: input.actorId,
    p_scope: input.scope,
    p_idempotency_key: input.key,
    p_request_hash: input.requestHash,
    p_ttl_seconds: input.ttlSeconds ?? 86_400,
  });
  if (error) throw new Error('Idempotency guard is unavailable.');
  const parsed = beginResultSchema.safeParse(data);
  if (!parsed.success) throw new Error('Idempotency guard returned an invalid result.');
  return parsed.data;
}

export async function completeIdempotentRequest(input: {
  actorId: string;
  scope: string;
  key: string;
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
}): Promise<void> {
  const service = await createServiceClient();
  const { data, error } = await service.rpc('complete_api_idempotency', {
    p_actor_id: input.actorId,
    p_scope: input.scope,
    p_idempotency_key: input.key,
    p_request_hash: input.requestHash,
    p_response_status: input.responseStatus,
    p_response_body: input.responseBody,
  });
  if (error || data !== true) throw new Error('Unable to complete idempotent request.');
}

export async function failIdempotentRequest(input: {
  actorId: string;
  scope: string;
  key: string;
  requestHash: string;
}): Promise<void> {
  const service = await createServiceClient();
  const { error } = await service.rpc('fail_api_idempotency', {
    p_actor_id: input.actorId,
    p_scope: input.scope,
    p_idempotency_key: input.key,
    p_request_hash: input.requestHash,
  });
  if (error) throw new Error('Unable to release idempotent request.');
}
