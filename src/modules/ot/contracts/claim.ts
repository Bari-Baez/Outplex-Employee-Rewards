import { z } from 'zod';

export const otClaimKindSchema = z.enum(['day_off', 'scheduled_extension', 'recovery']);
export const claimOtSlotInputSchema = z.object({
  slotId: z.string().uuid(),
  claimKind: otClaimKindSchema,
}).strict();
export const unclaimOtSlotInputSchema = z.object({
  slotId: z.string().uuid(),
}).strict();

export type ClaimOtSlotInput = z.infer<typeof claimOtSlotInputSchema>;
export type UnclaimOtSlotInput = z.infer<typeof unclaimOtSlotInputSchema>;
