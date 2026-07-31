import type { createServiceClient } from '@backend/platform/supabase/server';

/**
 * Checks if a user has the 'employee' role.
 * Useful for guarding routes and pages specific to personal micro-stores.
 */
export async function requireEmployeeRole(
  userId: string,
  service: Awaited<ReturnType<typeof createServiceClient>>
): Promise<boolean> {
  try {
    const { data: profile } = await service
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();
    
    return profile?.role === 'employee';
  } catch (err) {
    console.error('requireEmployeeRole error:', err);
    return false;
  }
}
