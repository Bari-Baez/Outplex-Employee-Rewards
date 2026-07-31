import { Suspense } from 'react';
import type { Metadata } from 'next';
import { createClient } from '@backend/platform/supabase/server';
import { redirect } from 'next/navigation';
import { RafflesHubClient } from '@frontend/modules/raffles/ui/RafflesHubClient';

export const metadata: Metadata = { title: 'Raffles' };

export default async function RafflesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <Suspense>
      <RafflesHubClient />
    </Suspense>
  );
}

