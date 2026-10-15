import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { API_URL, SESSION_COOKIE } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRESET = /^preset:[a-z_]{3,40}:(classic|modern|minimal|heritage)$/;
const BRAND = /^(logo|logo_dark|emblem|seal|favicon|signature:(principal|registrar|controller|finance|hr))$/;

/**
 * Images and PDFs of the document engine for the signed-in user, fetched with the session token
 * (which stays in its cookie): template previews (`kind=preview&id=&format=png|svg|pdf&side=&width=&animate=1`),
 * branding images, signatures included (`kind=brand&asset=logo`), copies of issued documents
 * (`kind=issued&id=`) and the document fonts the template editor sets text in (`kind=font&file=`).
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const kind = q.get('kind') ?? '';
  let target = '';
  if (kind === 'preview') {
    const id = q.get('id') ?? '';
    const format = q.get('format') ?? 'png';
    if (!(UUID.test(id) || PRESET.test(id)) || !['png', 'svg', 'pdf'].includes(format)) return new Response('Not found', { status: 404 });
    const params = new URLSearchParams();
    const side = q.get('side');
    if (side && /^[a-z]{1,20}$/.test(side)) params.set('side', side);
    const width = Number(q.get('width'));
    if (width >= 80 && width <= 2400) params.set('width', String(Math.round(width)));
    if (q.get('animate') === '1') params.set('animate', '1');
    target = `/v1/documents/designs/${encodeURIComponent(id)}/preview.${format}${params.size ? `?${params.toString()}` : ''}`;
  } else if (kind === 'brand') {
    const asset = q.get('asset') ?? '';
    if (!BRAND.test(asset)) return new Response('Not found', { status: 404 });
    target = `/v1/admin/branding/assets/${encodeURIComponent(asset)}`;
  } else if (kind === 'font') {
    const file = q.get('file') ?? '';
    if (!/^[A-Za-z-]{3,60}\.ttf$/.test(file)) return new Response('Not found', { status: 404 });
    target = `/v1/documents/designs/fonts/${file}`;
  } else if (kind === 'issued') {
    const id = q.get('id') ?? '';
    if (!UUID.test(id)) return new Response('Not found', { status: 404 });
    target = `/v1/documents/issued/${id}/pdf`;
  } else return new Response('Not found', { status: 404 });
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return new Response('Forbidden', { status: 403 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return new Response('Sign in', { status: 401 });
  const upstream = await fetch(`${API_URL}${target}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(60_000) }).catch(() => null);
  if (!upstream) return new Response("Can't reach ZYNETIX Cloud", { status: 502 });
  if (!upstream.ok) return new Response(await upstream.text(), { status: upstream.status, headers: { 'content-type': 'application/json' } });
  const headers = new Headers();
  for (const h of ['content-type', 'content-disposition', 'content-security-policy']) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set('x-content-type-options', 'nosniff');
  // Previews change only when the template or branding does; the page adds a version to the URL.
  headers.set('cache-control', kind === 'issued' ? 'no-store' : kind === 'font' ? 'private, max-age=604800, immutable' : 'private, max-age=300');
  return new Response(upstream.body, { status: 200, headers });
}

/**
 * The template editor's previews of unsaved work: `{ layout, format: png|svg|pdf, side?, width?,
 * subject? }` to POST /v1/documents/designs/preview, answered with the image or PDF (or the API's
 * error, layout issues included).
 */
export async function POST(req: NextRequest) {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return new Response('Forbidden', { status: 403 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return new Response('Sign in', { status: 401 });
  const body = await req.text();
  if (body.length > 2_000_000) return new Response('Too large', { status: 413 });
  const upstream = await fetch(`${API_URL}/v1/documents/designs/preview`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body, cache: 'no-store', signal: AbortSignal.timeout(60_000) }).catch(() => null);
  if (!upstream) return new Response("Can't reach ZYNETIX Cloud", { status: 502 });
  if (!upstream.ok) return new Response(await upstream.text(), { status: upstream.status, headers: { 'content-type': 'application/json' } });
  const headers = new Headers({ 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' });
  for (const h of ['content-type', 'content-security-policy']) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(upstream.body, { status: 200, headers });
}
