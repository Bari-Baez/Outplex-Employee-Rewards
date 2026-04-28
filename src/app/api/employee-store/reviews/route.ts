import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient, createServiceClient } from '@/lib/supabase/server';

type ProductStoreOwnerRow = { owner_id?: string | null };

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) return String((err as { message: unknown }).message);
  return 'Internal server error';
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const productId = body?.productId ? String(body.productId) : null;
    const rating = Number(body?.rating);

    if (!productId) {
      return NextResponse.json({ error: 'El ID del producto es requerido' }, { status: 400 });
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'La calificación debe ser entre 1 y 5' }, { status: 400 });
    }

    const service = await createServiceClient();

    // Check if the product belongs to the user (they shouldn't review their own store)
    const { data: product } = await service
      .from('employee_store_products')
      .select('store_id, store:employee_stores(owner_id)')
      .eq('id', productId)
      .maybeSingle();

    if (!product) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }

    const store = product.store as ProductStoreOwnerRow | null;
    if (store && store.owner_id === user.id) {
      return NextResponse.json({ error: 'No puedes calificar tus propios productos' }, { status: 400 });
    }

    // Insert or update rating
    const { data, error } = await service
      .from('employee_store_product_reviews')
      .upsert(
        { product_id: productId, user_id: user.id, rating },
        { onConflict: 'product_id,user_id' }
      )
      .select('*, user:users(id, name, avatar_url)')
      .single();

    if (error) throw error;

    revalidatePath('/store');
    revalidatePath('/orders');

    return NextResponse.json({ review: data });
  } catch (err) {
    console.error('POST /api/employee-store/reviews error:', err);
    return NextResponse.json({ error: toMessage(err) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');
    if (!storeId) {
      return NextResponse.json({ error: 'Store ID required' }, { status: 400 });
    }

    const service = await createServiceClient();
    
    // We get all reviews for all products in this store
    const { data: products } = await service
      .from('employee_store_products')
      .select('id')
      .eq('store_id', storeId);

    if (!products || products.length === 0) {
      return NextResponse.json({ reviews: [] });
    }

    const productIds = products.map((p) => p.id);

    const { data: reviews, error } = await service
      .from('employee_store_product_reviews')
      .select('id, product_id, rating, user_id, user:users(name, avatar_url)')
      .in('product_id', productIds);

    if (error) throw error;

    return NextResponse.json({ reviews: reviews || [] });
  } catch (err) {
    console.error('GET /api/employee-store/reviews error:', err);
    return NextResponse.json({ error: toMessage(err) }, { status: 500 });
  }
}
