import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import { enforceSectionAvailability } from '@backend/modules/shell/application/section-guard';
import { isModeratorRole } from '@backend/modules/access/domain/roles';
import { assertModeratorAccess, persistRaffleRuntime } from '@backend/modules/raffles/application/raffle-service';
import { parseRaffleRuntimeSetting } from '@backend/modules/raffles/domain/runtime';

const RAFFLE_DELETED_KEY_PREFIX = 'raffle_deleted:';

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ raffleId: string }> },
) {
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

    const { raffleId } = await context.params;
    const deletedKey = `${RAFFLE_DELETED_KEY_PREFIX}${raffleId}`;

    const { data: setting, error: loadError } = await serviceClient
      .from('app_settings')
      .select('key, value')
      .eq('key', deletedKey)
      .maybeSingle();

    if (loadError) throw new Error(loadError.message);
    if (!setting) {
      return NextResponse.json({ error: 'Raffle not found in recycle bin.' }, { status: 404 });
    }

    const val = setting.value as {
      raffle: { id: string; title: string; description: string | null; draw_date: string | null; status: string; created_by: string };
      runtime: unknown;
      deletedAt: string;
    };

    // Re-insert the raffle record
    const { error: insertError } = await serviceClient.from('raffles').insert({
      id: val.raffle.id,
      title: val.raffle.title,
      description: val.raffle.description,
      draw_date: val.raffle.draw_date,
      status: val.raffle.status,
      created_by: val.raffle.created_by,
    });

    if (insertError) throw new Error(insertError.message);

    // Restore the runtime
    const runtime = parseRaffleRuntimeSetting({ key: `raffle_runtime:${raffleId}`, value: val.runtime as import('@shared/contracts/database').AppSettingValue });
    if (runtime) {
      await persistRaffleRuntime(serviceClient, runtime);
    }

    // Remove from recycle bin
    await serviceClient.from('app_settings').delete().eq('key', deletedKey);

    return NextResponse.json({ data: { restored: true } });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected error while restoring the raffle.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
