import { createClient } from '@backend/platform/supabase/server';
import { redirect } from 'next/navigation';
import { StagingClient } from '@frontend/modules/ot/ui/StagingClient';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'OT Staging Editor',
};

export default async function StagingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['moderator_a1', 'admin', 'moderator'].includes(profile.role)) {
    redirect('/dashboard');
  }

  const { data: drafts } = await supabase
    .from('ot_batches')
    .select('id, name, status, csv_data, created_at, published_at')
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(6);

  return <StagingClient initialDrafts={drafts ?? []} />;
}
