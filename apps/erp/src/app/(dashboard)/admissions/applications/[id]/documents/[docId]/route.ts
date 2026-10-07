import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { API_URL, SESSION_COOKIE } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An applicant's uploaded document, for the reviewer. The API checks the signed-in user's role
 * (and records who viewed it); the session token never reaches the browser.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  if (!UUID.test(id) || !UUID.test(docId)) return new Response('Not found', { status: 404 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return new Response('Sign in again', { status: 401 });
  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/v1/admissions/applications/${id}/documents/${docId}/file`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(30_000) });
  } catch {
    return new Response("Can't reach KINETIX Cloud", { status: 502 });
  }
  if (!upstream.ok) return new Response(upstream.status === 404 ? 'Not found' : upstream.status === 403 ? 'Not allowed' : 'KINETIX Cloud error', { status: [401, 403, 404].includes(upstream.status) ? upstream.status : 502 });
  const headers = new Headers();
  for (const h of ['content-type', 'content-length', 'content-disposition']) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set('cache-control', 'private, no-store');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('content-security-policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");
  return new Response(upstream.body, { status: 200, headers });
}
