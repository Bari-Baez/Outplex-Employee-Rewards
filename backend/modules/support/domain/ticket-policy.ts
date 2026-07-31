import type { UserRole } from '@shared/contracts/database';
import type { SupportDepartment } from '@backend/modules/support/contracts/ticket';

export const SUPPORT_TICKET_COOLDOWN_MS = 5 * 60 * 60 * 1_000;

export function buildSupportSubject(department: SupportDepartment, message: string): string {
  const prefix = department === 'it' ? 'IT Support' : 'Moderator Support';
  const normalized = message.replace(/\s+/g, ' ').trim();
  return `${prefix}: ${normalized.slice(0, 72)}`;
}

export function supportCooldownHours(lastCreatedAt: string | null, now: Date): number | null {
  if (!lastCreatedAt) return null;
  const createdAt = new Date(lastCreatedAt).getTime();
  if (!Number.isFinite(createdAt)) return null;

  const remaining = SUPPORT_TICKET_COOLDOWN_MS - (now.getTime() - createdAt);
  return remaining > 0 ? Math.ceil(remaining / (60 * 60 * 1_000)) : null;
}

export function canManageSupportDepartment(role: UserRole, department: SupportDepartment): boolean {
  if (role === 'admin') return true;
  return (role === 'moderator_a1' || role === 'moderator_b1') && department === 'moderator';
}
