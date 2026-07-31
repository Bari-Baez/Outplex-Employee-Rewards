export const MODERATOR_ROLES = ['moderator', 'moderator_a1', 'moderator_b1', 'admin'] as const;

export function isModeratorRole(role: unknown): boolean {
  return typeof role === 'string' && (MODERATOR_ROLES as readonly string[]).includes(role);
}

