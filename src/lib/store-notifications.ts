import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoreItem } from '@/types/database';
import { LOW_STOCK_THRESHOLD } from '@/lib/store-helpers';
import { MODERATOR_ROLES } from '@/lib/auth/roles';

type LowStockCandidate = Pick<StoreItem, 'id' | 'name' | 'stock' | 'is_active'>;

export function shouldNotifyLowStock(previousStock: number, nextStock: number, isActive = true) {
  if (!isActive) {
    return false;
  }

  if (previousStock === -1 || nextStock === -1) {
    return false;
  }

  return previousStock > LOW_STOCK_THRESHOLD && nextStock >= 0 && nextStock <= LOW_STOCK_THRESHOLD;
}

export async function notifyModeratorsOfLowStock(
  serviceClient: SupabaseClient,
  item: LowStockCandidate,
) {
  if (!item.is_active || item.stock === -1 || item.stock > LOW_STOCK_THRESHOLD) {
    return;
  }

  const { data: moderators, error: moderatorError } = await serviceClient
    .from('users')
    .select('id')
    .in('role', [...MODERATOR_ROLES]);

  if (moderatorError || !moderators || moderators.length === 0) {
    return;
  }

  const stockLabel =
    item.stock <= 0
      ? 'out of stock'
      : `${item.stock} unit${item.stock === 1 ? '' : 's'} left`;

  await serviceClient.from('notifications').insert(
    moderators.map((moderator) => ({
      user_id: moderator.id,
      title: 'Low stock item alert',
      message: `${item.name} is running low with ${stockLabel}. Review Store Operations inventory.`,
      type: 'store',
    })),
  );
}
