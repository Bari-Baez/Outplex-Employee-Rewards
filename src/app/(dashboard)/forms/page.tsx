import { createClient, createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { FormsHubClient } from './FormsHubClient';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Forms' };

export default async function FormsPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const serviceClient = await createServiceClient();
  const { data: profile } = await serviceClient
    .from('users')
    .select('id, name, email, employee_id')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/login');

  const { open } = await searchParams;

  return (
    <FormsHubClient
      userId={profile.id as string}
      userName={profile.name as string}
      userEmail={profile.email as string}
      userEmployeeId={profile.employee_id as string | null}
      autoOpenFormId={open}
    />
  );
}
