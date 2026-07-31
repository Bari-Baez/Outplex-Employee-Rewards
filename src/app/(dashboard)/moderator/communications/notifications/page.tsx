import type { Metadata } from 'next';
import { renderCommunicationsPage } from '@/app/_composition/communications-page';

export const metadata: Metadata = { title: 'Communications · Notifications' };

export default async function CommunicationsNotificationsPage() {
  return renderCommunicationsPage({ initialTab: 'notifications' });
}
