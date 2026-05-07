import { NextRequest, NextResponse } from 'next/server';

const TENOR_KEY = 'LIVDSRZULELA'; // public Tenor v1 demo key

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') ?? '';

  const url = q.trim()
    ? `https://api.tenor.com/v1/search?q=${encodeURIComponent(q.trim())}&key=${TENOR_KEY}&limit=16&media_filter=minimal&contentfilter=medium&client_key=outplex`
    : `https://api.tenor.com/v1/trending?key=${TENOR_KEY}&limit=16&media_filter=minimal&contentfilter=medium&client_key=outplex`;

  try {
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) return NextResponse.json({ results: [] });

    // Tenor v1 response shape: { results: [{ id, title, media: [{ gif, tinygif }] }] }
    const data = (await res.json()) as {
      results: Array<{
        id: string;
        title: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        media: Array<Record<string, { url: string; preview?: string }>>;
      }>;
    };

    const results = (data.results ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      gif: item.media?.[0]?.gif?.url ?? '',
      tinygif: item.media?.[0]?.tinygif?.url ?? item.media?.[0]?.gif?.url ?? '',
    }));

    return NextResponse.json({ results }, {
      headers: { 'Cache-Control': 'public, max-age=30, s-maxage=30' },
    });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
