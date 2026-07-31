import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const orderId = body?.orderId ? String(body.orderId) : null;

    if (!orderId) {
      return NextResponse.json({ error: 'El ID de la orden es requerido' }, { status: 400 });
    }

    const service = await createServiceClient();

    // Verify it's the buyer's order and it's not already completed/cancelled
    const { data: order, error: orderError } = await service
      .from('employee_store_orders')
      .select('id, buyer_id, status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
    }

    if (order.buyer_id !== user.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    if (['completed', 'cancelled', 'rejected'].includes(order.status)) {
      return NextResponse.json({ error: `La orden no puede cancelarse en estado: ${order.status}` }, { status: 400 });
    }

    const { error: updateError } = await service
      .from('employee_store_orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/employee-store/orders/cancel error:', err);
    return NextResponse.json({ error: 'Error interno de servidor' }, { status: 500 });
  }
}
