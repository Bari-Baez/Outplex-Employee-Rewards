import { NextResponse } from 'next/server';
import { revalidateEmployeeStoreViews } from '@backend/modules/store/application/cache';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) return String((err as { message: unknown }).message);
  return 'Internal server error';
}

async function requireOwnerProduct(productId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const service = await createServiceClient();
  const { data: product } = await service
    .from('employee_store_products')
    .select('id, store_id, is_suspended, status')
    .eq('id', productId)
    .maybeSingle();

  if (!product) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };

  const { data: store } = await service
    .from('employee_stores')
    .select('owner_id')
    .eq('id', product.store_id)
    .maybeSingle();

  if (!store || store.owner_id !== user.id) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { service, product, userId: user.id };
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ productId: string }> },
) {
  const { productId } = await context.params;
  const ctx = await requireOwnerProduct(productId);
  if ('error' in ctx) return ctx.error;
  const { service } = ctx;

  try {
    const body = await req.json();
    const patch: Record<string, unknown> = {};

    if (typeof body.name === 'string' && body.name.trim().length >= 2) patch.name = body.name.trim();
    if (body.description !== undefined) patch.description = body.description ? String(body.description).trim() : null;
    if (body.price_dop !== undefined) {
      const price = Math.max(0, Math.round(Number(body.price_dop)));
      if (!Number.isFinite(price) || price <= 0) {
        return NextResponse.json({ error: 'Price must be a positive number.' }, { status: 400 });
      }
      patch.price_dop = price;
    }
    if (body.cost_dop !== undefined) {
      const cost = Math.max(0, Math.round(Number(body.cost_dop)));
      if (!Number.isFinite(cost) || cost < 0) {
        return NextResponse.json({ error: 'Production cost must be zero or greater.' }, { status: 400 });
      }
      patch.cost_dop = cost;
    }
    if (body.stock !== undefined) patch.stock = Math.max(0, Math.round(Number(body.stock)));
    if (body.image_url !== undefined) patch.image_url = body.image_url ? String(body.image_url) : null;
    if (body.category !== undefined) patch.category = body.category ? String(body.category).trim() : null;
    if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    if (ctx.product.is_suspended || ctx.product.status === 'rejected') {
      patch.status = 'pending';
      patch.is_suspended = false;
      patch.suspend_reason = null;
      patch.is_active = false;
    }

    const { data, error } = await service
      .from('employee_store_products')
      .update(patch)
      .eq('id', productId)
      .select('*')
      .single();
    if (error) throw error;

    if (data.status === 'pending') {
      const { data: moderators } = await service
        .from('users')
        .select('id')
        .in('role', ['moderator', 'moderator_a1', 'admin']);

      if (moderators?.length) {
        await service.from('notifications').insert(
          moderators.map((moderator) => ({
            user_id: moderator.id,
            title: 'Product resubmitted for review',
            message: `"${data.name}" was updated by the seller and is waiting for moderation again.`,
            type: 'store',
            is_read: false,
          })),
        );
      }
    }

    revalidateEmployeeStoreViews();

    return NextResponse.json({ product: data });
  } catch (err) {
    console.error('PATCH /api/employee-store/products/[id] error:', err);
    return NextResponse.json({ error: toMessage(err) }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ productId: string }> },
) {
  const { productId } = await context.params;
  const ctx = await requireOwnerProduct(productId);
  if ('error' in ctx) return ctx.error;
  const { service } = ctx;

  const { error } = await service.from('employee_store_products').delete().eq('id', productId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateEmployeeStoreViews();

  return NextResponse.json({ success: true });
}
