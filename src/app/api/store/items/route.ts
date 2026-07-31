import { NextResponse } from 'next/server';
import { getStoreItemMetaKey } from '@backend/modules/store/domain/catalog';
import { revalidateCompanyStoreViews } from '@backend/modules/store/application/cache';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import type { StoreItemMeta } from '@shared/contracts/database';
import { isModeratorRole } from '@backend/modules/access/domain/roles';
import { enforceSectionAvailability } from '@backend/modules/shell/application/section-guard';

interface CreateItemPayload {
  name?: string;
  description?: string | null;
  points_cost?: number;
  stock?: number;
  image_url?: string | null;
  is_active?: boolean;
  category?: string | null;
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

export async function POST(req: Request) {
  const auth = await getAuthorizedModerator();
  if (auth.error) {
    return auth.error;
  }

  const payload = (await req.json()) as CreateItemPayload;
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';

  if (!name) {
    return NextResponse.json({ error: 'Product name is required.' }, { status: 400 });
  }

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
  const insertPayload = {
    name,
    description: typeof payload.description === 'string' && payload.description.trim() ? payload.description.trim() : null,
    points_cost:
      typeof payload.points_cost === 'number' && Number.isFinite(payload.points_cost) && payload.points_cost >= 0
        ? Math.floor(payload.points_cost)
        : 0,
    stock:
      typeof payload.stock === 'number' && Number.isFinite(payload.stock)
        ? Math.floor(payload.stock)
        : 0,
    image_url: typeof payload.image_url === 'string' && payload.image_url.trim() ? payload.image_url.trim() : null,
    is_active: payload.is_active ?? true,
  };

  const { data: item, error } = await serviceClient
    .from('store_items')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error || !item) {
    return NextResponse.json(
      { error: error?.message ?? 'Unable to create the item.' },
      { status: 500 },
    );
  }

  const category = normalizeCategory(payload.category);
  if (category) {
    const meta: StoreItemMeta = { category };
    await serviceClient.from('app_settings').upsert(
      {
        key: getStoreItemMetaKey(item.id),
        value: meta,
      },
      { onConflict: 'key' },
    );
  }

  revalidateCompanyStoreViews();

  return NextResponse.json({
    item: {
      ...item,
      meta: category ? { category } : null,
    },
  });
}
