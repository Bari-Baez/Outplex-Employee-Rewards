import { loadCommunicationsPage } from '@backend/modules/communications/application/load-communications-page';
import { ModeratorCommunicationsClient } from '@frontend/modules/communications/ui/ModeratorCommunicationsClient';
import { redirect } from 'next/navigation';

export type CommunicationsTab = 'notifications' | 'announcements';

export async function renderCommunicationsPage({
  initialTab,
}: {
  initialTab: CommunicationsTab;
}) {
  const result = await loadCommunicationsPage();

  if (!result.ok) {
    redirect(result.redirectTo);
  }

  return <ModeratorCommunicationsClient {...result.data} initialTab={initialTab} />;
}
