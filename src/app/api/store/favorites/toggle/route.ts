import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { itemId } = await req.json() as { itemId: string };
    if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });

    // Check if exists
    const { data: exists } = await supabase
      .from('store_favorites')
      .select('id')
      .eq('item_id', itemId)
      .eq('user_id', user.id)
      .single();

    let isFavorite = false;
    if (exists) {
      // Delete
      await supabase.from('store_favorites').delete().eq('id', exists.id);
      isFavorite = false;
    } else {
      // Insert
      await supabase.from('store_favorites').insert({ item_id: itemId, user_id: user.id });
      isFavorite = true;
    }

    return NextResponse.json({ isFavorite });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 });
  }
}
