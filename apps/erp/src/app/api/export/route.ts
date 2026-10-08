import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { API_URL, SESSION_COOKIE } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** The downloads the ERP offers; the API decides who may have them. */
const ALLOWED = [
  new RegExp(`^/v1/exam-sessions/${UUID}/results\\.csv$`, 'i'),
  new RegExp(`^/v1/exam-sessions/${UUID}/hall-tickets/${UUID}/pdf$`, 'i'),
  new RegExp(`^/v1/results/students/${UUID}/(marks-card|transcript)\\.pdf(\\?sessionId=${UUID})?$`, 'i'),
  // Reports and analytics: a report as CSV or PDF, and an accreditation pack as a ZIP.
  /^\/v1\/analytics\/reports\/[a-z_.]{3,60}\/export\?format=(csv|pdf)(&(campusId|programId|sectionId|from|to|by)=[0-9A-Za-z-]{1,40})*$/,
  /^\/v1\/analytics\/accreditation\/(naac|nirf|aishe)\?format=zip$/,
  new RegExp(`^/v1/obe/programs/${UUID}/report\\.(csv|pdf)\\?academicYearId=${UUID}(&framework=(nba|naac))?$`, 'i'),
];

/** Streams a CSV or PDF from KINETIX Cloud with the signed-in user's token (it never reaches the browser). */
export async function GET(req: NextRequest) {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return new Response('Forbidden', { status: 403 });
  const path = req.nextUrl.searchParams.get('path') ?? '';
  if (!ALLOWED.some((r) => r.test(path))) return new Response('Unknown download', { status: 404 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return new Response('Sign in again', { status: 401 });
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(30_000) });
  } catch {
    return new Response("Can't reach KINETIX Cloud", { status: 502 });
  }
  if (!res.ok) return new Response(res.status === 403 ? 'Not allowed' : res.status === 404 ? 'Not found' : res.status === 401 ? 'Sign in again' : 'KINETIX Cloud error', { status: res.status === 401 || res.status === 403 || res.status === 404 ? res.status : 502 });
  const headers = new Headers({ 'content-type': res.headers.get('content-type') ?? 'application/octet-stream', 'cache-control': 'private, no-store' });
  const cd = res.headers.get('content-disposition');
  if (cd) headers.set('content-disposition', cd);
  return new Response(res.body, { status: 200, headers });
}
