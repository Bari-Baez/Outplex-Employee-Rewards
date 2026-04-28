import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) return String((err as { message: unknown }).message);
  return 'Internal server error';
}

interface CartItemPayload {
  productId: string;
  quantity: number;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = await createServiceClient();

  // Auto-delete orders older than 30 days (non-fatal)
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  try { await service.from('employee_store_orders').delete().lt('created_at', cutoff); } catch { /* non-fatal */ }
  const { data: orders, error } = await service
    .from('employee_store_orders')
    .select('*, items:employee_store_order_items(*)')
    .eq('buyer_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch store and seller info separately to avoid FK array issues
  const storeIds = [...new Set((orders ?? []).map((o: Record<string, unknown>) => o.store_id as string))];
  const sellerIds = [...new Set((orders ?? []).map((o: Record<string, unknown>) => o.seller_id as string))];

  type StoreRow = { id: string; slug: string; name: string };
  type SellerRow = { id: string; name: string; email: string; avatar_url: string | null; slack_id: string | null };
  const [{ data: stores }, { data: sellers }] = await Promise.all([
    storeIds.length > 0
      ? service.from('employee_stores').select('id, slug, name').in('id', storeIds)
      : Promise.resolve({ data: [] as StoreRow[] }),
    sellerIds.length > 0
      ? service.from('users').select('id, name, email, avatar_url, slack_id').in('id', sellerIds)
      : Promise.resolve({ data: [] as SellerRow[] }),
  ]);

  const storeMap = new Map((stores ?? []).map((s) => [s.id as string, s as Record<string, unknown>]));
  const sellerMap = new Map((sellers ?? []).map((s) => [s.id as string, s as Record<string, unknown>]));

  const enriched = (orders ?? []).map((o: Record<string, unknown>) => ({
    ...o,
    store: storeMap.get(o.store_id as string) ?? null,
    seller: sellerMap.get(o.seller_id as string) ?? null,
  }));

  return NextResponse.json({ orders: enriched });
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json() as {
      items: CartItemPayload[];
      contactMethod?: string;
      buyerNotes?: string;
      pickupMode?: string;
      pickupAt?: string;
    };

    if (!body.items || body.items.length === 0) {
      return NextResponse.json({ error: 'No items provided.' }, { status: 400 });
    }

    const service = await createServiceClient();

    // Fetch products + their stores
    const productIds = body.items.map((i) => i.productId);
    const { data: products, error: productsErr } = await service
      .from('employee_store_products')
      .select('id, store_id, name, description, price_dop, image_url, stock, is_active')
      .in('id', productIds)
      .eq('is_active', true);

    if (productsErr) throw productsErr;
    if (!products || products.length === 0) {
      return NextResponse.json({ error: 'No valid products found.' }, { status: 400 });
    }

    // Fetch stores for those products
    const storeIds = [...new Set(products.map((p) => p.store_id as string))];
    const { data: stores, error: storesErr } = await service
      .from('employee_stores')
      .select('id, owner_id, slug, name, status')
      .in('id', storeIds);

    if (storesErr) throw storesErr;
    const publicStores = (stores ?? []).filter(
      (store) => store.status === 'active' || store.status === 'approved',
    );
    if (publicStores.length === 0) {
      return NextResponse.json({ error: 'No active stores found for these products.' }, { status: 400 });
    }

    const storeMap = new Map(publicStores.map((s) => [s.id as string, s]));

    // Group products by store, skip products from user's own store
    type StoreGroup = { storeId: string; sellerId: string; items: Array<{ product: typeof products[0]; quantity: number }> };
    const byStore = new Map<string, StoreGroup>();

    for (const product of products) {
      const store = storeMap.get(product.store_id as string);
      if (!store) continue;
      if (store.owner_id === user.id) continue; // can't buy from own store

      const reqItem = body.items.find((i) => i.productId === product.id);
      const quantity = Math.max(1, Math.round(reqItem?.quantity ?? 1));

      // -1 means unlimited stock. 0 means out of stock.
      if ((product.stock as number) !== -1 && (product.stock as number) < quantity) {
        return NextResponse.json(
          { error: `Stock insuficiente para "${product.name}". Disponible: ${product.stock}.` },
          { status: 409 },
        );
      }

      if (!byStore.has(store.id as string)) {
        byStore.set(store.id as string, { storeId: store.id as string, sellerId: store.owner_id as string, items: [] });
      }
      byStore.get(store.id as string)!.items.push({ product, quantity });
    }

    if (byStore.size === 0) {
      return NextResponse.json({ error: 'No se pueden comprar productos de tu propia tienda.' }, { status: 400 });
    }

    const createdOrders: Record<string, unknown>[] = [];
    const firstOrderError: string[] = [];

    for (const [, group] of byStore) {
      const totalDop = group.items.reduce((sum, { product, quantity }) => sum + (product.price_dop as number) * quantity, 0);
      const stockRollback: Array<{ productId: string; previousStock: number }> = [];
      let createdOrderId: string | null = null;

      try {
        // Decrement stock first so successful orders always reflect current inventory.
        for (const { product, quantity } of group.items) {
          const currentStock = product.stock as number;
          if (currentStock === -1) continue;

          const nextStock = Math.max(0, currentStock - quantity);
          const { data: stockUpdated, error: stockError } = await service
            .from('employee_store_products')
            .update({ stock: nextStock })
            .eq('id', product.id)
            .eq('stock', currentStock)
            .select('id')
            .maybeSingle();

          if (stockError || !stockUpdated) {
            throw stockError ?? new Error(`Unable to update stock for "${product.name}".`);
          }

          stockRollback.push({ productId: product.id as string, previousStock: currentStock });
        }

        const { data: order, error: orderErr } = await service
          .from('employee_store_orders')
          .insert({
            store_id: group.storeId,
            seller_id: group.sellerId,
            buyer_id: user.id,
            total_dop: totalDop,
            status: 'pending',
            contact_method: (body.contactMethod ?? 'none') as string,
            pickup_mode: body.pickupMode ?? null,
            pickup_at: body.pickupAt ?? null,
            buyer_notes: body.buyerNotes ?? null,
            status_history: [{ status: 'pending', at: new Date().toISOString() }],
          })
          .select('id, store_id, seller_id, buyer_id, total_dop, status, contact_method, created_at')
          .single();

        if (orderErr || !order) {
          throw orderErr ?? new Error('Unable to create order.');
        }
        createdOrderId = order.id as string;

        // Insert order items
        const orderItems = group.items.map(({ product, quantity }) => ({
          order_id: order.id,
          product_id: product.id,
          name_snapshot: product.name,
          image_snapshot: product.image_url,
          unit_price_dop: product.price_dop,
          quantity,
        }));
        const { error: itemsErr } = await service.from('employee_store_order_items').insert(orderItems);
        if (itemsErr) {
          throw itemsErr;
        }

        // Notify seller (non-fatal)
        const storeName = storeMap.get(group.storeId)?.name ?? 'tu tienda';
        await service.from('notifications').insert({
          user_id: group.sellerId,
          sender_id: user.id,
          title: '¡Nueva orden recibida!',
          message: `Tienes una nueva orden en ${storeName} por RD$ ${totalDop.toLocaleString('es-DO')}.`,
          type: 'store',
          is_read: false,
        }).then(({ error: e }) => { if (e) console.error('notification insert error:', e.message); });

        createdOrders.push(order as Record<string, unknown>);
      } catch (groupError) {
        if (createdOrderId) {
          await service.from('employee_store_orders').delete().eq('id', createdOrderId);
        }
        for (const rollbackEntry of stockRollback) {
          await service
            .from('employee_store_products')
            .update({ stock: rollbackEntry.previousStock })
            .eq('id', rollbackEntry.productId);
        }
        firstOrderError.push(toMessage(groupError));
      }
    }

    if (createdOrders.length === 0) {
      const msg = firstOrderError[0] ?? 'No se pudo crear ninguna orden.';
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    // Return seller info for contact popup
    const sellerIds = [...new Set(createdOrders.map((o) => o.seller_id as string))];
    const [{ data: sellerUsers }, { data: sellerPrefs }] = await Promise.all([
      service.from('users').select('id, name, email, avatar_url, slack_id').in('id', sellerIds),
      service.from('user_contact_preferences').select('user_id, whatsapp_number, whatsapp_opt_in').in('user_id', sellerIds),
    ]);

    const sellerMap2 = new Map((sellerUsers ?? []).map((u: Record<string, unknown>) => [u.id as string, u]));
    const prefMap = new Map((sellerPrefs ?? []).map((p: Record<string, unknown>) => [p.user_id as string, p]));

    const ordersWithSellers = createdOrders.map((o) => ({
      ...o,
      store: storeMap.get(o.store_id as string) ?? null,
      seller: {
        ...(sellerMap2.get(o.seller_id as string) ?? {}),
        contactPrefs: prefMap.get(o.seller_id as string) ?? null,
      },
    }));

    return NextResponse.json({ orders: ordersWithSellers });
  } catch (err) {
    console.error('POST /api/employee-store/orders error:', err);
    return NextResponse.json({ error: toMessage(err) }, { status: 500 });
  }
}
