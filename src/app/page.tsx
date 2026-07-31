import { redirect } from 'next/navigation';
import { createClient } from '@backend/platform/supabase/server';
import { LandingClient } from '@frontend/modules/access/ui/LandingClient';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect('/dashboard');
  }

  return <LandingClient />;
}
