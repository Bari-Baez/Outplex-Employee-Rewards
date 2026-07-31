import type { Metadata } from 'next';
import { renderCommunicationsPage } from '@/app/_composition/communications-page';

export const metadata: Metadata = { title: 'Communications · Announcements' };

export default async function CommunicationsAnnouncementsPage() {
  return renderCommunicationsPage({ initialTab: 'announcements' });
}
