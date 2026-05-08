import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || !['admin', 'moderator_a1', 'moderator_b1', 'moderator'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = await createServiceClient();
  const maintenance = await enforceSectionAvailability({
    serviceClient: service,
    toolKey: 'employee_stores',
    sectionKey: 'main',
    userRole: profile.role as string,
    bypassForAdmin: true,
  });
  if (maintenance) {
    return maintenance;
  }

  // Fetch all products across all employee stores for moderation
  const { data: products, error } = await service
    .from('employee_store_products')
    .select('*, store:employee_stores(id, name, owner_id)')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ products });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || !['admin', 'moderator_a1'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = await createServiceClient();
  const maintenance = await enforceSectionAvailability({
    serviceClient: service,
    toolKey: 'employee_stores',
    sectionKey: 'main',
    userRole: profile.role as string,
    bypassForAdmin: true,
  });
  if (maintenance) {
    return maintenance;
  }

    const body = await request.json();
  const { productId, status, reviewNotes } = body;

  if (!productId) {
    return NextResponse.json({ error: 'Missing productId' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  let notifyType: 'approved' | 'rejected' | 'suspended' | null = null;

  if (status) {
    updates.status = status;
    updates.is_active = status === 'active';
    if (status === 'active' || status === 'rejected') {
      updates.moderation_note = reviewNotes || null;
      notifyType = status === 'active' ? 'approved' : 'rejected';
    } else if (status === 'suspended') {
      updates.moderation_note = reviewNotes || null;
      notifyType = 'suspended';
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data: product, error } = await service
    .from('employee_store_products')
    .update(updates)
    .eq('id', productId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Create notification for the seller
  if (product) {
    const { data: store } = await service
      .from('employee_stores')
      .select('owner_id')
      .eq('id', product.store_id)
      .single();

    if (store) {
      let notifTitle = '';
      let notifContent = '';
      if (notifyType === 'approved') {
        notifTitle = 'Producto Aprobado';
        notifContent = `Tu producto "${product.name}" ha sido aprobado y ya está disponible en la tienda.`;
      } else if (notifyType === 'rejected') {
        notifTitle = 'Producto Rechazado';
        notifContent = `Tu producto "${product.name}" no fue aprobado${reviewNotes ? ': ' + reviewNotes : '.'}`;
      } else if (notifyType === 'suspended') {
        notifTitle = 'Producto Suspendido';
        notifContent = `Tu producto "${product.name}" ha sido suspendido por moderación${reviewNotes ? '. Motivo: ' + reviewNotes : '.'}`;
      }

      if (notifTitle) {
        await service.from('notifications').insert({
          user_id: store.owner_id,
          title: notifTitle,
          message: notifContent,
          type: 'system', // Set type to system as requested
          is_read: false,
        });
      }
    }
  }

  return NextResponse.json({ product });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || !['admin', 'moderator_a1'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = await createServiceClient();
  const maintenance = await enforceSectionAvailability({
    serviceClient: service,
    toolKey: 'employee_stores',
    sectionKey: 'main',
    userRole: profile.role as string,
    bypassForAdmin: true,
  });
  if (maintenance) {
    return maintenance;
  }

  const url = new URL(request.url);
  const productId = url.searchParams.get('productId');

  if (!productId) {
    return NextResponse.json({ error: 'Missing productId' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';

  const { data: product } = await service
    .from('employee_store_products')
    .select('id, name, store_id')
    .eq('id', productId)
    .single();

  const { error } = await service
    .from('employee_store_products')
    .delete()
    .eq('id', productId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (product) {
    const { data: store } = await service
      .from('employee_stores')
      .select('owner_id')
      .eq('id', product.store_id)
      .single();

    if (store) {
      await service.from('notifications').insert({
        user_id: store.owner_id,
        title: 'Producto Eliminado',
        message: `Tu producto "${product.name}" fue eliminado por moderacion.${reason ? ` Motivo: ${reason}` : ''}`,
        type: 'system',
        is_read: false,
      });
    }
  }

  return NextResponse.json({ success: true });
}

