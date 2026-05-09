import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCachedStoreReviewSummary } from '@/lib/read-models/store';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const summary = await getCachedStoreReviewSummary();
    return NextResponse.json({ summary });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 });
  }
}
