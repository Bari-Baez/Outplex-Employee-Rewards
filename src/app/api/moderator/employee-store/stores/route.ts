import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';

// PATCH /api/moderator/employee-store/stores - suspend or update store status
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = await createServiceClient();
  const { data: mod } = await service.from('users').select('role').eq('id', user.id).single();
  if (!mod || !['moderator_a1', 'admin'].includes(mod.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const maintenance = await enforceSectionAvailability({
    serviceClient: service,
    toolKey: 'employee_stores',
    sectionKey: 'main',
    userRole: mod.role as string,
    bypassForAdmin: true,
  });
  if (maintenance) {
    return maintenance;
  }

  const body = await request.json();
  const { storeId, status, reason } = body as { storeId: string; status: 'active' | 'paused' | 'closed' | 'suspended'; reason?: string };

  if (!storeId || !status) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

  const updatePayload: Record<string, unknown> = { status };
  if (reason) updatePayload.suspend_reason = reason;

  const { error } = await service.from('employee_stores').update(updatePayload).eq('id', storeId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify store owner
  const { data: store } = await service.from('employee_stores').select('owner_id, name').eq('id', storeId).single();
  
  if (store) {
    const notifTitle = 
      status === 'suspended' ? `Tu tienda "${store.name}" fue suspendida` :
      status === 'paused' ? `Tu tienda "${store.name}" fue ocultada` :
      status === 'closed' ? `Tu tienda "${store.name}" fue cerrada` :
      `Tu tienda "${store.name}" fue reactivada`;
    const notifMsg = reason
      ? `Motivo: ${reason}`
      : status === 'active' ? 'Tu tienda ha sido reactivada por un moderador.' : 'Contacta a un moderador para más información.';

    await service.from('notifications').insert({
      user_id: store.owner_id,
      title: notifTitle,
      message: notifMsg,
      type: 'store',
      is_read: false,
    });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/moderator/employee-store/stores?storeId=xxx - permanently delete a store
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = await createServiceClient();
  const { data: mod } = await service.from('users').select('role').eq('id', user.id).single();
  if (!mod || !['moderator_a1', 'admin'].includes(mod.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const maintenance = await enforceSectionAvailability({
    serviceClient: service,
    toolKey: 'employee_stores',
    sectionKey: 'main',
    userRole: mod.role as string,
    bypassForAdmin: true,
  });
  if (maintenance) {
    return maintenance;
  }

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'Missing storeId' }, { status: 400 });

  const { data: store } = await service.from('employee_stores').select('owner_id, name').eq('id', storeId).single();

  const { error } = await service.from('employee_stores').delete().eq('id', storeId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (store) {
    await service.from('notifications').insert({
      user_id: store.owner_id,
      title: `Tu tienda "${store.name}" fue eliminada`,
      message: 'Tu tienda personal ha sido eliminada por un moderador. Puedes solicitar una nueva si lo deseas.',
      type: 'store',
      is_read: false,
    });
  }

  return NextResponse.json({ success: true });
}
