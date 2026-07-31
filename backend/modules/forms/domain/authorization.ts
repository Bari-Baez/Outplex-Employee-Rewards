import { isModeratorRole, MODERATOR_ROLES } from '@backend/modules/access/domain/roles';

// Backwards compatible exports (used across the app)
export const FORM_MODERATOR_ROLES = MODERATOR_ROLES;
export function isFormModeratorRole(role: unknown): boolean {
  return isModeratorRole(role);
}

