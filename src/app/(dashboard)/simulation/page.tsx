import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import { loadPresentationStatus } from '@backend/modules/simulation/application/presentation-service';
import { TOOL_KEYS } from '@backend/modules/shell/domain/tools-catalog';
import { loadMaintenanceBanner, loadSectionAvailability, loadToolAvailability } from '@backend/modules/shell/application/availability';
import { SimulationToolsClient } from '@frontend/modules/simulation/ui/SimulationToolsClient';

export const metadata: Metadata = {
  title: 'Simulation Tools',
};

export default async function SimulationPage() {
  const supabase = await createClient();
  const serviceClient = await createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await serviceClient
    .from('users')
    .select('id, name, role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard');
  }

  const initialStatus = await loadPresentationStatus(serviceClient);

  const [initialTools, initialSections, initialBanner] = await Promise.all([
    loadToolAvailability(serviceClient, TOOL_KEYS),
    loadSectionAvailability(serviceClient),
    loadMaintenanceBanner(serviceClient),
  ]);

  return <SimulationToolsClient initialStatus={initialStatus} initialTools={initialTools} initialSections={initialSections} initialBanner={initialBanner} />;
}
