import { NextResponse } from 'next/server';
import { revalidateEmployeeStoreViews } from '@backend/modules/store/application/cache';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) return String((err as { message: unknown }).message);
  return 'Internal server error';
}

async function requireOwnerStore() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const service = await createServiceClient();
  const { data: store } = await service
    .from('employee_stores')
    .select('id, owner_id, status, first_product_published_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!store) return { error: NextResponse.json({ error: 'You do not have an active store.' }, { status: 403 }) };
  return { service, store, userId: user.id };
}

export async function GET() {
  const ctx = await requireOwnerStore();
  if ('error' in ctx) return ctx.error;
  const { service, store } = ctx;

  const { data: products } = await service
    .from('employee_store_products')
    .select('*')
    .eq('store_id', store.id)
    .order('created_at', { ascending: false });

  return NextResponse.json({ products: products ?? [] });
}

export async function POST(req: Request) {
  const ctx = await requireOwnerStore();
  if ('error' in ctx) return ctx.error;
  const { service, store } = ctx;

  try {
    const body = await req.json();
    const name = String(body?.name ?? '').trim();
    const description = body?.description ? String(body.description).trim() : null;
    const priceDop = Math.max(0, Math.round(Number(body?.price_dop)));
    const costDop = Math.max(0, Math.round(Number(body?.cost_dop ?? 0)));
    const stock = Math.max(0, Math.round(Number(body?.stock ?? 0)));
    const imageUrl = body?.image_url ? String(body.image_url) : null;
    const category = body?.category ? String(body.category).trim() : null;
    const isActive = body?.is_active !== false;

    if (!name || name.length < 2) {
      return NextResponse.json({ error: 'Product name is required.' }, { status: 400 });
    }
    if (!Number.isFinite(priceDop) || priceDop <= 0) {
      return NextResponse.json({ error: 'Price must be a positive number in DOP.' }, { status: 400 });
    }
    if (!Number.isFinite(costDop) || costDop < 0) {
      return NextResponse.json({ error: 'Production cost must be zero or greater.' }, { status: 400 });
    }

    const { data: blockedProducts } = await service
      .from('employee_store_products')
      .select('id')
      .eq('store_id', store.id)
      .or('is_suspended.eq.true,status.eq.pending')
      .limit(1);

    if (blockedProducts && blockedProducts.length > 0) {
      return NextResponse.json(
        { error: 'You cannot add new products while another product is suspended or pending review.' },
        { status: 409 },
      );
    }

    const { data, error } = await service
      .from('employee_store_products')
      .insert({
        store_id: store.id,
        name,
        description,
        price_dop: priceDop,
        cost_dop: costDop,
        stock,
        image_url: imageUrl,
        category,
        is_active: isActive,
        status: 'active',
      })
      .select('*')
      .single();
    if (error) throw error;

    if (!store.first_product_published_at) {
      const { error: firstPublishError } = await service
        .from('employee_stores')
        .update({ first_product_published_at: new Date().toISOString() })
        .eq('id', store.id);
      if (firstPublishError) {
        console.warn('Unable to set first_product_published_at:', firstPublishError);
      }
    }

    revalidateEmployeeStoreViews();

    return NextResponse.json({ product: data });
  } catch (err) {
    console.error('POST /api/employee-store/products error:', err);
    return NextResponse.json({ error: toMessage(err) }, { status: 500 });
  }
}
