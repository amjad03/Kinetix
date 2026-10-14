import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { API_URL, SESSION_COOKIE } from '@/lib/config';
import { ENTITY_KEY } from '@/lib/records';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILTER = /^f\.[a-zA-Z][a-zA-Z0-9_]{0,40}$/;

/**
 * Record kit downloads, fetched with the session token (which stays in its httpOnly cookie) and streamed to the
 * browser: `?entity=students&kind=export&format=csv|xlsx` with the list's search, filters, sort, columns or ids,
 * and `?entity=students&kind=template` for the import template. Only those two API paths can be reached.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const entity = sp.get('entity') ?? '';
  const kind = sp.get('kind') ?? '';
  if (!ENTITY_KEY.test(entity)) return new Response('Not found', { status: 404 });
  let path: string;
  if (kind === 'template') path = `/v1/records/${entity}/import/template`;
  else if (kind === 'export') {
    const format = sp.get('format') === 'xlsx' ? 'xlsx' : 'csv';
    const keep = new URLSearchParams({ format });
    const q = sp.get('q');
    if (q) keep.set('q', q.slice(0, 200));
    const sort = sp.get('sort');
    if (sort && /^[a-zA-Z][a-zA-Z0-9_]{0,40}:(asc|desc)$/.test(sort)) keep.set('sort', sort);
    const columns = sp.get('columns');
    if (columns && /^[a-zA-Z0-9_,]{1,2000}$/.test(columns)) keep.set('columns', columns);
    for (const k of ['ids', 'except']) {
      const v = sp.get(k);
      if (!v) continue;
      const list = v.split(',');
      if (list.length > 5000 || !list.every((x) => UUID.test(x))) return new Response('Not found', { status: 404 });
      keep.set(k, v);
    }
    for (const [k, v] of sp.entries()) if (FILTER.test(k) && v.length <= 200) keep.set(k, v);
    path = `/v1/records/${entity}/export?${keep.toString()}`;
  } else return new Response('Not found', { status: 404 });

  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return new Response('Forbidden', { status: 403 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return new Response('Sign in', { status: 401 });
  const upstream = await fetch(`${API_URL}${path}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(60_000) }).catch(() => null);
  if (!upstream) return new Response("Can't reach KINETIX Cloud", { status: 502 });
  if (!upstream.ok) return new Response(await upstream.text(), { status: upstream.status, headers: { 'content-type': 'application/json' } });
  const headers = new Headers();
  for (const h of ['content-type', 'content-disposition', 'x-row-count']) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set('cache-control', 'no-store');
  return new Response(upstream.body, { status: 200, headers });
}
