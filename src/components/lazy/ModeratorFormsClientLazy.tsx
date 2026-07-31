'use client';

import dynamic from 'next/dynamic';
import { AsyncState } from '@/components/ui/AsyncState';

const ModeratorFormsClient = dynamic(
  () =>
    import('@/app/(dashboard)/moderator/forms/ModeratorFormsClient').then(
      (module) => module.ModeratorFormsClient,
    ),
  {
    ssr: false,
    loading: () => (
      <AsyncState
        kind="loading"
        title="Loading form builder"
        description="Preparing the editor and reporting tools."
      />
    ),
  },
);

export function ModeratorFormsClientLazy({ moderatorName }: { moderatorName: string }) {
  return <ModeratorFormsClient moderatorName={moderatorName} />;
}
