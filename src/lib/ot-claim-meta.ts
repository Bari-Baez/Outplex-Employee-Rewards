export type OTClaimKind = 'day_off' | 'scheduled_extension' | 'recovery';

export interface OTClaimMeta {
  slotId: string;
  userId: string;
  claimKind: OTClaimKind;
  claimedAt: string;
  date?: string;
  startTime?: string;
  endTime?: string;
}

export const OT_CLAIM_META_PREFIX = 'ot_claim_meta:';

export function getOTClaimMetaKey(slotId: string) {
  return `${OT_CLAIM_META_PREFIX}${slotId}`;
}

export function parseOTClaimMeta(value: unknown): OTClaimMeta | null {
  if (!value) {
    return null;
  }

  let rawValue = value;
  if (typeof rawValue === 'string') {
    try {
      rawValue = JSON.parse(rawValue);
    } catch {
      return null;
    }
  }

  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    return null;
  }

  const record = rawValue as Record<string, unknown>;
  const slotId = typeof record.slotId === 'string' ? record.slotId : '';
  const userId = typeof record.userId === 'string' ? record.userId : '';
  const claimKind =
    record.claimKind === 'day_off' ||
    record.claimKind === 'scheduled_extension' ||
    record.claimKind === 'recovery'
      ? record.claimKind
      : null;
  const claimedAt = typeof record.claimedAt === 'string' ? record.claimedAt : '';

  if (!slotId || !userId || !claimKind || !claimedAt) {
    return null;
  }

  return {
    slotId,
    userId,
    claimKind,
    claimedAt,
    date: typeof record.date === 'string' ? record.date : undefined,
    startTime: typeof record.startTime === 'string' ? record.startTime : undefined,
    endTime: typeof record.endTime === 'string' ? record.endTime : undefined,
  };
}

export function getOTClaimKindLabel(kind: OTClaimKind) {
  if (kind === 'day_off') return 'Day Off OT';
  if (kind === 'recovery') return 'Recovery / Reposición';
  return 'Schedule Extension OT';
}
