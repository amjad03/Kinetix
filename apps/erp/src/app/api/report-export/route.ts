import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { API_URL, SESSION_COOKIE } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FORMATS = new Set(['xlsx', 'csv', 'pdf']);

/**
 * Downloads a report from the report studio (XLSX, CSV or PDF) with the signed-in user's token,
 * which never reaches the browser. The body is the studio's export request; the API checks who may
 * see what and validates every field.
 */
export async function POST(req: NextRequest) {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return new Response('Forbidden', { status: 403 });
  let body: { source?: unknown; runtime?: unknown; format?: unknown; lang?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  if (typeof body.format !== 'string' || !FORMATS.has(body.format) || typeof body.source !== 'object' || body.source === null) return new Response('Bad request', { status: 400 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return new Response('Sign in again', { status: 401 });
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1/analytics/studio/export`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ source: body.source, runtime: body.runtime ?? [], format: body.format, lang: body.lang ?? 'en' }),
      cache: 'no-store',
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    return new Response("Can't reach ZYNETIX Cloud", { status: 502 });
  }
  if (!res.ok) {
    let message = res.status === 403 ? 'Not allowed' : res.status === 404 ? 'Not found' : 'ZYNETIX Cloud error';
    try {
      const j = (await res.json()) as { message?: string | string[] };
      if (j.message) message = Array.isArray(j.message) ? j.message.join(', ') : j.message;
    } catch {
      /* not JSON */
    }
    return new Response(message, { status: res.status >= 400 && res.status < 500 ? res.status : 502 });
  }
  const headers = new Headers({ 'content-type': res.headers.get('content-type') ?? 'application/octet-stream', 'cache-control': 'private, no-store' });
  const cd = res.headers.get('content-disposition');
  if (cd) headers.set('content-disposition', cd);
  return new Response(res.body, { status: 200, headers });
}
