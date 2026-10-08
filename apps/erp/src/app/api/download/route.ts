import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { API_URL, SESSION_COOKIE } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where each kind of download lives in the API. Nothing else can be fetched through this route. */
const TARGETS: Record<string, (id: string) => string> = {
  certificate: (id) => `/v1/documents/requests/${id}/pdf`,
  vault: (id) => `/v1/documents/vault/files/${id}`,
  'id-students': (id) => `/v1/documents/id-cards/students.pdf?sectionId=${id}`,
  bank: (id) => `/v1/payroll/runs/${id}/bank-transfer.csv`,
  tally: (id) => `/v1/payroll/runs/${id}/tally.xml`,
  pf: (id) => `/v1/payroll/runs/${id}/statutory.csv?kind=pf`,
  esi: (id) => `/v1/payroll/runs/${id}/statutory.csv?kind=esi`,
  pt: (id) => `/v1/payroll/runs/${id}/statutory.csv?kind=pt`,
  tds: (id) => `/v1/payroll/runs/${id}/statutory.csv?kind=tds`,
  'asset-tags': (id) => `/v1/assets/tags.pdf?ids=${id}`,
  gradebook: (id) => `/v1/lms/courses/${id}/gradebook.csv`,
  'course-file': (id) => `/v1/course-files/${id}/download`,
  'qb-paper': (id) => `/v1/question-bank/papers/${id}/paper.pdf`,
  'qb-key': (id) => `/v1/question-bank/papers/${id}/answer-key.pdf`,
  payslip: (id) => `/v1/payroll/payslips/${id}/pdf`,
  'survey-csv': (id) => `/v1/surveys/${id}/export.csv`,
  passport: (id) => `/v1/passport/students/${id}/pdf`,
};

/**
 * Payroll files (bank transfer CSV, statutory CSVs, Tally XML, payslip PDF): fetched here with
 * the session token, which stays in its httpOnly cookie, and streamed to the browser as a download.
 */
export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get('kind') ?? '';
  const id = req.nextUrl.searchParams.get('id') ?? '';
  // The staff and own-card PDFs need no id.
  const FIXED: Record<string, string> = { 'asset-tags-all': '/v1/assets/tags.pdf', 'id-staff': '/v1/documents/id-cards/staff.pdf', 'id-me': '/v1/documents/id-cards/me.pdf' };
  // GL journals for a date range: gl-csv / gl-tally with ?from=&to=
  const range = ['from', 'to'].map((k) => req.nextUrl.searchParams.get(k) ?? '');
  const GL: Record<string, string> = { 'gl-csv': 'csv', 'gl-tally': 'xml' };
  if (GL[kind]) {
    if (!range.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) return new Response('Not found', { status: 404 });
    FIXED[kind] = `/v1/finance/gl.${GL[kind]}?from=${range[0]}&to=${range[1]}`;
  }
  const target = FIXED[kind] ? () => FIXED[kind] : TARGETS[kind];
  // Asset tags take one id or a comma-separated list.
  const validId = kind === 'asset-tags' ? id.split(',').every((x) => UUID.test(x)) : UUID.test(id);
  if (!target || (!FIXED[kind] && !validId)) return new Response('Not found', { status: 404 });
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return new Response('Forbidden', { status: 403 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return new Response('Sign in', { status: 401 });
  const upstream = await fetch(`${API_URL}${target(id)}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!upstream) return new Response("Can't reach KINETIX Cloud", { status: 502 });
  if (!upstream.ok) return new Response(await upstream.text(), { status: upstream.status, headers: { 'content-type': 'application/json' } });
  const headers = new Headers();
  for (const h of ['content-type', 'content-disposition', 'x-missing-bank']) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set('cache-control', 'no-store');
  return new Response(upstream.body, { status: 200, headers });
}
