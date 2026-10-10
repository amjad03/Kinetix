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
  'offer-letter': (id) => `/v1/hr/offers/${id}/pdf`,
  'relieving-letter': (id) => `/v1/hr/separations/${id}/relieving-letter`,
  'probation-letter': (id) => `/v1/hr/probation/reviews/${id}/letter`,
  'training-cert': (id) => `/v1/hr/training-records/${id}/certificate`,
  payslip: (id) => `/v1/payroll/payslips/${id}/pdf`,
  'survey-csv': (id) => `/v1/surveys/${id}/export.csv`,
  passport: (id) => `/v1/passport/students/${id}/pdf`,
  'register-csv': (id) => `/v1/university-results/registers/${id}/export?format=csv`,
  'register-xlsx': (id) => `/v1/university-results/registers/${id}/export?format=xlsx`,
  'register-pdf': (id) => `/v1/university-results/registers/${id}/export?format=pdf`,
  'academic-doc': (id) => `/v1/academic-docs/requests/${id}/document.pdf`,
  'consolidated-result': (id) => `/v1/exam-sessions/${id}/consolidated.pdf`,
  'progress-report': (id) => `/v1/results/students/${id}/progress-report.pdf`,
  'qb-sealed': (id) => `/v1/question-bank/releases/${id}/paper.pdf`,
  'evidence-file': (id) => `/v1/quality/evidence/${id}/file`,
  'committee-evidence': (id) => `/v1/campus-life/evidence/${id}/download`,
  'event-media': (id) => `/v1/campus-life/media/${id}/file`,
  'grievance-evidence': (id) => `/v1/grievances/evidence/${id}/download`,
};

/**
 * Payroll files (bank transfer CSV, statutory CSVs, Tally XML, payslip PDF): fetched here with
 * the session token, which stays in its httpOnly cookie, and streamed to the browser as a download.
 */
export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get('kind') ?? '';
  const id = req.nextUrl.searchParams.get('id') ?? '';
  // The staff and own-card PDFs need no id.
  const FIXED: Record<string, string> = { 'library-labels': '/v1/library/books/labels.pdf', 'asset-tags-all': '/v1/assets/tags.pdf', 'id-staff': '/v1/documents/id-cards/staff.pdf', 'id-me': '/v1/documents/id-cards/me.pdf', 'tally-file': '/v1/tally/export.xml' };
  // GL journals for a date range: gl-csv / gl-tally with ?from=&to=
  const range = ['from', 'to'].map((k) => req.nextUrl.searchParams.get(k) ?? '');
  const GL: Record<string, string> = { 'gl-csv': 'csv', 'gl-tally': 'xml' };
  if (GL[kind]) {
    if (!range.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) return new Response('Not found', { status: 404 });
    FIXED[kind] = `/v1/finance/gl.${GL[kind]}?from=${range[0]}&to=${range[1]}`;
  }
  // A committee's report pack for a date range: ?kind=report-pack&id=<committee>&from=&to=
  if (kind === 'report-pack') {
    if (!UUID.test(id) || !range.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) return new Response('Not found', { status: 404 });
    FIXED[kind] = `/v1/campus-life/committees/${id}/report-pack?from=${range[0]}&to=${range[1]}`;
  }
  // Accreditation exports: ?kind=accreditation&id=<naac|nba1|nba2|nirf|aishe|atr|tmpl-naac-2.6.3>&cycle=2026-27
  if (kind === 'accreditation') {
    const cycle = req.nextUrl.searchParams.get('cycle') ?? '';
    const q = /^\d{4}(-\d{2,4})?$/.test(cycle) ? `?cycle=${cycle}` : '';
    const tmpl = /^tmpl-(naac|nba|nirf)-([A-Za-z0-9.]+)$/.exec(id);
    const files: Record<string, string> = { naac: `/v1/accreditation/naac/export.zip${q}`, nba1: `/v1/accreditation/nba/export.xlsx${q}${q ? '&' : '?'}tier=1`, nba2: `/v1/accreditation/nba/export.xlsx${q}${q ? '&' : '?'}tier=2`, nirf: `/v1/accreditation/nirf/export.xlsx${q}`, aishe: '/v1/accreditation/aishe/export.xlsx', atr: `/v1/accreditation/iqac/atr.xlsx${q}` };
    const target = tmpl ? `/v1/accreditation/${tmpl[1]}/metrics/${tmpl[2]}/template.xlsx` : files[id];
    if (!target) return new Response('Not found', { status: 404 });
    FIXED[kind] = target;
  }
  if (kind === 'hall-ticket') {
    const test = req.nextUrl.searchParams.get('test') ?? '';
    const app = req.nextUrl.searchParams.get('app') ?? '';
    if (!UUID.test(test) || !UUID.test(app)) return new Response('Not found', { status: 404 });
    FIXED[kind] = `/v1/admissions/entrance-tests/${test}/hall-ticket/${app}`;
  }
  // One scanned page of the examiner's own script: ?kind=eval-page&id=<allocation>&index=<page>
  if (kind === 'eval-page') {
    const index = req.nextUrl.searchParams.get('index') ?? '';
    if (!UUID.test(id) || !/^\d{1,3}$/.test(index)) return new Response('Not found', { status: 404 });
    FIXED[kind] = `/v1/evaluation/allocations/${id}/pages/${index}`;
  }
  // A child's learning story for a term: ?kind=learning-story&id=<student>&termId=<term>
  const termId = req.nextUrl.searchParams.get('termId') ?? '';
  if (kind === 'learning-story') {
    if (!UUID.test(id) || !UUID.test(termId)) return new Response('Not found', { status: 404 });
    FIXED[kind] = `/v1/early-years/students/${id}/learning-story.pdf?termId=${termId}`;
  }
  // The seating chart of one hall for one sitting: ?kind=seating-chart&id=<session>&slot=<n>&room=<hall>
  if (kind === 'seating-chart') {
    const slot = req.nextUrl.searchParams.get('slot') ?? '';
    const room = req.nextUrl.searchParams.get('room') ?? '';
    if (!UUID.test(id) || !/^\d{1,3}$/.test(slot) || !UUID.test(room)) return new Response('Not found', { status: 404 });
    FIXED[kind] = `/v1/exam-sessions/${id}/seating-plan/sittings/${slot}/rooms/${room}/pdf`;
  }
  // Form 16 for one employee and financial year: ?kind=form16&id=<staff user>&fy=2026-27
  if (kind === 'form16') {
    const fy = req.nextUrl.searchParams.get('fy') ?? '';
    if (!UUID.test(id) || !/^\d{4}-\d{2}$/.test(fy)) return new Response('Not found', { status: 404 });
    FIXED[kind] = `/v1/hr/payroll/form16/${id}?fy=${fy}`;
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
