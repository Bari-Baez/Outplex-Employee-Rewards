'use client';

import { useState } from 'react';
import { OnboardingModal } from '@frontend/modules/access/ui/OnboardingModal';
import type { User as UserType } from '@shared/contracts/database';

interface RoleRequestRef {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'reviewing';
  notes?: string | null;
}

interface OnboardingGuardProps {
  user: UserType;
  roleRequest: RoleRequestRef | null;
}

export function OnboardingGuard({ user, roleRequest }: OnboardingGuardProps) {
  const [showModal, setShowModal] = useState(true);

  if (!showModal) return null;

  return (
    <OnboardingModal
      user={user}
      roleRequest={roleRequest}
      onComplete={() => setShowModal(false)}
    />
  );
}
