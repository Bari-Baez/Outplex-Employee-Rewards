import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';
import type { ClaimOtSlotInput } from '@/modules/ot/contracts/claim';

export async function setOtClaimMetadata(input: ClaimOtSlotInput & {
  userId: string;
  claimedAt: string;
}): Promise<void> {
  const service = await createServiceClient();
  const { data, error } = await service.rpc('set_ot_claim_metadata', {
    p_slot_id: input.slotId,
    p_user_id: input.userId,
    p_claim_kind: input.claimKind,
    p_claimed_at: input.claimedAt,
  });
  if (error || data !== true) throw new Error('Unable to store OT claim metadata.');
}

export async function deleteOtClaimMetadata(slotId: string): Promise<void> {
  const service = await createServiceClient();
  const { data, error } = await service.rpc('delete_ot_claim_metadata', { p_slot_id: slotId });
  if (error || data !== true) throw new Error('Unable to delete OT claim metadata.');
}
