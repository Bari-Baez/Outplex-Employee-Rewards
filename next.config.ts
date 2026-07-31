import type { NextConfig } from "next";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://outplexemplyeerewards.vercel.app';

// ── Content-Security-Policy ───────────────────────────────────────────────────
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://images.unsplash.com https://*.supabase.co https://lh3.googleusercontent.com https://picsum.photos",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://slack.com https://*.slack.com ${appUrl}`,
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-src 'self' https://www.africau.edu",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "report-uri /api/observability/csp-report",
].join('; ');

// ── Headers applied to every route ───────────────────────────────────────────
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control',   value: 'on' },
  { key: 'X-Content-Type-Options',   value: 'nosniff' },
  { key: 'X-Frame-Options',          value: 'DENY' },
  { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Strict-Transport-Security',value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Content-Security-Policy',  value: csp },
];

// ── CORS headers for API routes ───────────────────────────────────────────────
const corsHeaders = [
  { key: 'Access-Control-Allow-Credentials', value: 'true' },
  { key: 'Access-Control-Allow-Origin',      value: appUrl },
  { key: 'Access-Control-Allow-Methods',     value: 'GET,POST,PUT,PATCH,DELETE,OPTIONS' },
  { key: 'Access-Control-Allow-Headers',     value: 'Content-Type, Authorization, Idempotency-Key, X-Request-ID' },
  { key: 'Access-Control-Expose-Headers',    value: 'X-Request-ID' },
  { key: 'Vary',                             value: 'Origin' },
];

const nextConfig: NextConfig = {
  // Prevent webpack from bundling these Node.js packages so __dirname
  // and require() resolve correctly at runtime in API routes.
  serverExternalPackages: ['exceljs', 'tesseract.js', 'tesseract.js-core'],

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
    localPatterns: [
      { pathname: '/outplex-logo.png' },
      { pathname: '/outplex-logo.webp' },
      { pathname: '/api/assets/**' },
      { pathname: '/**' },
    ],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        source: '/api/(.*)',
        headers: corsHeaders,
      },
    ];
  },
};

export default nextConfig;
