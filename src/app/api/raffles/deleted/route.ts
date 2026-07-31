import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import { enforceSectionAvailability } from '@backend/modules/shell/application/section-guard';
import { isModeratorRole } from '@backend/modules/access/domain/roles';
import { assertModeratorAccess } from '@backend/modules/raffles/application/raffle-service';

export const RAFFLE_DELETED_KEY_PREFIX = 'raffle_deleted:';

export async function GET() {
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
    if (!profile?.role) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const maintenance = await enforceSectionAvailability({
      serviceClient: serviceClient,
      toolKey: isModeratorRole(profile.role) ? 'raffle_engine' : 'raffles',
      sectionKey: 'main',
      userRole: profile.role as string,
      bypassForAdmin: true,
    });
    if (maintenance) {
      return maintenance;
    }

    await assertModeratorAccess(serviceClient, user.id);

    const { data, error } = await serviceClient
      .from('app_settings')
      .select('key, value')
      .like('key', `${RAFFLE_DELETED_KEY_PREFIX}%`);

    if (error) throw new Error(error.message);

    const deletedRaffles = (data ?? []).map((row) => {
      const val = row.value as { raffle: Record<string, unknown>; runtime: unknown; deletedAt: string };
      return {
        raffle: val.raffle,
        runtime: val.runtime,
        deletedAt: val.deletedAt,
        key: row.key,
      };
    });

    return NextResponse.json({ data: deletedRaffles });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected error while loading deleted raffles.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
