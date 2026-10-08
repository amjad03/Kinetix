import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { API_URL, SESSION_COOKIE } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The top-bar search: forwards `q` to GET /v1/search with the signed-in user's token (it never reaches the browser). */
export async function GET(req: NextRequest) {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return new Response('Forbidden', { status: 403 });
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 80);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return new Response('Sign in again', { status: 401 });
  if (q.length < 2) return Response.json({ q, hits: [] });
  try {
    const res = await fetch(`${API_URL}/v1/search?q=${encodeURIComponent(q)}&limit=5`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return Response.json({ q, hits: [] }, { status: res.status === 401 ? 401 : 200 });
    return Response.json(await res.json());
  } catch {
    return Response.json({ q, hits: [] });
  }
}
