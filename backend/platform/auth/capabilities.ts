import 'server-only';

import { createClient } from '@backend/platform/supabase/server';
import type { UserRole } from '@shared/contracts/database';

export type Capability =
  | 'assets:upload:self-service'
  | 'assets:upload:managed'
  | 'jobs:maintenance'
  | 'media:proxy'
  | 'ocr:metrics'
  | 'ocr:ot'
  | 'ot:claim'
  | 'points:manage'
  | 'points:reset'
  | 'slack:notify'
  | 'store:checkout';

type AuthProfile = {
  id: string;
  role: UserRole;
  isApproved: boolean;
};

type AuthorizationResult =
  | { ok: true; profile: AuthProfile }
  | { ok: false; status: 401 | 403; error: 'Unauthorized' | 'Forbidden' };

const ALL_ROLES: readonly UserRole[] = [
  'employee',
  'staff',
  'moderator',
  'moderator_a1',
  'moderator_b1',
  'admin',
];

const MODERATOR_ROLES: readonly UserRole[] = [
  'moderator',
  'moderator_a1',
  'moderator_b1',
  'admin',
];

const ADMIN_ROLES: readonly UserRole[] = ['admin'];

const CAPABILITY_ROLES: Record<Capability, readonly UserRole[]> = {
  'assets:upload:self-service': ALL_ROLES,
  'assets:upload:managed': MODERATOR_ROLES,
  'jobs:maintenance': ADMIN_ROLES,
  'media:proxy': ALL_ROLES,
  'ocr:metrics': ALL_ROLES,
  'ocr:ot': MODERATOR_ROLES,
  'ot:claim': ALL_ROLES,
  'points:manage': ['moderator', 'moderator_a1', 'admin'],
  'points:reset': ADMIN_ROLES,
  'slack:notify': MODERATOR_ROLES,
  'store:checkout': ALL_ROLES,
};

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && ALL_ROLES.includes(value as UserRole);
}

export async function authorizeCapability(capability: Capability): Promise<AuthorizationResult> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role, is_approved')
    .eq('id', user.id)
    .maybeSingle();

  if (
    profileError
    || !profile
    || !isUserRole(profile.role)
    || profile.is_approved !== true
    || !CAPABILITY_ROLES[capability].includes(profile.role)
  ) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  return {
    ok: true,
    profile: { id: user.id, role: profile.role, isApproved: true },
  };
}

export function hasCapability(role: UserRole, capability: Capability): boolean {
  return CAPABILITY_ROLES[capability].includes(role);
}
