import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { API_URL, SESSION_COOKIE } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The university approval list as CSV, fetched with the session token (kept in its httpOnly cookie). */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const keep = new URLSearchParams({ format: 'csv' });
  for (const k of ['cycleId', 'yearId', 'programId']) {
    const v = sp.get(k);
    if (v && UUID.test(v)) keep.set(k, v);
  }
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return new Response('Forbidden', { status: 403 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return new Response('Sign in', { status: 401 });
  const upstream = await fetch(`${API_URL}/v1/admissions/returns/approval-list?${keep.toString()}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(60_000) }).catch(() => null);
  if (!upstream) return new Response("Can't reach ZYNETIX Cloud", { status: 502 });
  if (!upstream.ok) return new Response(await upstream.text(), { status: upstream.status, headers: { 'content-type': 'application/json' } });
  return new Response(upstream.body, { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="admission-approval-list.csv"', 'cache-control': 'no-store' } });
}
