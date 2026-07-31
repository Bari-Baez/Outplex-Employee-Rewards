import type { ClaimOtSlotInput, UnclaimOtSlotInput } from '@backend/modules/ot/contracts/claim';
import type { OtClaimRepository, OtMutationResult } from '@backend/modules/ot/application/ports';

export function claimOtSlot(
  repository: OtClaimRepository,
  userId: string,
  input: ClaimOtSlotInput,
): Promise<OtMutationResult> {
  return repository.claim(userId, input);
}

export function unclaimOtSlot(
  repository: OtClaimRepository,
  userId: string,
  input: UnclaimOtSlotInput,
): Promise<OtMutationResult> {
  return repository.unclaim(userId, input);
}
