import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { loadActiveRafflesWithRuntime, loadRaffleFeed, syncRaffleLifecycle } from '@/lib/raffles/server';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';
import { isModeratorRole } from '@/lib/auth/roles';

export async function POST() {
  try {
    const supabase = await createClient();
    const serviceClient = await createServiceClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (!profile?.role || !isModeratorRole(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const maintenance = await enforceSectionAvailability({
      serviceClient: serviceClient,
      toolKey: 'raffle_engine',
      sectionKey: 'main',
      userRole: profile.role as string,
      bypassForAdmin: true,
    });
    if (maintenance) {
      return maintenance;
    }

    const activeRaffles = await loadActiveRafflesWithRuntime(serviceClient);

    await Promise.all(
      activeRaffles.map((item) => syncRaffleLifecycle(serviceClient, item.raffle, item.runtime)),
    );

    const feed = await loadRaffleFeed(serviceClient);
    return NextResponse.json({ data: feed });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected error while syncing raffles.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
