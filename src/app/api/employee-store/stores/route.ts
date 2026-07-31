import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = await createServiceClient();

  const { data: stores, error } = await service
    .from('employee_stores')
    .select('id, owner_id, slug, name, description, category, banner_image, logo_image, accent_color, status, approved_at')
    .order('approved_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const publicStores = (stores ?? []).filter(
    (store) => store.status === 'active' || store.status === 'approved',
  );

  const storeIds = publicStores.map((s) => s.id);
  const ownerIds = publicStores.map((s) => s.owner_id);

  type ProductRow = { id: string; store_id: string; name: string; description: string | null; price_dop: number; image_url: string | null; category: string | null; stock: number; is_active: boolean };
  type OwnerRow = { id: string; name: string; email: string; avatar_url: string | null; slack_id: string | null };
  const [{ data: products }, { data: owners }] = await Promise.all([
    storeIds.length > 0
      ? service
          .from('employee_store_products')
          .select('id, store_id, name, description, price_dop, image_url, category, stock, is_active')
          .in('store_id', storeIds)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as ProductRow[] }),
    ownerIds.length > 0
      ? service
          .from('users')
          .select('id, name, email, avatar_url, slack_id')
          .in('id', ownerIds)
      : Promise.resolve({ data: [] as OwnerRow[] }),
  ]);

  const ownerMap = new Map((owners ?? []).map((o) => [o.id as string, o]));

  const storesWithData = publicStores.map((store) => ({
    ...store,
    owner: ownerMap.get(store.owner_id) ?? null,
    products: (products ?? []).filter((p) => p.store_id === store.id),
  }));

  return NextResponse.json({ stores: storesWithData });
}
