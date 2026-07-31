import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@backend/platform/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ results: [] }, { status: 401 });

  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) return NextResponse.json({ results: [] }, { status: 503 });

  const q = request.nextUrl.searchParams.get('q') ?? '';

  const url = q.trim()
    ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(q.trim())}&limit=16&rating=pg`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=16&rating=pg`;

  try {
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) return NextResponse.json({ results: [] });

    const data = await res.json();

    const results = (data.data ?? []).map((item: Record<string, unknown>) => {
      const images = item.images as Record<string, { url?: string }> | undefined;
      return {
        id: item.id,
        title: item.title,
        gif: images?.original?.url ?? '',
        tinygif: images?.fixed_height_small?.url ?? images?.original?.url ?? '',
      };
    });

    return NextResponse.json({ results }, {
      headers: { 'Cache-Control': 'public, max-age=30, s-maxage=30' },
    });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
