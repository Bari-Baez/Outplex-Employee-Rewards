import { NextResponse } from 'next/server';
import { revalidateCompanyStoreViews } from '@/lib/store-cache';
import { getStoreItemMetaKey, parseStoreItemMeta } from '@/lib/store-helpers';
import { notifyModeratorsOfLowStock, shouldNotifyLowStock } from '@/lib/store-notifications';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { StoreItemMeta } from '@/types/database';
import { isModeratorRole } from '@/lib/auth/roles';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';

interface UpdateItemPayload {
  name?: string;
  description?: string | null;
  points_cost?: number;
  stock?: number;
  image_url?: string | null;
  is_active?: boolean;
  category?: string | null;
  isDeleted?: boolean;
  deletedAt?: string | null;
}

async function getAuthorizedModerator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || !isModeratorRole(profile.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user, role: profile.role as string };
}

function normalizeCategory(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function PATCH(req: Request, context: { params: Promise<{ itemId: string }> }) {
  const auth = await getAuthorizedModerator();
  if (auth.error) {
    return auth.error;
  }

  const { itemId } = await context.params;
  const payload = (await req.json()) as UpdateItemPayload;
  const updates: Record<string, string | number | boolean | null> = {};
  const serviceClient = await createServiceClient();

  const maintenance = await enforceSectionAvailability({
    serviceClient: serviceClient,
    toolKey: 'store_operations',
    sectionKey: 'inventory',
    userRole: auth.role,
    bypassForAdmin: true,
  });
  if (maintenance) {
    return maintenance;
  }
  const { data: currentItem, error: currentItemError } = await serviceClient
    .from('store_items')
    .select('id, name, stock, is_active')
    .eq('id', itemId)
    .single();

  if (currentItemError || !currentItem) {
    return NextResponse.json({ error: currentItemError?.message ?? 'Item not found.' }, { status: 404 });
  }

  if (typeof payload.name === 'string') {
    const trimmed = payload.name.trim();
    if (!trimmed) {
      return NextResponse.json({ error: 'Product name is required.' }, { status: 400 });
    }
    updates.name = trimmed;
  }

  if (payload.description !== undefined) {
    updates.description =
      typeof payload.description === 'string' && payload.description.trim()
        ? payload.description.trim()
        : null;
  }

  if (payload.points_cost !== undefined) {
    updates.points_cost =
      typeof payload.points_cost === 'number' && Number.isFinite(payload.points_cost) && payload.points_cost >= 0
        ? Math.floor(payload.points_cost)
        : 0;
  }

  if (payload.stock !== undefined) {
    updates.stock =
      typeof payload.stock === 'number' && Number.isFinite(payload.stock)
        ? Math.floor(payload.stock)
        : 0;
  }

  if (payload.image_url !== undefined) {
    updates.image_url =
      typeof payload.image_url === 'string' && payload.image_url.trim() ? payload.image_url.trim() : null;
  }

  if (payload.is_active !== undefined) {
    updates.is_active = payload.is_active;
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await serviceClient.from('store_items').update(updates).eq('id', itemId);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  const category = normalizeCategory(payload.category);
  const metaKey = getStoreItemMetaKey(itemId);
  if (payload.category !== undefined || payload.isDeleted !== undefined || payload.deletedAt !== undefined) {
    const { data: existingMetaSetting } = await serviceClient.from('app_settings').select('value').eq('key', metaKey).maybeSingle();
    const existingMeta = parseStoreItemMeta(existingMetaSetting?.value) ?? {};
    const nextMeta: StoreItemMeta = {
      ...existingMeta,
      category: payload.category !== undefined ? category : existingMeta.category ?? null,
      isDeleted: payload.isDeleted !== undefined ? payload.isDeleted : existingMeta.isDeleted,
      deletedAt: payload.deletedAt !== undefined ? payload.deletedAt : existingMeta.deletedAt ?? null,
    };

    const hasMeta = Boolean(nextMeta.category) || nextMeta.isDeleted === true || Boolean(nextMeta.deletedAt);

    if (hasMeta) {
      const { error: metaError } = await serviceClient.from('app_settings').upsert(
        {
          key: metaKey,
          value: nextMeta,
        },
        { onConflict: 'key' },
      );

      if (metaError) {
        return NextResponse.json({ error: metaError.message }, { status: 500 });
      }
    } else {
      await serviceClient.from('app_settings').delete().eq('key', metaKey);
    }
  }

  const [{ data: item, error: itemError }, { data: metaSetting, error: metaError }] = await Promise.all([
    serviceClient.from('store_items').select('*').eq('id', itemId).single(),
    serviceClient.from('app_settings').select('value').eq('key', metaKey).maybeSingle(),
  ]);

  if (itemError || !item) {
    return NextResponse.json({ error: itemError?.message ?? 'Item not found.' }, { status: 404 });
  }

  if (metaError) {
    return NextResponse.json({ error: metaError.message }, { status: 500 });
  }

  if (
    payload.stock !== undefined &&
    shouldNotifyLowStock(currentItem.stock, item.stock, item.is_active)
  ) {
    await notifyModeratorsOfLowStock(serviceClient, {
      id: item.id,
      name: item.name,
      stock: item.stock,
      is_active: item.is_active,
    });
  }

  revalidateCompanyStoreViews();

  return NextResponse.json({
    item: {
      ...item,
      meta: parseStoreItemMeta(metaSetting?.value),
    },
  });
}

export async function DELETE(_: Request, context: { params: Promise<{ itemId: string }> }) {
  const auth = await getAuthorizedModerator();
  if (auth.error) {
    return auth.error;
  }

  const { itemId } = await context.params;
  const serviceClient = await createServiceClient();
  const maintenance = await enforceSectionAvailability({
    serviceClient: serviceClient,
    toolKey: 'store_operations',
    sectionKey: 'inventory',
    userRole: auth.role,
    bypassForAdmin: true,
  });
  if (maintenance) {
    return maintenance;
  }
  const metaKey = getStoreItemMetaKey(itemId);

  const { error: updateError } = await serviceClient
    .from('store_items')
    .update({ is_active: false, stock: 0 })
    .eq('id', itemId);

  if (updateError) {
    return NextResponse.json(
      {
        error: updateError.message ?? 'Unable to move this item to the recycle bin.',
      },
      { status: 409 },
    );
  }

  const { data: existingMeta } = await serviceClient.from('app_settings').select('value').eq('key', metaKey).maybeSingle();
  const meta = parseStoreItemMeta(existingMeta?.value) || {};

  await serviceClient.from('app_settings').upsert(
    {
      key: metaKey,
      value: {
        ...meta,
        isDeleted: true,
        deletedAt: new Date().toISOString(),
      },
    },
    { onConflict: 'key' },
  );

  revalidateCompanyStoreViews();

  return NextResponse.json({ success: true, softDeleted: true });
}
