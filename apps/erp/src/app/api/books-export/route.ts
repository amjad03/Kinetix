import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { API_URL, SESSION_COOKIE } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The books for another accounting package, fetched with the session token and streamed as a download:
 * `format=zoho` is Zoho Books' manual journal import (GET /v1/books/zoho.csv, a period, optionally one fee account's
 * books); `format=tally` is the Tally Prime import file of what is not yet in Tally (GET /v1/tally/export.xml).
 */
export async function GET(req: NextRequest) {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return new Response('Forbidden', { status: 403 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return new Response('Sign in', { status: 401 });
  const q = req.nextUrl.searchParams;
  let path: string;
  if (q.get('format') === 'tally') path = '/v1/tally/export.xml';
  else if (q.get('format') === 'zoho') {
    const from = q.get('from') ?? '';
    const to = q.get('to') ?? '';
    const account = q.get('account') ?? '';
    if (!DAY.test(from) || !DAY.test(to) || (account && !UUID.test(account))) return new Response('Give from and to dates', { status: 400 });
    path = `/v1/books/zoho.csv?from=${from}&to=${to}${account ? `&account=${account}` : ''}`;
  } else return new Response('Not found', { status: 404 });
  const upstream = await fetch(`${API_URL}${path}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(120_000) }).catch(() => null);
  if (!upstream) return new Response("Can't reach ZYNETIX Cloud", { status: 502 });
  if (!upstream.ok) return new Response(await upstream.text(), { status: upstream.status, headers: { 'content-type': 'application/json' } });
  const headers = new Headers({ 'cache-control': 'no-store' });
  for (const h of ['content-type', 'content-disposition']) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(upstream.body, { status: 200, headers });
}
