import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readXlsxSheets } from '../src/common/xlsx.js';
import { DoiResolver } from '../src/research/doi.js';
import { RESEARCH_PASS_ENTITIES } from '../src/research/research-pass.records.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

const binary = (res: request.Response, cb: (e: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
const L = (rupees: number) => rupees * 100;

/**
 * The research pass end to end on a fresh institution, with every figure worked by hand in the comments: researcher
 * profiles, DOI look-up with the offline fallback and duplicate detection, a grant's heads, releases, overhead and
 * GFR 12-A figures, incentive claims with a co-author share and a yearly cap, Ph.D. registration detail and progress
 * reports, external similarity reports and the Shodhganga deposit, designation caps, and the NIRF, NBA, AISHE and
 * NAAC figures. Each new list refuses a student and shows another institution nothing.
 */
describe('research pass', () => {
  const owner = ownerPool();
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tok: Record<string, string> = {};
  let registryDown = false;
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tok[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const add = (who: string, e: string, body: object) => http().post(`/v1/records/${e}`).set(as(who)).send(body);
  const list = async (who: string, e: string, q = '') => (await http().get(`/v1/records/${e}${q}`).set(as(who)).expect(200)).body;
  const act = (who: string, e: string, action: string, ids: string[], params: object = {}) => http().post(`/v1/records/${e}/bulk`).set(as(who)).send({ op: 'action', action, target: { ids }, params });
  const R = '/v1/research';

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock, (b) =>
      b.overrideProvider(DoiResolver).useValue({
        resolve: async (doi: string) => {
          if (registryDown) throw new Error('registry offline');
          if (doi === '10.1000/abc') return { title: 'Ledgers on phones', venue: 'Journal of Rural Finance', year: 2025, kind: 'journal', issn: '1234-5678', authors: [{ name: 'K. Outside' }] };
          if (doi === '10.1000/late') return { title: 'Village credit after UPI', venue: 'Economic Notes', year: 2026, kind: 'journal', issn: null, authors: [{ name: 'A. Writer' }] };
          return null;
        },
      }),
    );
    tok.principal = await login(t.slug, t.principal.email!);
    tok.teacher = await login(t.slug, t.teacher.email!);
    tok.teacher2 = await login(t.slug, t.teacher2.email!);
    tok.student = await login(t.slug, t.studentUser.email!);
    tok.outsider = await login(other.slug, other.principal.email!);
    // Three regular faculty: the two teachers (assistant professors) and the principal (a professor).
    const [asst] = (await owner.query(`insert into designations (tenant_id, name) values ($1, 'Assistant Professor') returning id`, [t.tenantId])).rows;
    const [prof] = (await owner.query(`insert into designations (tenant_id, name) values ($1, 'Professor') returning id`, [t.tenantId])).rows;
    for (const [u, d, code] of [[t.teacher.id, asst.id, 'E1'], [t.teacher2.id, asst.id, 'E2'], [t.principal.id, prof.id, 'E3']]) await owner.query('insert into staff_profiles (user_id, tenant_id, employee_code, designation_id) values ($1, $2, $3, $4)', [u, t.tenantId, code, d]);
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('describes every new list, refuses a student and shows another institution nothing', async () => {
    for (const e of RESEARCH_PASS_ENTITIES) {
      const meta = (await http().get(`/v1/records/${e}/meta`).set(as('principal')).expect(200)).body;
      expect(meta.can.write, e).toBe(true);
      if (e !== 'research-incentive-claims') await http().get(`/v1/records/${e}/import/template`).set(as('principal')).buffer(true).parse(binary).expect(200);
      await http().get(`/v1/records/${e}`).set(as('student')).expect(403);
    }
    for (const path of ['/reports/nirf-params', '/reports/nba', '/reports/aishe']) {
      await http().get(`${R}${path}`).set(as('teacher')).expect(403);
      await http().get(`${R}${path}`).set(as('student')).expect(403);
    }
    await http().get(`${R}/profiles/me`).set(as('student')).expect(403);
  });

  it('lets the IQAC read the research reports and nothing else', async () => {
    const email = `iqac-${t.slug}@x.in`;
    const [u] = (await owner.query(`insert into users (tenant_id, full_name, email, password_hash) select tenant_id, 'IQAC Officer', $2, password_hash from users where id = $1 returning id`, [t.teacher.id, email])).rows;
    await owner.query(`insert into user_roles (tenant_id, user_id, role) values ($1, $2, 'quality_officer')`, [t.tenantId, u.id]);
    tok.iqac = await login(t.slug, email);
    for (const path of ['/reports/nirf-params', '/reports/nba', '/reports/aishe', '/reports/naac-c3', '/reports/nirf-rp', '/reports/faculty']) await http().get(`${R}${path}`).set(as('iqac')).expect(200);
    await http().get(`${R}/reports/faculty-profile?userId=${t.teacher.id}`).set(as('iqac')).expect(200);
    await http().get('/v1/records/research-publications').set(as('iqac')).expect(403);
    await http().get(`${R}/profiles/me`).set(as('iqac')).expect(403);
    await http().post(`${R}/incentives/claims`).set(as('iqac')).send({ schemeId: t.tenantId, publicationId: t.tenantId }).expect(403);
  });

  it('keeps each teacher\'s researcher identifiers, checked and normalised, and verified by the office', async () => {
    await http().put(`${R}/profiles/me`).set(as('teacher')).send({ orcid: '0000-0002-1825-0098' }).expect(400);
    await http().put(`${R}/profiles/me`).set(as('teacher')).send({ scopusAuthorId: '12345' }).expect(400);
    await http().put(`${R}/profiles/me`).set(as('teacher')).send({ wosResearcherId: 'AB-12-2019' }).expect(400);
    const saved = (await http().put(`${R}/profiles/me`).set(as('teacher')).send({ orcid: 'https://orcid.org/0000-0002-1825-0097', scopusAuthorId: '57201234567', wosResearcherId: 'aab-1234-2019', googleScholarId: 'https://scholar.google.com/citations?user=qc6CJjYAAAAJ&hl=en', vidwanId: 'https://vidwan.inflibnet.ac.in/profile/123456', scopusHIndex: 7, areas: 'Rural finance' }).expect(200)).body;
    expect(saved).toMatchObject({ orcid: '0000-0002-1825-0097', scopusAuthorId: '57201234567', wosResearcherId: 'AAB-1234-2019', googleScholarId: 'qc6CJjYAAAAJ', vidwanId: '123456', scopusHIndex: 7, metricsOn: '2026-10-20', verifiedAt: null });
    // One ORCID iD belongs to one teacher.
    expect((await http().put(`${R}/profiles/me`).set(as('teacher2')).send({ orcid: '0000-0002-1825-0097' }).expect(409)).body.code).toBe('ORCID_TAKEN');
    // The teacher sees only their own profile; the office verifies it; a later change to an identifier clears that.
    expect((await list('teacher2', 'research-profiles')).total).toBe(0);
    const rows = (await list('principal', 'research-profiles')).rows;
    expect(rows).toHaveLength(1);
    await act('teacher', 'research-profiles', 'verify', [rows[0].id]).expect(403);
    await act('principal', 'research-profiles', 'verify', [rows[0].id]).expect(200);
    expect((await owner.query('select verified_at is not null as v from research_profiles where id = $1', [rows[0].id])).rows[0].v).toBe(true);
    await http().put(`${R}/profiles/me`).set(as('teacher')).send({ scopusHIndex: 8 }).expect(200);
    expect((await owner.query('select verified_at is not null as v from research_profiles where id = $1', [rows[0].id])).rows[0].v).toBe(true);
    await http().put(`${R}/profiles/me`).set(as('teacher')).send({ vidwanId: '654321' }).expect(200);
    expect((await owner.query('select verified_at is not null as v from research_profiles where id = $1', [rows[0].id])).rows[0].v).toBe(false);
    expect((await list('outsider', 'research-profiles')).total).toBe(0);
    // The Teacher App's "my research" carries the identifiers.
    expect((await http().get(`${R}/me`).set(as('teacher')).expect(200)).body.ids).toMatchObject({ orcid: '0000-0002-1825-0097', vidwanId: '654321' });
  });

  it('looks a DOI up through its cache, keeps a pending record while the registry is offline and completes it later', async () => {
    const first = (await http().get(`${R}/publications/doi-lookup?doi=https://doi.org/10.1000/abc`).set(as('teacher')).expect(200)).body;
    expect(first).toMatchObject({ doi: '10.1000/abc', source: 'registry', record: { title: 'Ledgers on phones' }, duplicate: null });
    registryDown = true;
    // A cached DOI still answers while the registry is down.
    expect((await http().get(`${R}/publications/doi-lookup?doi=10.1000/abc`).set(as('teacher')).expect(200)).body.source).toBe('cache');
    const imported = (await http().post(`${R}/publications/import-doi`).set(as('teacher')).send({ doi: '10.1000/abc' }).expect(201)).body;
    expect(imported).toMatchObject({ title: 'Ledgers on phones', metadataSource: 'crossref', lookup: 'cache' });
    // An unseen DOI cannot be read: without typed-in details it is refused, with them it is kept as pending.
    expect((await http().post(`${R}/publications/import-doi`).set(as('teacher')).send({ doi: '10.1000/late' }).expect(502)).body.code).toBe('REGISTRY_OFFLINE');
    const pending = (await http().post(`${R}/publications/import-doi`).set(as('teacher')).send({ doi: '10.1000/late', fallback: { title: 'Credit after UPI (draft title)', venue: 'Economic Notes', year: 2026 } }).expect(201)).body;
    expect(pending).toMatchObject({ metadataSource: 'pending', lookup: 'offline' });
    expect((await http().post(`${R}/publications/refresh-pending`).set(as('teacher')).expect(200)).body).toMatchObject({ checked: 1, updated: 0, stillPending: 1, registryOffline: true });
    registryDown = false;
    expect((await http().post(`${R}/publications/refresh-pending`).set(as('teacher')).expect(200)).body).toMatchObject({ checked: 1, updated: 1, stillPending: 0 });
    expect((await owner.query('select title, metadata_source from publications where id = $1', [pending.id])).rows[0]).toEqual({ title: 'Village credit after UPI', metadata_source: 'crossref' });
    // The same paper again: by DOI, or by its title with other punctuation and case, a year apart.
    await http().post(`${R}/publications/import-doi`).set(as('teacher2')).send({ doi: '10.1000/ABC' }).expect(409);
    expect((await http().post(`${R}/publications/check-duplicate`).set(as('teacher2')).send({ title: 'LEDGERS ON PHONES!', year: 2026 }).expect(200)).body.duplicate).toMatchObject({ id: imported.id, reason: 'title' });
    expect((await http().post(`${R}/publications/check-duplicate`).set(as('teacher2')).send({ title: 'Ledgers on phones', year: 2023 }).expect(200)).body.duplicate).toBeNull();
    expect((await add('teacher2', 'research-publications', { title: 'Ledgers on Phones.', kind: 'journal', authors: 'teacher2', venue: 'X', year: 2024 }).expect(400)).body.message).toMatch(/already recorded/);
    // A different DOI is a different paper even with the same title.
    expect((await http().post(`${R}/publications/check-duplicate`).set(as('teacher2')).send({ title: 'Ledgers on phones', year: 2025, doi: '10.9999/other' }).expect(200)).body.duplicate).toBeNull();
    await http().post(`${R}/publications/import-doi`).set(as('student')).send({ doi: '10.1000/abc' }).expect(403);
  });

  let grantId: string;
  it('books expenses against budget heads and releases, and draws the utilisation certificate figures', async () => {
    const proj = (await add('principal', 'research-projects', { title: 'Rural credit and UPI', kind: 'research', piUserId: t.teacher.id, startsOn: '2026-04-01' }).expect(201)).body;
    // ₹10,00,000 sanctioned from 1 April 2026 with 10% overhead.
    const g = (await add('principal', 'research-grants', { projectId: proj.id, agency: 'ANRF', scheme: 'Core Research Grant', sanctionRef: 'CRG/2026/01', sanctioned: 1000000, agencyKind: 'government', overheadPct: 10, startsOn: '2026-04-01', endsOn: '2029-03-31' }).expect(201)).body;
    grantId = g.id;
    await add('principal', 'grant-heads', { grantId, head: 'manpower', sanctioned: 400000 }).expect(201);
    await add('principal', 'grant-heads', { grantId, head: 'equipment', sanctioned: 500000 }).expect(201);
    await add('principal', 'grant-heads', { grantId, head: 'equipment', sanctioned: 1 }).expect(409);
    // 4 + 5 + 2 lakh is more than the 10 lakh sanction.
    expect((await add('principal', 'grant-heads', { grantId, head: 'contingency', sanctioned: 200000 }).expect(400)).body.message).toMatch(/more than the sanction/);
    await add('principal', 'grant-heads', { grantId, head: 'contingency', sanctioned: 100000 }).expect(201);
    await add('teacher', 'grant-heads', { grantId, head: 'travel', sanctioned: 1 }).expect(403);
    // First instalment ₹6,00,000 released 1 July, in the account 5 July.
    await add('principal', 'grant-releases', { grantId, instalment: 1, releasedOn: '2026-07-01', receivedOn: '2026-07-05', amount: 600000, reference: 'ANRF/REL/1' }).expect(201);
    await add('principal', 'grant-releases', { grantId, instalment: 1, releasedOn: '2026-07-02', amount: 1 }).expect(409);
    await add('principal', 'grant-releases', { grantId, instalment: 2, releasedOn: '2026-07-02', amount: 500000 }).expect(400); // 6 + 5 > 10 lakh
    const exp = (body: object) => http().post(`${R}/grants/${grantId}/expenses`).set(as('teacher')).send(body);
    expect((await exp({ head: 'Spectrometer', amountPaise: L(450000), spentOn: '2026-07-20' }).expect(400)).body.code).toBe('HEAD_REQUIRED');
    await exp({ head: 'Spectrometer', budgetHead: 'equipment', amountPaise: L(450000), spentOn: '2026-07-20' }).expect(201);
    // 4.5 + 0.6 lakh is more than the 5 lakh equipment head.
    expect((await exp({ head: 'Laptop', budgetHead: 'equipment', amountPaise: L(60000), spentOn: '2026-07-21' }).expect(409)).body).toMatchObject({ code: 'HEAD_OVERSPEND', balancePaise: L(50000) });
    await exp({ head: 'Project assistant, July to September', budgetHead: 'manpower', amountPaise: L(150000), spentOn: '2026-08-10' }).expect(201);
    // 6 lakh spent of 6 lakh released: the next rupee waits for the second instalment.
    expect((await exp({ head: 'Project assistant, October', budgetHead: 'manpower', amountPaise: L(50000), spentOn: '2026-10-05' }).expect(409)).body).toMatchObject({ code: 'FUNDS_NOT_RELEASED', balancePaise: 0 });
    await add('principal', 'grant-releases', { grantId, instalment: 2, releasedOn: '2026-10-01', amount: 300000 }).expect(201);
    await exp({ head: 'Project assistant, October', budgetHead: 'manpower', amountPaise: L(50000), spentOn: '2026-10-05' }).expect(201);
    // August to October: opening 6.0 - 4.5 = 1.5 lakh; received 3 lakh; available 4.5; spent 1.5 + 0.5 = 2; closing 2.5.
    const st = (await http().get(`${R}/grants/${grantId}/statement?from=2026-08-01&to=2026-10-31`).set(as('teacher')).expect(200)).body;
    expect(st.uc).toEqual({ openingPaise: L(150000), receivedPaise: L(300000), availablePaise: L(450000), spentPaise: L(200000), closingPaise: L(250000) });
    expect(st).toMatchObject({ sanctionedPaise: L(1000000), releasedPaise: L(900000), pendingReleasePaise: L(100000), spentPaise: L(650000), unspentPaise: L(250000), overheadPaise: L(90000) });
    expect(st.heads.find((h: { head: string }) => h.head === 'manpower')).toMatchObject({ sanctionedPaise: L(400000), spentPaise: L(200000), spentInPeriodPaise: L(200000), balancePaise: L(200000) });
    expect(st.heads.find((h: { head: string }) => h.head === 'equipment')).toMatchObject({ spentPaise: L(450000), spentInPeriodPaise: 0, balancePaise: L(50000) });
    // The kit lists show the same: released and overhead on the grant, spent and left on each head.
    expect((await list('principal', 'research-grants')).rows[0]).toMatchObject({ released: 900000, overhead: 90000, spent: 650000 });
    const xlsxBody = (await http().get(`${R}/grants/${grantId}/statement.xlsx?from=2026-08-01&to=2026-10-31`).set(as('principal')).buffer(true).parse(binary).expect(200)).body as Buffer;
    const sheets = await readXlsxSheets(xlsxBody);
    expect(JSON.stringify(sheets)).toContain('Unspent balance at the end of the period');
    // Only the project's people and the office see it; another institution does not.
    await http().get(`${R}/grants/${grantId}/statement`).set(as('teacher2')).expect(404);
    await http().get(`${R}/grants/${grantId}/statement`).set(as('outsider')).expect(404);
    expect((await list('teacher2', 'grant-heads')).total).toBe(0);
    expect((await list('teacher', 'grant-releases')).total).toBe(2);
    expect((await list('outsider', 'grant-releases')).total).toBe(0);
    // A sanction cannot drop below what has been released.
    await http().patch(`/v1/records/research-grants/${grantId}`).set(as('principal')).send({ sanctioned: 800000 }).expect(400);
  });

  it('works out incentive claims from the scheme: best rate, co-author share and the yearly cap', async () => {
    const scheme = (await add('principal', 'research-incentive-schemes', { name: 'Publication incentive 2026-27', kind: 'publication', capPerYear: 30000, validFrom: '2026-04-01', validUntil: '2027-03-31', active: true }).expect(201)).body;
    const sr = (await act('principal', 'research-incentive-schemes', 'setRates', [scheme.id], { rates: 'scopus_q1=25000, scopus=10000, ugc_care=5,000' }).expect(200)).body;
    expect(sr.succeeded, JSON.stringify(sr)).toBe(1);
    expect((await owner.query('select rates from research_incentive_schemes where id = $1', [scheme.id])).rows[0].rates).toEqual({ scopus_q1: 2500000, scopus: 1000000, ugc_care: 500000 });
    expect((await act('principal', 'research-incentive-schemes', 'setRates', [scheme.id], { rates: 'nature=1' }).expect(200)).body.rows[0].ok).toBe(false);
    const name = t.teacher.fullName;
    const q1r = await add('teacher', 'research-publications', { title: 'Credit scoring for kirana stores', kind: 'journal', authors: `${name}; K. Outside`, venue: 'Journal of Banking', year: 2026, indexedIn: 'scopus', quartile: 'Q1' });
    expect(q1r.status, JSON.stringify(q1r.body)).toBe(201);
    const q1 = q1r.body;
    const co = (await add('teacher2', 'research-publications', { title: 'Microfinance repayment in Tumakuru', kind: 'journal', authors: `${t.teacher2.fullName}; ${name}`, venue: 'Rural Studies', year: 2026, indexedIn: 'scopus', quartile: 'Q2' }).expect(201)).body;
    const care = (await add('teacher', 'research-publications', { title: 'Cooperative credit societies', kind: 'journal', authors: name, venue: 'Commerce Today', year: 2026, indexedIn: 'ugc_care' }).expect(201)).body;
    const claim = (pub: string, who = 'teacher') => http().post(`${R}/incentives/claims`).set(as(who)).send({ schemeId: scheme.id, publicationId: pub });
    // First author, Scopus Q1: the full ₹25,000.
    expect((await claim(q1.id).expect(201)).body).toMatchObject({ amountPaise: L(25000), basis: 'scopus_q1', status: 'claimed' });
    expect((await claim(q1.id).expect(409)).body.code).toBe('ALREADY_CLAIMED');
    // Second author of a Q2 paper (no Q2 rate): the Scopus rate ₹10,000 at the 50% co-author share is ₹5,000, which is
    // also exactly what is left of the ₹30,000 cap.
    expect((await claim(co.id).expect(201)).body).toMatchObject({ amountPaise: L(5000), basis: 'scopus (co-author, 50%)' });
    expect((await claim(care.id).expect(409)).body.code).toBe('CAP_REACHED');
    // Not the teacher's paper, not a member of staff, a patent scheme mismatch.
    await claim(q1.id, 'teacher2').expect(403);
    await claim(q1.id, 'student').expect(403);
    // The teacher sees their own claims; the office approves (never its own) and pays; the teacher is told.
    const mine = await list('teacher', 'research-incentive-claims');
    expect(mine.total).toBe(2);
    const first = mine.rows.find((r: { amount: number }) => r.amount === 25000);
    await act('teacher', 'research-incentive-claims', 'approve', [first.id]).expect(403);
    expect((await act('principal', 'research-incentive-claims', 'pay', [first.id], { paymentRef: 'NEFT-1' }).expect(200)).body.rows[0].ok).toBe(false);
    await act('principal', 'research-incentive-claims', 'approve', [first.id]).expect(200);
    await act('principal', 'research-incentive-claims', 'pay', [first.id], { paymentRef: 'NEFT-0042' }).expect(200);
    expect((await owner.query('select status, paid_on::text, payment_ref from research_incentive_claims where id = $1', [first.id])).rows[0]).toEqual({ status: 'paid', paid_on: '2026-10-20', payment_ref: 'NEFT-0042' });
    expect((await owner.query("select count(*)::int as n from notifications where user_id = $1 and dedupe_key like 'incentive:%'", [t.teacher.id])).rows[0].n).toBe(2);
    // A rejected claim frees the cap: the UGC-CARE paper (₹5,000) then fits.
    const second = mine.rows.find((r: { amount: number }) => r.amount === 5000);
    await act('principal', 'research-incentive-claims', 'reject', [second.id], { note: 'Second author is outside the policy' }).expect(200);
    expect((await claim(care.id).expect(201)).body.amountPaise).toBe(L(5000));
    // A retracted paper earns nothing.
    await owner.query("update publications set status = 'retracted', retracted_on = '2026-10-01' where id = $1", [care.id]);
    const scheme2 = (await add('principal', 'research-incentive-schemes', { name: 'Second scheme', kind: 'publication', active: true }).expect(201)).body;
    await act('principal', 'research-incentive-schemes', 'setRates', [scheme2.id], { rates: 'ugc_care=1000' }).expect(200);
    expect((await http().post(`${R}/incentives/claims`).set(as('teacher')).send({ schemeId: scheme2.id, publicationId: care.id }).expect(409)).body.code).toBe('NOT_ELIGIBLE');
    expect((await list('outsider', 'research-incentive-claims')).total).toBe(0);
  });

  let scholarId: string;
  it('registers scholars with their detail, takes six-monthly progress reports and caps supervisors by designation', async () => {
    const sc = (await add('principal', 'research-scholars', { fullName: 'Meera Patil', programme: 'phd', supervisorUserId: t.teacher.id, enrolledOn: '2025-01-10', registrationNo: 'BCU/PHD/2025/014', gender: 'female', fellowship: 'jrf', fellowshipAgency: 'UGC', mode: 'full_time', category: 'general' }).expect(201)).body;
    scholarId = sc.id;
    // Women get eight years: 10 January 2025 + 8 years - 1 day.
    expect(sc).toMatchObject({ submitBy: '2033-01-09', registrationNo: 'BCU/PHD/2025/014' });
    await add('principal', 'research-scholars', { fullName: 'Duplicate Number', programme: 'phd', supervisorUserId: t.teacher.id, enrolledOn: '2025-01-10', registrationNo: 'BCU/PHD/2025/014' }).expect(409);
    await add('principal', 'research-scholars', { fullName: 'No agency', programme: 'phd', supervisorUserId: t.teacher.id, enrolledOn: '2025-01-10', fellowship: 'srf' }).expect(400);
    await add('principal', 'research-scholars', { fullName: 'Synopsis first', programme: 'phd', supervisorUserId: t.teacher.id, enrolledOn: '2025-01-10', synopsisApprovedOn: '2025-09-01' }).expect(400);
    await add('principal', 'research-scholars', { fullName: 'Ravi Kumar', programme: 'phd', supervisorUserId: t.teacher2.id, enrolledOn: '2024-08-01', gender: 'male', mode: 'part_time', category: 'sc' }).expect(201);
    const awarded = (await add('principal', 'research-scholars', { fullName: 'Asha Rao', programme: 'phd', supervisorUserId: t.principal.id, enrolledOn: '2021-01-15', gender: 'female' }).expect(201)).body;
    await owner.query("update research_scholars set status = 'awarded', completed_on = '2026-03-01' where id = $1", [awarded.id]);
    // The supervisor reports; another teacher cannot; periods cannot overlap.
    const rep = (await add('teacher', 'scholar-progress-reports', { scholarId, periodFrom: '2025-01-10', periodTo: '2025-07-09', submittedOn: '2025-07-15', summary: 'Literature review and the questionnaire' }).expect(201)).body;
    expect(rep.status).toBe('submitted');
    await add('teacher', 'scholar-progress-reports', { scholarId, periodFrom: '2025-06-01', periodTo: '2025-12-31', submittedOn: '2026-01-05', summary: 'Overlap' }).expect(400);
    await add('teacher2', 'scholar-progress-reports', { scholarId, periodFrom: '2025-07-10', periodTo: '2026-01-09', submittedOn: '2026-01-15', summary: 'Not my scholar' }).expect(400);
    await act('teacher', 'scholar-progress-reports', 'accept', [rep.id]).expect(400);
    const t2 = await act('teacher2', 'scholar-progress-reports', 'accept', [rep.id], { rating: 'satisfactory' });
    expect(t2.status, JSON.stringify(t2.body)).toBe(400); // not their scholar: outside what they can choose
    await act('teacher', 'scholar-progress-reports', 'accept', [rep.id], { rating: 'satisfactory', remarks: 'Good start' }).expect(200);
    expect((await owner.query('select status, rating, supervisor_remarks from scholar_progress_reports where id = $1', [rep.id])).rows[0]).toEqual({ status: 'accepted', rating: 'satisfactory', supervisor_remarks: 'Good start' });
    expect((await list('principal', 'research-scholars', `?q=Meera`)).rows[0].lastReportTo).toBe('2025-07-09');
    expect((await list('teacher2', 'scholar-progress-reports')).total).toBe(0);
    // UGC 2022: an assistant professor guides at most four, a professor eight.
    const sup = (await http().get(`${R}/supervisors`).set(as('principal')).expect(200)).body;
    expect(sup.find((s: { userId: string }) => s.userId === t.teacher.id)).toMatchObject({ maxScholars: 4, load: 1 });
    expect(sup.find((s: { userId: string }) => s.userId === t.principal.id)).toMatchObject({ maxScholars: 8 });
    for (const n of ['B', 'C', 'D']) await add('principal', 'research-scholars', { fullName: `Scholar ${n}`, programme: 'phd', supervisorUserId: t.teacher.id, enrolledOn: '2026-01-10' }).expect(201);
    const fifth = (await add('principal', 'research-scholars', { fullName: 'Scholar E', programme: 'phd', supervisorUserId: t.teacher2.id, enrolledOn: '2026-01-10' }).expect(201)).body;
    expect((await http().post(`${R}/scholars/${fifth.id}/allocate`).set(as('principal')).send({ supervisorUserId: t.teacher.id }).expect(409)).body.message).toMatch(/4 scholars/);
  });

  it('records an external similarity report with its UGC level, and the Shodhganga deposit after the award', async () => {
    const th = (await http().post(`${R}/scholars/${scholarId}/thesis`).set(as('teacher')).send({ title: 'Credit for kirana stores' }).expect(201)).body;
    await http().post(`${R}/theses/${th.id}/similarity/external`).set(as('teacher')).send({ engine: 'urkund', scorePercent: 8.5, reportRef: 'D123456' }).expect(409); // still a synopsis
    await owner.query("update thesis_records set stage = 'submitted' where id = $1", [th.id]);
    const r1 = (await http().post(`${R}/theses/${th.id}/similarity/external`).set(as('teacher')).send({ engine: 'urkund', scorePercent: 12, reportRef: 'D123450' }).expect(200)).body;
    expect(r1).toMatchObject({ level: 'level_1', withinLimit: false, limitPercent: 10 });
    const r2 = (await http().post(`${R}/theses/${th.id}/similarity/external`).set(as('teacher')).send({ engine: 'drillbit', scorePercent: 8.5, reportRef: 'DB-7781', reportUrl: 'https://drillbit.example/r/7781' }).expect(200)).body;
    expect(r2).toMatchObject({ level: 'level_0', withinLimit: true });
    await http().post(`${R}/theses/${th.id}/similarity/external`).set(as('teacher2')).send({ engine: 'urkund', scorePercent: 1, reportRef: 'X' }).expect(404);
    expect((await http().get(`${R}/theses/${th.id}`).set(as('teacher')).expect(200)).body.similarity).toMatchObject({ engine: 'drillbit', reportRef: 'DB-7781', level: 'level_0' });
    await http().post(`${R}/theses/${th.id}/shodhganga`).set(as('principal')).send({ handle: '10603/512345', depositedOn: '2026-10-01' }).expect(409);
    await owner.query("update thesis_records set stage = 'awarded', awarded_on = '2026-09-15' where id = $1", [th.id]);
    await http().post(`${R}/theses/${th.id}/shodhganga`).set(as('principal')).send({ handle: 'hdl:abc', depositedOn: '2026-10-01' }).expect(400);
    await http().post(`${R}/theses/${th.id}/shodhganga`).set(as('principal')).send({ handle: '10603/512345', depositedOn: '2026-09-01' }).expect(400);
    await http().post(`${R}/theses/${th.id}/shodhganga`).set(as('teacher')).send({ handle: '10603/512345', depositedOn: '2026-10-01' }).expect(403);
    expect((await http().post(`${R}/theses/${th.id}/shodhganga`).set(as('principal')).send({ handle: 'https://shodhganga.inflibnet.ac.in/handle/10603/512345', depositedOn: '2026-10-01' }).expect(200)).body).toMatchObject({ shodhgangaHandle: '10603/512345' });
  });

  it('gives the NIRF ratios, NBA criterion 5, AISHE and NAAC criterion 3 figures from the records', async () => {
    // A centre, and seminars organised: one on IPR (NAAC 3.2.2), one on the subject.
    const centre = (await add('principal', 'research-centres', { code: 'RC-COM', name: 'Research Centre in Commerce', recognisedBy: 'Bengaluru City University', recognisedOn: '2024-06-01', validUntil: '2026-12-31' }).expect(201)).body;
    expect(centre.validity).toBe('expiring'); // within 90 days of 20 October 2026
    await add('principal', 'research-centres', { code: 'rc-com', name: 'Again' }).expect(400);
    await add('teacher', 'research-conferences', { name: 'Workshop on patents for teachers', role: 'organised', level: 'institutional', heldOn: '2026-02-10', eventKind: 'workshop', theme: 'ipr', participants: 60 }).expect(201);
    await add('teacher', 'research-conferences', { name: 'Talk', role: 'attended', level: 'national', heldOn: '2026-02-11', participants: 5 }).expect(400);
    // NIRF for the financial years 2024-25 to 2026-27: 3 faculty each year; the 2026 Scopus papers (Ledgers on phones
    // is 2025) are Credit scoring (Q1) and Microfinance = 2, plus Village credit (no index) not counted; releases
    // received in 2026-27 are 6 + 3 = 9 lakh.
    const nirf = (await http().get(`${R}/reports/nirf-params?toYear=2026`).set(as('principal')).expect(200)).body;
    expect(nirf.years.map((y: { faculty: number }) => y.faculty)).toEqual([3, 3, 3]);
    expect(nirf.years[2], JSON.stringify(nirf)).toMatchObject({ fy: '2026-27', papers: 2, researchPaise: L(900000) });
    // PU = 2 papers / 3 years / 3 faculty = 0.22; FPPP = (9 lakh / 3 years) / 3 faculty = 1 lakh.
    expect(nirf.pu).toEqual({ papers: 2, perFaculty: 0.22 });
    expect(nirf.fppp).toMatchObject({ researchLakhsPerYear: 3, perFacultyLakhs: 1 });
    // NBA for CAY 2025-26: the grant started 1 April 2026 (10 lakh), the IPR workshop, Asha Rao's award.
    const nba = (await http().get(`${R}/reports/nba?year=2025`).set(as('principal')).expect(200)).body;
    expect(nba.years[0]).toMatchObject({ label: 'CAY', year: '2025-26', sponsoredProjects: 1, sponsoredLakhs: 10, phdAwarded: 1, eventsOrganised: 1 });
    expect(nba.years.map((y: { label: string }) => y.label)).toEqual(['CAY', 'CAYm1', 'CAYm2']);
    // AISHE 2025-26 as on 30 September 2025: Meera (woman, full time, general), Ravi (part time, SC) and Asha (awarded
    // only in March 2026, so still enrolled then); the Scholars B to E registered in 2026 do not count yet.
    const aishe = (await http().get(`${R}/reports/aishe`).set(as('principal')).expect(200)).body;
    expect(aishe).toMatchObject({ year: '2025-26', asOn: '2025-09-30' });
    expect(aishe.enrolment).toEqual([{ department: 'Not set', total: 3, female: 2, fullTime: 2, partTime: 1, general: 2, sc: 1, st: 0, obc: 0, ews: 0 }]);
    expect(aishe.awarded).toEqual([{ department: 'Not set', total: 1, female: 1 }]);
    expect(aishe.fellowships).toEqual([{ fellowship: 'jrf', agency: 'UGC', n: 1 }]);
    const wb = (await http().get(`${R}/reports/nba-aishe.xlsx?year=2025`).set(as('principal')).buffer(true).parse(binary).expect(200)).body as Buffer;
    expect(JSON.stringify(await readXlsxSheets(wb))).toContain('Ph.D. enrolment as on 2025-09-30');
    // NAAC 3.1 by agency kind, 3.2.2 from the IPR workshop, in 2025-26.
    const naac = (await http().get(`${R}/reports/naac-c3?cycle=2025-26`).set(as('principal')).expect(200)).body;
    const at = (key: string) => naac.rows.find((r: { key: string }) => r.key === key).values.at(-1);
    expect(at('grants_govt_lakhs')).toBe(10);
    expect(at('grants_nongovt_lakhs')).toBe(0);
    expect(at('ipr_workshops')).toBe(1);
    expect((await http().get(`${R}/reports/aishe`).set(as('outsider')).expect(200)).body.enrolment).toEqual([]);
  });
});
