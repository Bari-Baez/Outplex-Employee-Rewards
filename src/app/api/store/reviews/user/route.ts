import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

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

    const body = await req.json().catch(() => null);
    const itemIds = Array.isArray(body?.itemIds)
      ? (body.itemIds as unknown[]).map((v) => String(v)).filter(Boolean)
      : [];

    if (itemIds.length === 0) {
      return NextResponse.json({ ratings: {} });
    }

    const service = await createServiceClient();
    const { data, error } = await service
      .from('store_reviews')
      .select('item_id, rating')
      .eq('user_id', user.id)
      .in('item_id', itemIds);

    if (error) throw error;

    const ratings: Record<string, number> = {};
    for (const row of data ?? []) {
      ratings[row.item_id as string] = row.rating as number;
    }

    return NextResponse.json({ ratings });
  } catch (err) {
    console.error('POST /api/store/reviews/user error:', err);
    return NextResponse.json({ error: toMessage(err) }, { status: 500 });
  }
}

