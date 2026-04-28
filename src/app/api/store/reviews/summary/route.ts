import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    const { data: summaries, error } = await serviceClient
      .from('store_reviews')
      .select('item_id, rating')
      .order('item_id');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const summaryMap: Record<string, { avg: number; count: number }> = {};
    (summaries || []).forEach(({ item_id, rating }) => {
      if (!summaryMap[item_id]) summaryMap[item_id] = { avg: 0, count: 0 };
      summaryMap[item_id].count += 1;
      summaryMap[item_id].avg += rating;
    });

    Object.keys(summaryMap).forEach(itemId => {
      summaryMap[itemId].avg = summaryMap[itemId].avg / summaryMap[itemId].count;
    });

    return NextResponse.json({ summary: summaryMap });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 });
  }
}
