import { NextResponse } from 'next/server';
import { createClient } from '@backend/platform/supabase/server';
import { getCachedStoreReviewSummary } from '@backend/modules/store/application/read-models';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [{ data: favorites, error: favoritesError }, summary] = await Promise.all([
      supabase.from('store_favorites').select('item_id').eq('user_id', user.id),
      getCachedStoreReviewSummary(),
    ]);

    if (favoritesError) {
      throw new Error(favoritesError.message ?? 'Unable to load store favorites.');
    }

    return NextResponse.json({
      favoriteItemIds: (favorites ?? []).map((favorite) => favorite.item_id),
      summary,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load store client data.' },
      { status: 500 },
    );
  }
}
