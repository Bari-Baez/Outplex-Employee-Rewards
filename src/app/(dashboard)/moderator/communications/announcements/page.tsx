import type { Metadata } from 'next';
import { renderCommunicationsPage } from '../renderCommunicationsPage';

export const metadata: Metadata = { title: 'Communications · Announcements' };

export default async function CommunicationsAnnouncementsPage() {
  return renderCommunicationsPage({ initialTab: 'announcements' });
}

