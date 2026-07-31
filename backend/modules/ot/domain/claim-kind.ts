export type OTClaimKind = 'day_off' | 'scheduled_extension' | 'recovery';

export function getOTClaimKindLabel(kind: OTClaimKind) {
  if (kind === 'day_off') return 'Day Off OT';
  if (kind === 'recovery') return 'Recovery / Reposición';
  return 'Schedule Extension OT';
}
