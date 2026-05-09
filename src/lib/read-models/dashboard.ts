import { unstable_cache } from 'next/cache';
import type { FormDefinition } from '@/lib/forms/types';
import type { MaintenanceBannerState, SectionAvailabilityMap, ToolAvailabilityMap } from '@/lib/tool-availability';
import { loadMaintenanceBanner, loadSectionAvailability, loadToolAvailability } from '@/lib/tool-availability';
import { TOOL_KEYS } from '@/lib/tools-catalog';
import { createServiceClient } from '@/lib/supabase/server';
import type { RaffleStatus } from '@/types/database';

const SHARED_REVALIDATE_SECONDS = 45;
const MANDATORY_FORM_SELECT =
  'id,title,description,fields,settings,status,created_by,published_at,created_at,updated_at,is_mandatory';

type CachedRaffleSummary = {
  id: string;
  title: string | null;
  draw_date: string | null;
  status: RaffleStatus;
};

type CachedOtLiveSlot = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  shift_label: string | null;
};

type AvailabilitySnapshot = {
  toolAvailability: ToolAvailabilityMap;
  sectionAvailability: SectionAvailabilityMap;
  maintenanceBanner: MaintenanceBannerState;
};

type ShellSharedSnapshot = {
  availableOtCount: number;
  firstAvailableSlot: CachedOtLiveSlot | null;
  liveRaffle: CachedRaffleSummary | null;
  upcomingRaffle: CachedRaffleSummary | null;
};

export const getCachedMandatoryPublishedForms = unstable_cache(
  async (): Promise<FormDefinition[]> => {
    const serviceClient = await createServiceClient();
    const { data, error } = await serviceClient
      .from('forms')
      .select(MANDATORY_FORM_SELECT)
      .eq('is_mandatory', true)
      .eq('status', 'published');

    if (error) {
      throw new Error(error.message ?? 'Unable to load mandatory forms.');
    }

    return (data ?? []) as FormDefinition[];
  },
  ['mandatory-published-forms:v1'],
  { revalidate: SHARED_REVALIDATE_SECONDS },
);

export const getCachedAvailabilitySnapshot = unstable_cache(
  async (): Promise<AvailabilitySnapshot> => {
    const serviceClient = await createServiceClient();
    const [toolAvailability, sectionAvailability, maintenanceBanner] = await Promise.all([
      loadToolAvailability(serviceClient, TOOL_KEYS),
      loadSectionAvailability(serviceClient),
      loadMaintenanceBanner(serviceClient),
    ]);

    return {
      toolAvailability,
      sectionAvailability,
      maintenanceBanner,
    };
  },
  ['app-availability-snapshot:v1'],
  { revalidate: SHARED_REVALIDATE_SECONDS },
);

export const getCachedDashboardRaffles = unstable_cache(
  async (): Promise<CachedRaffleSummary[]> => {
    const serviceClient = await createServiceClient();
    const { data, error } = await serviceClient
      .from('raffles')
      .select('id,title,draw_date,status')
      .in('status', ['upcoming', 'live'])
      .order('draw_date', { ascending: true })
      .limit(3);

    if (error) {
      throw new Error(error.message ?? 'Unable to load dashboard raffles.');
    }

    return (data ?? []) as CachedRaffleSummary[];
  },
  ['dashboard-raffles:v1'],
  { revalidate: SHARED_REVALIDATE_SECONDS },
);

export const getCachedShellSharedSnapshot = unstable_cache(
  async (): Promise<ShellSharedSnapshot> => {
    const serviceClient = await createServiceClient();
    const [otResult, liveRaffleResult, upcomingRaffleResult] = await Promise.all([
      serviceClient
        .from('ot_slots')
        .select('id,date,start_time,end_time,shift_label', { count: 'exact' })
        .eq('status', 'available')
        .limit(1),
      serviceClient
        .from('raffles')
        .select('id,title,draw_date,status')
        .eq('status', 'live')
        .order('draw_date', { ascending: true })
        .limit(1)
        .maybeSingle(),
      serviceClient
        .from('raffles')
        .select('id,title,draw_date,status')
        .eq('status', 'upcoming')
        .order('draw_date', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    return {
      availableOtCount: otResult.count ?? 0,
      firstAvailableSlot: ((otResult.data ?? [])[0] as CachedOtLiveSlot | undefined) ?? null,
      liveRaffle: (liveRaffleResult.data as CachedRaffleSummary | null | undefined) ?? null,
      upcomingRaffle: (upcomingRaffleResult.data as CachedRaffleSummary | null | undefined) ?? null,
    };
  },
  ['shell-live-snapshot:v1'],
  { revalidate: 30 },
);
