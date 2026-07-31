import { Suspense } from 'react';
import { createClient } from '@backend/platform/supabase/server';
import { redirect } from 'next/navigation';
import { ModeratorRafflesClient } from '@frontend/modules/raffles/ui/ModeratorRafflesClient';
import { isAtLeastModerator } from '@backend/modules/access/domain/permissions';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Raffle Management' };

export default async function ModeratorRaffles() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || !isAtLeastModerator(profile.role) || profile.role === 'moderator_b1') redirect('/dashboard');

  const { data: storeItems } = await supabase
    .from('store_items')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <Suspense>
      <ModeratorRafflesClient storeItems={storeItems ?? []} />
    </Suspense>
  );
}
