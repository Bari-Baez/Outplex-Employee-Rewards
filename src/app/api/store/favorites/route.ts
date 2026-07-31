import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@backend/platform/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: favorites, error } = await supabase
      .from('store_favorites')
      .select('item_id')
      .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const favoriteItemIds = (favorites || []).map(f => f.item_id);
    return NextResponse.json({ favoriteItemIds });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 });
  }
}
