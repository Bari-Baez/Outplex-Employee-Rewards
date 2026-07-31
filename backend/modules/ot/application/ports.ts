import type { ClaimOtSlotInput, UnclaimOtSlotInput } from '@backend/modules/ot/contracts/claim';

export type OtMutationCode =
  | 'claim_changed'
  | 'daily_claim_exists'
  | 'forbidden'
  | 'invalid_claim_kind'
  | 'not_claimed'
  | 'not_owner'
  | 'slot_not_found'
  | 'slot_unavailable'
  | 'unclaim_window_expired'
  | 'unavailable';

export type OtMutationResult =
  | { ok: true; slot: Record<string, unknown> }
  | { ok: false; code: OtMutationCode };

export interface OtClaimRepository {
  claim(userId: string, input: ClaimOtSlotInput): Promise<OtMutationResult>;
  unclaim(userId: string, input: UnclaimOtSlotInput): Promise<OtMutationResult>;
}
