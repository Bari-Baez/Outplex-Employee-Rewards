'use client';

import { MandatoryFormGuard } from '@frontend/modules/shell/ui/MandatoryFormGuard';
import type { FormDefinition } from '@backend/modules/forms/contracts/form';

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
