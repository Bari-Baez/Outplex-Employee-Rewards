import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';
import { logServerError } from '@/platform/observability/request-context';

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  source: 'database' | 'memory';
};

type MemoryBucket = { count: number; expiresAt: number };
const memoryBuckets = new Map<string, MemoryBucket>();
const MAX_MEMORY_BUCKETS = 10_000;

function memoryDecision(scope: string, subject: string, limit: number, windowSeconds: number): RateLimitDecision {
  const now = Date.now();
  const key = `${scope}:${subject}`;
  const existing = memoryBuckets.get(key);
  const bucket = !existing || existing.expiresAt <= now
    ? { count: 0, expiresAt: now + windowSeconds * 1_000 }
    : existing;
  bucket.count = Math.min(bucket.count + 1, limit + 1);
  memoryBuckets.set(key, bucket);

  if (memoryBuckets.size > MAX_MEMORY_BUCKETS) {
    for (const [bucketKey, value] of memoryBuckets) {
      if (value.expiresAt <= now || memoryBuckets.size > MAX_MEMORY_BUCKETS) memoryBuckets.delete(bucketKey);
      if (memoryBuckets.size <= MAX_MEMORY_BUCKETS) break;
    }
  }

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.expiresAt - now) / 1_000)),
    source: 'memory',
  };
}

function parseDatabaseDecision(value: unknown): Omit<RateLimitDecision, 'source'> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.allowed !== 'boolean') return null;
  if (!Number.isInteger(record.remaining) || !Number.isInteger(record.retryAfterSeconds)) return null;
  return {
    allowed: record.allowed,
    remaining: Math.max(0, Number(record.remaining)),
    retryAfterSeconds: Math.max(1, Number(record.retryAfterSeconds)),
  };
}

export async function consumeRateLimit(input: {
  scope: string;
  subject: string;
  limit: number;
  windowSeconds: number;
  requestId: string;
}): Promise<RateLimitDecision> {
  if (!/^[a-z0-9:._-]{1,100}$/i.test(input.scope)) throw new Error('Invalid rate-limit scope.');
  if (!/^[a-z0-9:._-]{1,200}$/i.test(input.subject)) throw new Error('Invalid rate-limit subject.');
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 10_000) throw new Error('Invalid rate limit.');
  if (!Number.isInteger(input.windowSeconds) || input.windowSeconds < 1 || input.windowSeconds > 86_400) {
    throw new Error('Invalid rate-limit window.');
  }

  try {
    const service = await createServiceClient();
    const { data, error } = await service.rpc('consume_api_rate_limit', {
      p_scope: input.scope,
      p_subject: input.subject,
      p_limit: input.limit,
      p_window_seconds: input.windowSeconds,
    });
    const parsed = error ? null : parseDatabaseDecision(data);
    if (parsed) return { ...parsed, source: 'database' };
    if (error) logServerError('rate_limit.database', input.requestId, error);
  } catch (error) {
    logServerError('rate_limit.database', input.requestId, error);
  }

  // Safe rollout fallback before the forward-only migration is promoted.
  // It bounds one process but is not a substitute for the distributed gate.
  return memoryDecision(input.scope, input.subject, input.limit, input.windowSeconds);
}
