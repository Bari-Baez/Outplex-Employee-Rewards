import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';
import { isModeratorRole } from '@/lib/auth/roles';
import {
  assertModeratorAccess,
  loadRaffleRuntime,
  persistRaffleRuntime,
} from '@/lib/raffles/server';
import { getRaffleRuntimeKey } from '@/lib/raffles/runtime';

export const RAFFLE_DELETED_KEY_PREFIX = 'raffle_deleted:';

/** Soft-delete a scheduled raffle (recoverable) or hard-delete a live/completed one. */
export async function DELETE(
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

    const { data: raffle, error: raffleError } = await serviceClient
      .from('raffles')
      .select('*')
      .eq('id', raffleId)
      .maybeSingle();

    if (raffleError) throw new Error(raffleError.message);
    if (!raffle) {
      return NextResponse.json({ error: 'Raffle not found.' }, { status: 404 });
    }

    const runtime = await loadRaffleRuntime(serviceClient, raffleId);

    // Restore stock reserved at raffle creation (for non-completed raffles)
    if (raffle.status !== 'completed' && runtime) {
      for (const slot of runtime.prizePlans ?? []) {
        if (slot.type !== 'bundle' && slot.storeItemId) {
          let timesUsed = 0;
          const slotIdx = (runtime.prizePlans ?? []).indexOf(slot);
          for (let j = slotIdx; j < runtime.spinCount; j += (runtime.prizePlans ?? []).length) {
            timesUsed++;
          }
          const perWinnerQty = slot.splitAcrossWinners ? 1 : (slot.quantity ?? 1);
          const totalReserve = perWinnerQty * timesUsed;
          if (totalReserve > 0) {
            const { data: item } = await serviceClient
              .from('store_items')
              .select('id, stock')
              .eq('id', slot.storeItemId)
              .maybeSingle();
            if (item && item.stock !== -1) {
              await serviceClient
                .from('store_items')
                .update({ stock: item.stock + totalReserve })
                .eq('id', item.id);
            }
          }
        }
        if (slot.type === 'bundle' && slot.bundleItems) {
          for (const bi of slot.bundleItems) {
            if (bi.storeItemId) {
              const { data: item } = await serviceClient
                .from('store_items')
                .select('id, stock')
                .eq('id', bi.storeItemId)
                .maybeSingle();
              if (item && item.stock !== -1) {
                await serviceClient
                  .from('store_items')
                  .update({ stock: item.stock + bi.quantity })
                  .eq('id', item.id);
              }
            }
          }
        }
      }
    }

    const canRestore = raffle.status === 'upcoming';

    if (canRestore) {
      // Soft delete: store raffle + runtime in recycle bin, delete from main table
      await serviceClient.from('app_settings').upsert(
        {
          key: `${RAFFLE_DELETED_KEY_PREFIX}${raffleId}`,
          value: { raffle, runtime, deletedAt: new Date().toISOString() },
        },
        { onConflict: 'key' },
      );
    }

    // Delete the raffle from the main table
    await serviceClient.from('raffles').delete().eq('id', raffleId);

    // Delete the runtime setting (for soft-deleted it's preserved under the deleted key)
    await serviceClient
      .from('app_settings')
      .delete()
      .eq('key', getRaffleRuntimeKey(raffleId));

    return NextResponse.json({ data: { deleted: true, canRestore } });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected error while deleting the raffle.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
