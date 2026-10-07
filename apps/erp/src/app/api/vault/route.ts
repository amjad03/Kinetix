import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { API_URL, SESSION_COOKIE } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const KEEP = ['title', 'category', 'visibility', 'expiresOn', 'replacesId'];

/**
 * Document vault upload: the browser posts the file here (same origin) and it is streamed to the
 * API as the raw request body with the session token, which never reaches the browser. The API
 * checks the type, the size and who may upload.
 */
export async function POST(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const ownerType = q.get('ownerType');
  const ownerId = q.get('ownerId') ?? '';
  const type = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if ((ownerType !== 'student' && ownerType !== 'staff') || !UUID.test(ownerId)) return Response.json({ message: 'Not found' }, { status: 404 });
  if (!TYPES.includes(type)) return Response.json({ message: 'Upload a PDF, JPEG or PNG file' }, { status: 415 });
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return new Response('Forbidden', { status: 403 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return new Response('Sign in', { status: 401 });
  const params = new URLSearchParams();
  for (const k of KEEP) if (q.get(k)) params.set(k, q.get(k)!);
  const upstream = await fetch(`${API_URL}/v1/documents/vault/${ownerType}/${ownerId}?${params}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': type, ...(req.headers.get('content-length') ? { 'content-length': req.headers.get('content-length')! } : {}) },
    body: req.body,
    // @ts-expect-error Node's fetch needs this to stream a request body.
    duplex: 'half',
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);
  if (!upstream) return Response.json({ message: "Can't reach KINETIX Cloud" }, { status: 502 });
  return new Response(await upstream.text(), { status: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' } });
}
