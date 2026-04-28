import { UserRole } from '@/types/database';

/**
 * Checks if a role has moderator-level access or higher.
 */
export function isAtLeastModerator(role: UserRole): boolean {
  return ['admin', 'moderator', 'moderator_a1', 'moderator_b1'].includes(role);
}

/**
 * Checks if a role is the TI (Admin) role.
 */
export function isTI(role: UserRole): boolean {
  return role === 'admin';
}

/**
 * Checks if a role is a Moderator A1 (Advanced).
 */
export function isModeratorA1(role: UserRole): boolean {
  return role === 'moderator_a1';
}

/**
 * Checks if a role is a Moderator B1 (Supervisor).
 */
export function isModeratorB1(role: UserRole): boolean {
  return role === 'moderator_b1';
}

/**
 * Determines if a user can edit a specific tool based on their role.
 * Some roles have "view-only" access to certain tools.
 */
export function canEditTool(role: UserRole, tool: 'ot-manager' | 'store-ops' | 'employees' | 'employee-stores' | 'fulfill-orders'): boolean {
  if (isTI(role) || isModeratorA1(role)) return true;
  
  // Moderator B1 has view-only access to these tools
  if (isModeratorB1(role)) {
    return false;
  }
  
  return false;
}

/**
 * Checks if a user has access to a specific sidebar item.
 */
export function hasNavAccess(role: UserRole, itemRoles: UserRole[]): boolean {
  return itemRoles.includes(role);
}
