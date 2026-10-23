import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { API_URL, SESSION_COOKIE } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Zynetix → Updates: a release file (an APK or a desktop zip/installer, up to hundreds of MB)
 * streamed from the browser to the API with the session token, which stays in its httpOnly cookie.
 * Server actions cap bodies at a few MB, hence this route.
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return new Response('Forbidden', { status: 403 });
  const { id } = await ctx.params;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!UUID.test(id) || !token || !req.body) return new Response('Bad request', { status: 400 });
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    'content-type': req.headers.get('content-type') ?? 'application/octet-stream',
    'x-file-name': req.headers.get('x-file-name') ?? 'release',
  };
  const length = req.headers.get('content-length');
  if (length) headers['content-length'] = length;
  try {
    const res = await fetch(`${API_URL}/v1/panel/releases/${id}/file`, { method: 'PUT', headers, body: req.body, duplex: 'half' } as RequestInit & { duplex: 'half' });
    return new Response(await res.text(), { status: res.status, headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' } });
  } catch {
    return Response.json({ message: "Can't reach Zynetix Cloud. Check your connection and try again." }, { status: 502 });
  }
}
