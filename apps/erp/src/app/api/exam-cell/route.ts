import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { API_URL, SESSION_COOKIE } from '@/lib/config';
import { CELL_REPORTS } from '@/lib/exam-cell';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The exam cell's files, fetched with the session token (kept in its httpOnly cookie) and streamed to the browser:
 * `?kind=report&report=gazette&sessionId=…` (a register as CSV) and `?kind=internal&sessionId=…` (internal marks in
 * the university's format). Only those API paths can be reached.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const kind = sp.get('kind');
  const sessionId = sp.get('sessionId') ?? '';
  if (sessionId && !UUID.test(sessionId)) return new Response('Not found', { status: 404 });
  let path: string;
  if (kind === 'report') {
    const report = sp.get('report') ?? '';
    if (!(CELL_REPORTS as readonly string[]).includes(report)) return new Response('Not found', { status: 404 });
    path = `/v1/exam-cell/reports/${report}?format=csv${sessionId ? `&sessionId=${sessionId}` : ''}`;
  } else if (kind === 'internal' && sessionId) path = `/v1/exam-sessions/${sessionId}/internal-marks.csv`;
  else return new Response('Not found', { status: 404 });

  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return new Response('Forbidden', { status: 403 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return new Response('Sign in', { status: 401 });
  const upstream = await fetch(`${API_URL}${path}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(60_000) }).catch(() => null);
  if (!upstream) return new Response("Can't reach KINETIX Cloud", { status: 502 });
  if (!upstream.ok) return new Response(await upstream.text(), { status: upstream.status, headers: { 'content-type': 'application/json' } });
  const headers = new Headers();
  for (const h of ['content-type', 'content-disposition']) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set('cache-control', 'no-store');
  return new Response(upstream.body, { status: 200, headers });
}
