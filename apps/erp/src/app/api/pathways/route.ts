import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { API_URL, SESSION_COOKIE } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where each download of the projects, careers and research desks lives in the API. Nothing else can be fetched through here. */
const TARGETS: Record<string, (id: string, index: string) => string | null> = {
  'career-resume': (id) => `/v1/careers/resumes/${id}/pdf`,
  'project-file': (id) => `/v1/projects/files/${id}/download`,
  'dataset-file': (id, index) => (/^\d{1,2}$/.test(index) ? `/v1/research/datasets/${id}/files/${index}/download` : null),
};

/** Fetches the file with the session token (kept in its httpOnly cookie) and streams it to the browser as a download. */
export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get('kind') ?? '';
  const id = req.nextUrl.searchParams.get('id') ?? '';
  const index = req.nextUrl.searchParams.get('index') ?? '';
  const target = UUID.test(id) ? TARGETS[kind]?.(id, index) : null;
  if (!target) return new Response('Not found', { status: 404 });
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return new Response('Forbidden', { status: 403 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return new Response('Sign in', { status: 401 });
  const upstream = await fetch(`${API_URL}${target}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(30_000) }).catch(() => null);
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
