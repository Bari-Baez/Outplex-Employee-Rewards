import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Communications Studio' };

export default async function ModeratorCommunicationsPage() {
  redirect('/moderator/communications/notifications');
}
