import { NextResponse } from 'next/server';

export function GET(req: Request) {
  const currentUrl = new URL(req.url);
  const response = NextResponse.redirect(new URL('/outplex-logo.png', currentUrl), 307);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
