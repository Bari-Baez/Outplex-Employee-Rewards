import { NextRequest, NextResponse } from 'next/server';

const GIPHY_KEY = 'dc6zaTOxFJmzC'; // Public beta key

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') ?? '';

  const url = q.trim()
    ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q.trim())}&limit=16&rating=pg`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=16&rating=pg`;

  try {
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) return NextResponse.json({ results: [] });

    const data = await res.json();
    
    const results = (data.data ?? []).map((item: any) => ({
      id: item.id,
      title: item.title,
      gif: item.images?.original?.url ?? '',
      tinygif: item.images?.fixed_height_small?.url ?? item.images?.original?.url ?? '',
    }));

    return NextResponse.json({ results }, {
      headers: { 'Cache-Control': 'public, max-age=30, s-maxage=30' },
    });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
