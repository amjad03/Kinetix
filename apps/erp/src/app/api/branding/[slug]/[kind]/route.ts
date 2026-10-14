import type { NextRequest } from 'next/server';
import { API_URL } from '@/lib/config';

export const runtime = 'nodejs';

const KINDS = new Set(['logo', 'logo_dark', 'emblem', 'seal', 'favicon']);

/** An institution's public branding image (logo, crest, seal, favicon) for the login page, verification pages and emails. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await params;
  if (!/^[a-z0-9-]{1,60}$/.test(slug) || !KINDS.has(kind)) return new Response('Not found', { status: 404 });
  const v = req.nextUrl.searchParams.get('v');
  const upstream = await fetch(`${API_URL}/v1/public/branding/${slug}/${kind}${v && /^[0-9a-f]{6,40}$/.test(v) ? `?v=${v}` : ''}`, { signal: AbortSignal.timeout(15_000), next: { revalidate: 3600 } }).catch(() => null);
  if (!upstream?.ok) return new Response('Not found', { status: 404 });
  return new Response(upstream.body, { status: 200, headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' } });
}
