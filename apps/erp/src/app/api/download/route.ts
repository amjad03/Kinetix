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
  'leave-doc': (id) => `/v1/attendance-desk/leaves/${id}/document`,
  'condonation-doc': (id) => `/v1/attendance/condonations/${id}/document`,
  'placement-shortlist': (id) => `/v1/placements/drives/${id}/shortlist?format=csv`,
  'placement-offer-letter': (id) => `/v1/placements/offers/${id}/letter`,
  'staff-doc': (id) => `/v1/hr/staff-documents/${id}/file`,
  'staff-leave-doc': (id) => `/v1/hr/leave/requests/${id}/document`,
  resume: (id) => `/v1/hr/applicants/${id}/resume`,
  'appointment-letter': (id) => `/v1/hr/applicants/${id}/appointment-letter`,
  'experience-cert': (id) => `/v1/hr/separations/${id}/experience-certificate`,
  lwf: (id) => `/v1/payroll/runs/${id}/statutory.csv?kind=lwf`,
  ecr: (id) => `/v1/payroll/runs/${id}/ecr.txt`,
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
  // An admissions / campus-operations report: ?kind=ops-report&id=<library.circulation>&format=pdf|xlsx&from=&to=&status=
  if (kind === 'ops-report') {
    const format = req.nextUrl.searchParams.get('format') ?? '';
    const status = req.nextUrl.searchParams.get('status') ?? '';
    if (!/^[a-z]+\.[a-z]+(-[a-z]+)*$/.test(id) || !['pdf', 'xlsx', 'csv'].includes(format) || !/^[a-z_]{0,40}$/.test(status)) return new Response('Not found', { status: 404 });
    const q = new URLSearchParams({ format });
    if (range[0] && /^\d{4}-\d{2}-\d{2}$/.test(range[0])) q.set('from', range[0]);
    if (range[1] && /^\d{4}-\d{2}-\d{2}$/.test(range[1])) q.set('to', range[1]);
    if (status) q.set('status', status);
    FIXED[kind] = `/v1/ops-reports/${id}?${q.toString()}`;
  }
  // A committee's report pack for a date range: ?kind=report-pack&id=<committee>&from=&to=
  if (kind === 'report-pack') {
    if (!UUID.test(id) || !range.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) return new Response('Not found', { status: 404 });
    FIXED[kind] = `/v1/campus-life/committees/${id}/report-pack?from=${range[0]}&to=${range[1]}`;
  }
  // Accreditation exports: ?kind=accreditation&fw=<framework>&id=<ssr|aqar|xlsx|pack|dvv|tmpl-2.6.3|file-<evidence>>&cycle=2026-27,
  // plus the older ids without a framework (naac, nba2, nirf, aishe, atr, tmpl-naac-2.6.3).
  if (kind === 'accreditation') {
    const sp = req.nextUrl.searchParams;
    const cycle = sp.get('cycle') ?? '';
    const q = /^\d{4}(-\d{2,4})?$/.test(cycle) ? `?cycle=${cycle}` : '';
    const fwParam = sp.get('fw') ?? '';
    const fw = /^[a-z0-9-]{3,30}$/.test(fwParam) ? fwParam : '';
    const tmpl = /^tmpl-(?:(naac|nba|nirf)-)?([A-Za-z0-9.-]{1,24})$/.exec(id);
    const file = /^file-([0-9a-f-]{36})$/i.exec(id);
    const legacy: Record<string, string> = { naac: `/v1/accreditation/naac/export.zip${q}`, nba2: `/v1/accreditation/nba/export.xlsx${q}`, nirf: `/v1/accreditation/nirf/export.xlsx${q}`, aishe: '/v1/accreditation/aishe/export.xlsx', atr: `/v1/accreditation/iqac/atr.xlsx${q}` };
    const per: Record<string, string> = fw ? { ssr: `/v1/accreditation/${fw}/export.zip${q}`, aqar: `/v1/accreditation/${fw}/aqar.xlsx${q}`, xlsx: `/v1/accreditation/${fw}/export.xlsx${q}`, pack: `/v1/accreditation/${fw}/evidence-pack.zip${q}`, dvv: `/v1/accreditation/${fw}/dvv.xlsx${q}` } : {};
    const tmplFw = tmpl ? (tmpl[1] ?? fw) : '';
    const target = file ? `/v1/accreditation/evidence/${file[1]}/download` : tmpl && tmplFw ? `/v1/accreditation/${tmplFw}/metrics/${tmpl[2]}/template.xlsx${q}` : (per[id] ?? legacy[id]);
    if (!target) return new Response('Not found', { status: 404 });
    FIXED[kind] = target;
  }
  // Research reports: ?kind=research&id=nirf-rp&toYear=2026, or ?kind=research&id=profile&user=<uuid>
  if (kind === 'research') {
    const sp = req.nextUrl.searchParams;
    const toYear = sp.get('toYear') ?? '';
    const user = sp.get('user') ?? '';
    if (id === 'nirf-rp') FIXED[kind] = `/v1/research/reports/nirf-rp.xlsx${/^\d{4}$/.test(toYear) ? `?toYear=${toYear}` : ''}`;
    else if (id === 'profile') FIXED[kind] = `/v1/research/reports/faculty-profile.xlsx${UUID.test(user) ? `?userId=${user}` : ''}`;
    else return new Response('Not found', { status: 404 });
  }
  // Form 24Q: ?kind=q24&fy=2026&quarter=1..4&annexure=1|2
  if (kind === 'q24') {
    const sp = req.nextUrl.searchParams;
    const fy = sp.get('fy') ?? '';
    const quarter = sp.get('quarter') ?? '';
    const annexure = sp.get('annexure') ?? '1';
    if (!/^\d{4}$/.test(fy) || !/^[1-4]$/.test(quarter) || !/^[12]$/.test(annexure)) return new Response('Not found', { status: 404 });
    FIXED[kind] = `/v1/payroll/24q.csv?fy=${fy}&quarter=${quarter}&annexure=${annexure}`;
  }
  if (kind === 'hall-ticket') {
    const test = req.nextUrl.searchParams.get('test') ?? '';
    const app = req.nextUrl.searchParams.get('app') ?? '';
    if (!UUID.test(test) || !UUID.test(app)) return new Response('Not found', { status: 404 });
    FIXED[kind] = `/v1/admissions/entrance-tests/${test}/hall-ticket/${app}`;
  }
  // A degree certificate: ?kind=degree&id=<convocation>&candidate=<candidate>
  if (kind === 'degree') {
    const candidate = req.nextUrl.searchParams.get('candidate') ?? '';
    if (!UUID.test(id) || !UUID.test(candidate)) return new Response('Not found', { status: 404 });
    FIXED[kind] = `/v1/university/convocations/${id}/candidates/${candidate}/certificate.pdf`;
  }
  // A staff-chat attachment: ?kind=chat-file&id=<thread>&msg=<message>
  if (kind === 'chat-file') {
    const msg = req.nextUrl.searchParams.get('msg') ?? '';
    if (!UUID.test(id) || !UUID.test(msg)) return new Response('Not found', { status: 404 });
    FIXED[kind] = `/v1/chat/threads/${id}/messages/${msg}/attachment`;
  }
  // A family-chat attachment: ?kind=conversation-file&id=<conversation>&msg=<message>
  if (kind === 'conversation-file') {
    const msg = req.nextUrl.searchParams.get('msg') ?? '';
    if (!UUID.test(id) || !UUID.test(msg)) return new Response('Not found', { status: 404 });
    FIXED[kind] = `/v1/conversations/${id}/messages/${msg}/attachment`;
  }
  // An announcement attachment: ?kind=announcement-file&id=<announcement>&file=<attachment>
  if (kind === 'announcement-file') {
    const file = req.nextUrl.searchParams.get('file') ?? '';
    if (!UUID.test(id) || !UUID.test(file)) return new Response('Not found', { status: 404 });
    FIXED[kind] = `/v1/announcements/${id}/attachments/${file}`;
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
  // A candidate's hall ticket: ?kind=exam-hall-ticket&id=<session>&student=<student>
  if (kind === 'exam-hall-ticket') {
    const student = req.nextUrl.searchParams.get('student') ?? '';
    if (!UUID.test(id) || !UUID.test(student)) return new Response('Not found', { status: 404 });
    FIXED[kind] = `/v1/exam-sessions/${id}/hall-tickets/${student}/pdf`;
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
  // A quality-hub report as PDF or Excel with its filters: ?kind=qh-report&id=placements.offers&format=pdf&from=&to=&status=
  if (kind === 'qh-report') {
    const q = req.nextUrl.searchParams;
    const format = q.get('format') ?? '';
    const [from, to, status] = ['from', 'to', 'status'].map((k) => q.get(k) ?? '');
    if (!/^[a-z]+\.[a-z]+$/.test(id) || !['pdf', 'xlsx'].includes(format) || ![from, to].every((d) => d === '' || /^\d{4}-\d{2}-\d{2}$/.test(d)) || !/^[a-z_]{0,30}$/.test(status)) return new Response('Not found', { status: 404 });
    const params = new URLSearchParams({ format, ...(from ? { from } : {}), ...(to ? { to } : {}), ...(status ? { status } : {}) });
    FIXED[kind] = `/v1/quality-hub/reports/${id}?${params.toString()}`;
  }
  // Academics reports as PDF or Excel: ?kind=acad-report&report=<kind>&format=pdf|xlsx plus the report's own filters.
  if (kind === 'acad-report') {
    const sp = req.nextUrl.searchParams;
    const report = sp.get('report') ?? '';
    const format = sp.get('format') === 'pdf' ? 'pdf' : 'xlsx';
    if (!/^[a-z-]{3,30}$/.test(report)) return new Response('Not found', { status: 404 });
    const keep = new URLSearchParams({ format });
    const ok: Record<string, RegExp> = { date: /^\d{4}-\d{2}-\d{2}$/, from: /^\d{4}-\d{2}-\d{2}$/, to: /^\d{4}-\d{2}-\d{2}$/, month: /^\d{4}-\d{2}$/, by: /^(class|teacher|room)$/, sectionId: UUID, subjectId: UUID, termId: UUID, id: UUID };
    for (const [k, re] of Object.entries(ok)) {
      const v = sp.get(k);
      if (v && re.test(v)) keep.set(k, v);
    }
    FIXED[kind] = `/v1/academics/reports/${report}/export?${keep.toString()}`;
  }
  // A class's monthly attendance register: ?kind=att-register&id=<class>&month=2026-10&subjectId=&format=pdf|xlsx
  if (kind === 'att-register') {
    const sp = req.nextUrl.searchParams;
    const month = sp.get('month') ?? '';
    const subjectId = sp.get('subjectId') ?? '';
    const format = sp.get('format') === 'pdf' ? 'pdf' : 'xlsx';
    if (!UUID.test(id) || !/^\d{4}-\d{2}$/.test(month) || (subjectId && !UUID.test(subjectId))) return new Response('Not found', { status: 404 });
    FIXED[kind] = `/v1/attendance-desk/register?sectionId=${id}&month=${month}&format=${format}${subjectId ? `&subjectId=${subjectId}` : ''}`;
  }
  // A placement report (NIRF, NAAC 5.2, branch-wise…) for a year: ?kind=pl-report&id=<report>&format=csv|xlsx&year=
  if (kind === 'pl-report') {
    const format = req.nextUrl.searchParams.get('format') === 'csv' ? 'csv' : 'xlsx';
    const year = req.nextUrl.searchParams.get('year') ?? '';
    if (!/^[a-z]{3,20}$/.test(id) || !/^\d{4}$/.test(year)) return new Response('Not found', { status: 404 });
    FIXED[kind] = `/v1/placements/reports/${id}?format=${format}&year=${year}`;
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
