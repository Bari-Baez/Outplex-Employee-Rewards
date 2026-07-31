import 'server-only';

import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import type { ClaimOtSlotInput, UnclaimOtSlotInput } from '@/modules/ot/contracts/claim';
import type { OtClaimRepository, OtMutationCode, OtMutationResult } from '@/modules/ot/application/ports';

const rpcResultSchema = z.union([
  z.object({ ok: z.literal(true), slot: z.record(z.string(), z.unknown()) }),
  z.object({
    ok: z.literal(false),
    code: z.enum([
      'claim_changed',
      'daily_claim_exists',
      'forbidden',
      'invalid_claim_kind',
      'not_claimed',
      'not_owner',
      'slot_not_found',
      'slot_unavailable',
      'unclaim_window_expired',
    ]),
  }),
]);

function normalizeResult(data: unknown, error: unknown): OtMutationResult {
  if (error) return { ok: false, code: 'unavailable' };
  const parsed = rpcResultSchema.safeParse(data);
  if (!parsed.success) return { ok: false, code: 'unavailable' };
  return parsed.data as OtMutationResult;
}

export function createSupabaseOtClaimRepository(): OtClaimRepository {
  return {
    async claim(userId: string, input: ClaimOtSlotInput) {
      const service = await createServiceClient();
      const { data, error } = await service.rpc('claim_ot_slot_transactional', {
        p_user_id: userId,
        p_slot_id: input.slotId,
        p_claim_kind: input.claimKind,
      });
      return normalizeResult(data, error);
    },

    async unclaim(userId: string, input: UnclaimOtSlotInput) {
      const service = await createServiceClient();
      const { data, error } = await service.rpc('unclaim_ot_slot_transactional', {
        p_user_id: userId,
        p_slot_id: input.slotId,
        p_window_seconds: 1_200,
      });
      return normalizeResult(data, error);
    },
  };
}

export type { OtMutationCode };
