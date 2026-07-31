import { NextResponse } from 'next/server';
import { revalidateEmployeeStoreViews } from '@backend/modules/store/application/cache';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import { requireEmployeeRole } from '@backend/modules/access/application/employee-role';

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) return String((err as { message: unknown }).message);
  return 'Internal server error';
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = await createServiceClient();

  if (!await requireEmployeeRole(user.id, service)) {
    return NextResponse.json({ error: 'Solo los empleados pueden acceder a su tienda personal.' }, { status: 403 });
  }

  const { data: store } = await service
    .from('employee_stores')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!store) return NextResponse.json({ store: null, products: [] });

  const { data: products } = await service
    .from('employee_store_products')
    .select('*')
    .eq('store_id', store.id)
    .order('created_at', { ascending: false });

  return NextResponse.json({ store, products: products ?? [] });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = await createServiceClient();

  if (!await requireEmployeeRole(user.id, service)) {
    return NextResponse.json({ error: 'Solo los empleados pueden gestionar una tienda.' }, { status: 403 });
  }

  const { data: store } = await service
    .from('employee_stores')
    .select('id, owner_id')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!store) return NextResponse.json({ error: 'No active store.' }, { status: 403 });

  try {
    const body = await req.json();
    const patch: Record<string, unknown> = {};

    if (typeof body.name === 'string' && body.name.trim().length >= 3) patch.name = body.name.trim();
    if (body.description !== undefined) patch.description = body.description ? String(body.description).trim() : null;
    if (body.category !== undefined) patch.category = body.category ? String(body.category).trim() : null;
    if (body.banner_image !== undefined) patch.banner_image = body.banner_image ? String(body.banner_image) : null;
    if (body.logo_image !== undefined) patch.logo_image = body.logo_image ? String(body.logo_image) : null;
    if (body.accent_color !== undefined) patch.accent_color = body.accent_color ? String(body.accent_color) : null;
    if (typeof body.status === 'string' && ['active', 'paused', 'scheduled'].includes(body.status)) patch.status = body.status;
    if (typeof body.is_open === 'boolean') patch.is_open = body.is_open;
    if (body.operating_hours !== undefined) patch.operating_hours = body.operating_hours;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    const { data, error } = await service
      .from('employee_stores')
      .update(patch)
      .eq('id', store.id)
      .select('*')
      .single();
    if (error) throw error;

    revalidateEmployeeStoreViews();

    return NextResponse.json({ store: data });
  } catch (err) {
    console.error('PATCH /api/employee-store/my-store error:', err);
    return NextResponse.json({ error: toMessage(err) }, { status: 500 });
  }
}
