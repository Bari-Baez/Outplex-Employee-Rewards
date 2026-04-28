'use client';

import { MandatoryFormGuard } from './MandatoryFormGuard';
import type { FormDefinition } from '@/lib/forms/types';

interface Props {
  pendingForms: FormDefinition[];
  userId: string;
  userName: string;
  userEmail: string;
  userEmployeeId: string | null;
}

export function DashboardGuard({ pendingForms, userId, userName, userEmail, userEmployeeId }: Props) {
  if (pendingForms.length === 0) return null;
  return (
    <MandatoryFormGuard
      pendingForms={pendingForms}
      userId={userId}
      userName={userName}
      userEmail={userEmail}
      userEmployeeId={userEmployeeId}
    />
  );
}
