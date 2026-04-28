import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const itemId = req.nextUrl.searchParams.get('itemId');
    if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });

    const supabase = await createServiceClient();
    const { data: reviews, error } = await supabase
      .from('store_reviews')
      .select('*, user:user_id(id, name)')
      .eq('item_id', itemId)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ reviews });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { itemId, rating, comment } = await req.json() as { itemId: string; rating: number; comment?: string };
    if (!itemId || !rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Invalid itemId or rating (1-5)' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();
    const { data: review, error } = await serviceClient
      .from('store_reviews')
      .upsert({ item_id: itemId, user_id: user.id, rating, comment: comment || null }, { onConflict: 'item_id,user_id' })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    revalidatePath('/store');
    revalidatePath('/moderator/store/analytics');
    return NextResponse.json({ review });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 });
  }
}
