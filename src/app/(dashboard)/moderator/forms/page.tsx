import { createClient, createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ModeratorFormsClient } from './ModeratorFormsClient';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Form Builder' };

export default async function ModeratorFormsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const serviceClient = await createServiceClient();
  const { data: profile } = await serviceClient.from('users').select('role, name, email').eq('id', user.id).single();
  if (!profile || !['moderator', 'moderator_a1', 'admin'].includes(profile.role as string)) redirect('/dashboard');

  return <ModeratorFormsClient moderatorName={profile.name as string} />;
}
