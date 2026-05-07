import { NextRequest, NextResponse } from 'next/server';
import { lookup } from 'node:dns/promises';
import net from 'node:net';

const MAX_BYTES = 25 * 1024 * 1024; // 25MB safety cap

function isPrivateIp(ip: string) {
  if (net.isIP(ip) === 0) return true;
  if (ip === '::1' || ip === '127.0.0.1') return true;

  // IPv4 private ranges
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  const match172 = ip.match(/^172\.(\d{1,3})\./);
  if (match172) {
    const second = Number(match172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  if (/^169\.254\./.test(ip)) return true;

  // IPv6 local / unique local
  if (/^fc/i.test(ip) || /^fd/i.test(ip)) return true; // fc00::/7
  if (/^fe80:/i.test(ip)) return true; // link-local

  return false;
}

async function assertSafeTarget(target: URL) {
  const hostname = target.hostname;
  if (!hostname) throw new Error('Invalid URL');

  // Block obvious localhost targets.
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('Blocked host');
  }

  // Resolve DNS and block private IPs (basic SSRF protection).
  try {
    const resolved = await lookup(hostname, { all: true, verbatim: true });
    if (resolved.some((entry) => isPrivateIp(entry.address))) {
      throw new Error('Blocked host');
    }
  } catch (error) {
    // If DNS lookup fails, still block.
    throw new Error(error instanceof Error ? error.message : 'Blocked host');
  }
}

export async function GET(request: NextRequest) {
  const urlParam = request.nextUrl.searchParams.get('url');
  if (!urlParam) {
    return NextResponse.json({ error: 'Missing url param.' }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(urlParam);
  } catch {
    return NextResponse.json({ error: 'Invalid url.' }, { status: 400 });
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return NextResponse.json({ error: 'Unsupported protocol.' }, { status: 400 });
  }

  try {
    await assertSafeTarget(target);
  } catch {
    return NextResponse.json({ error: 'Blocked url.' }, { status: 400 });
  }

  const range = request.headers.get('range') ?? undefined;
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 20000);

  try {
    const upstream = await fetch(target.toString(), {
      headers: range ? { range } : undefined,
      redirect: 'follow',
      signal: abortController.signal,
    });

    const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
    const contentLengthHeader = upstream.headers.get('content-length');
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
    if (contentLength !== null && Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large.' }, { status: 413 });
    }

    const body = upstream.body;
    if (!body) {
      return NextResponse.json({ error: 'Upstream has no body.' }, { status: 502 });
    }

    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
    responseHeaders.set('X-Content-Type-Options', 'nosniff');

    const acceptRanges = upstream.headers.get('accept-ranges');
    if (acceptRanges) responseHeaders.set('Accept-Ranges', acceptRanges);
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) responseHeaders.set('Content-Range', contentRange);
    if (contentLengthHeader) responseHeaders.set('Content-Length', contentLengthHeader);

    return new NextResponse(body as unknown as ReadableStream, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Proxy failed';
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

