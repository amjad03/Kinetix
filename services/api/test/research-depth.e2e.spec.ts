import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readXlsx, readXlsxSheets } from '../src/common/xlsx.js';
import { OrcidResolver, fromOrcid, validOrcid } from '../src/research/orcid.js';
import { DoiResolver } from '../src/research/doi.js';
import { hIndex } from '../src/research/research-rules.js';
import { RESEARCH_ENTITIES } from '../src/research/research.records.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

const binary = (res: request.Response, cb: (e: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('research rules', () => {
  it('computes the h-index and checks ORCID iDs', () => {
    expect(hIndex([10, 8, 5, 4, 3])).toBe(4);
    expect(hIndex([25, 8, 5, 3, 3])).toBe(3);
    expect(hIndex([0, 0])).toBe(0);
    expect(hIndex([])).toBe(0);
    expect(validOrcid('0000-0002-1825-0097')).toBe(true);
    expect(validOrcid('https://orcid.org/0000-0001-5109-3700')).toBe(true);
    expect(validOrcid('0000-0002-1825-0098')).toBe(false);
    expect(validOrcid('1234')).toBe(false);
    expect(fromOrcid({ group: [{ 'work-summary': [{ title: { title: { value: 'A paper' } }, 'publication-date': { year: { value: '2025' } }, 'external-ids': { 'external-id': [{ 'external-id-type': 'doi', 'external-id-value': '10.1/x' }] }, type: 'journal-article' }] }, { 'work-summary': [] }] })).toEqual([{ title: 'A paper', year: 2025, doi: '10.1/x', type: 'journal-article', venue: null }]);
  });
});

describe('research office depth', () => {
  const owner = ownerPool();
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tok: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tok[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const add = (who: string, e: string, body: object) => http().post(`/v1/records/${e}`).set(as(who)).send(body);
  const edit = (who: string, e: string, id: string, body: object) => http().patch(`/v1/records/${e}/${id}`).set(as(who)).send(body);
  const list = async (who: string, e: string, q = '') => (await http().get(`/v1/records/${e}${q}`).set(as(who)).expect(200)).body;
  const act = (who: string, e: string, action: string, ids: string[], params: object = {}) => http().post(`/v1/records/${e}/bulk`).set(as(who)).send({ op: 'action', action, target: { ids }, params });

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock, (b) =>
      b
        .overrideProvider(OrcidResolver)
        .useValue({ works: async (id: string) => (id === '0000-0002-1825-0097' ? [{ title: 'Ledgers on phones', year: 2025, doi: '10.1000/abc', type: 'journal-article', venue: null }, { title: 'Rural credit notes', year: 2024, doi: null, type: 'book-chapter', venue: 'Essays on credit' }, { title: 'Undated', year: null, doi: null, type: 'other', venue: null }] : null) })
        .overrideProvider(DoiResolver)
        .useValue({ resolve: async (doi: string) => (doi === '10.1000/abc' ? { title: 'Ledgers on phones', venue: 'Journal of Rural Finance', year: 2025, kind: 'journal', issn: '1234-5678', authors: [{ name: 'teacher' }, { name: 'K. Outside' }] } : null) }),
    );
    tok.principal = await login(t.slug, t.principal.email!);
    tok.teacher = await login(t.slug, t.teacher.email!);
    tok.teacher2 = await login(t.slug, t.teacher2.email!);
    tok.student = await login(t.slug, t.studentUser.email!);
    tok.outsider = await login(other.slug, other.principal.email!);
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('describes every research list, keeps it to its institution and offers the Excel template', async () => {
    for (const e of RESEARCH_ENTITIES) {
      const meta = (await http().get(`/v1/records/${e}/meta`).set(as('principal')).expect(200)).body;
      expect(meta.can.write, e).toBe(true);
      expect(meta.import, e).not.toBeNull();
      await http().get(`/v1/records/${e}/import/template`).set(as('principal')).buffer(true).parse(binary).expect(200);
      await http().get(`/v1/records/${e}`).set(as('student')).expect(403);
    }
  });

  let pubId: string;
  it('records a publication once, credits staff co-authors by name, and keeps a retracted paper out of the counts', async () => {
    await add('teacher', 'research-publications', { title: 'Cooperative banks in Karnataka', kind: 'journal', authors: `${t.teacher.fullName}; A. Partner`, venue: 'Indian Journal of Commerce', year: 2026, doi: 'https://doi.org/10.5555/COOP.1', indexedIn: 'scopus, ugc_care', citations: 12 }).expect(201);
    const pubs = await list('teacher', 'research-publications');
    expect(pubs.rows[0]).toMatchObject({ doi: '10.5555/COOP.1', indexedIn: 'scopus, ugc_care', authors: `${t.teacher.fullName}; A. Partner`, ownerUserIdName: t.teacher.fullName });
    pubId = pubs.rows[0].id;
    const stored = (await owner.query('select authors from publications where id = $1', [pubId])).rows[0].authors;
    expect(stored[0]).toMatchObject({ name: t.teacher.fullName, userId: t.teacher.id });
    // The same DOI, or the same title and year without one, is one record however many co-authors enter it.
    await add('teacher2', 'research-publications', { title: 'Other title', kind: 'journal', authors: 'teacher2', venue: 'X', year: 2026, doi: '10.5555/coop.1' }).expect(409);
    await add('teacher2', 'research-publications', { title: 'GST and MSMEs', kind: 'journal', authors: `${t.teacher2.fullName}; ${t.teacher.fullName}`, venue: 'Journal of Accounting', year: 2026, citations: 3 }).expect(201);
    expect((await add('principal', 'research-publications', { title: 'gst and msmes', kind: 'journal', authors: 'x', venue: 'Y', year: 2026 }).expect(400)).body.message).toMatch(/already recorded/);
    await add('teacher', 'research-publications', { title: 'Bad', kind: 'journal', authors: 'x', venue: 'Y', year: 2026, indexedIn: 'nature' }).expect(400);
    await add('teacher', 'research-publications', { title: 'Someone else', kind: 'journal', authors: 'x', venue: 'Y', year: 2026, ownerUserId: t.teacher2.id }).expect(400);
    // The teacher sees papers they own or co-authored; the research office sees all.
    expect((await list('teacher', 'research-publications')).total).toBe(2);
    expect((await list('principal', 'research-publications', '?f.indexedIn=scopus')).total).toBe(1);
    // Retraction needs its date; then the paper stops counting.
    await edit('principal', 'research-publications', pubId, { status: 'retracted' }).expect(400);
    await edit('principal', 'research-publications', pubId, { status: 'retracted', retractedOn: '2026-10-01', retractionNote: 'Data error' }).expect(200);
    const kpis = (await http().get('/v1/research/kpis').set(as('principal')).expect(200)).body;
    expect(kpis.publications.total).toBe(1);
    const prof = (await http().get(`/v1/research/reports/faculty-profile?userId=${t.teacher.id}`).set(as('principal')).expect(200)).body;
    expect(prof.summary).toMatchObject({ publications: 1, retracted: 1, citations: 3, hIndex: 1 });
    await http().get(`/v1/research/reports/faculty-profile?userId=${t.teacher2.id}`).set(as('teacher')).expect(403);
    expect((await http().get('/v1/research/reports/faculty-profile.xlsx').set(as('teacher')).buffer(true).parse(binary).expect(200)).body.subarray(0, 2).toString()).toBe('PK');
  });

  it('imports works from ORCID once, reading DOIs from the registry', async () => {
    await http().post('/v1/research/publications/import-orcid').set(as('teacher')).send({ orcid: '0000-0002-1825-0098' }).expect(400);
    await http().post('/v1/research/publications/import-orcid').set(as('teacher')).send({ orcid: '0000-0001-5109-3700' }).expect(404);
    const r = (await http().post('/v1/research/publications/import-orcid').set(as('teacher')).send({ orcid: 'https://orcid.org/0000-0002-1825-0097' }).expect(200)).body;
    expect(r).toEqual({ found: 3, added: 2, skipped: 0, incomplete: 1 });
    const again = (await http().post('/v1/research/publications/import-orcid').set(as('teacher')).send({ orcid: '0000-0002-1825-0097' }).expect(200)).body;
    expect(again).toMatchObject({ added: 0, skipped: 2 });
    const { rows } = await owner.query(`select title, kind, venue from publications where tenant_id = $1 and title in ('Ledgers on phones', 'Rural credit notes') order by title`, [t.tenantId]);
    expect(rows).toEqual([{ title: 'Ledgers on phones', kind: 'journal', venue: 'Journal of Rural Finance' }, { title: 'Rural credit notes', kind: 'book_chapter', venue: 'Essays on credit' }]);
  });

  it('moves a patent from filed to published and granted, crediting inventors', async () => {
    await add('teacher', 'research-patents', { title: 'Soil sensor', kind: 'patent', inventors: `${t.teacher.fullName}; ${t.teacher2.fullName}` }).expect(400); // filed needs a number and date
    const p = (await add('teacher', 'research-patents', { title: 'Soil sensor', kind: 'patent', inventors: `${t.teacher.fullName}; ${t.teacher2.fullName}`, applicationNo: '202641000123', filedOn: '2026-01-10' }).expect(201)).body;
    expect(p).toMatchObject({ status: 'filed', inventors: `${t.teacher.fullName}; ${t.teacher2.fullName}` });
    expect((await list('teacher2', 'research-patents')).total).toBe(1);
    expect((await act('teacher', 'research-patents', 'publish', [p.id], { on: '2026-07-01' }).expect(403)));
    await act('principal', 'research-patents', 'grant', [p.id], { on: '2026-09-01' }).expect(200).then((r) => expect(r.body.rows[0]).toMatchObject({ ok: false }));
    expect((await act('principal', 'research-patents', 'publish', [p.id], { on: '2025-12-01' }).expect(200)).body.rows[0]).toMatchObject({ ok: false });
    await act('principal', 'research-patents', 'publish', [p.id], { on: '2026-07-01' }).expect(200);
    expect((await act('principal', 'research-patents', 'grant', [p.id], { on: '2026-09-01', patentNo: 'IN 512345' }).expect(200)).body.succeeded).toBe(1);
    expect((await owner.query('select status, patent_no, granted_on::text from patents where id = $1', [p.id])).rows[0]).toEqual({ status: 'granted', patent_no: 'IN 512345', granted_on: '2026-09-01' });
    const hist = (await http().get(`/v1/records/research-patents/${p.id}/history`).set(as('principal')).expect(200)).body.items.map((i: { action: string }) => i.action);
    expect(hist).toEqual(expect.arrayContaining(['research.patent_granted', 'research.patent_published', 'patent.created']));
  });

  it('gates proposal submission by the call\'s internal deadline, and clears ethics from an approval record', async () => {
    const call = (await add('principal', 'research-calls', { agency: 'ANRF', title: 'CRG 2026', internalDeadline: '2026-10-25', deadline: '2026-11-15' }).expect(201)).body;
    await add('principal', 'research-calls', { agency: 'X', title: 'Bad', internalDeadline: '2026-12-01', deadline: '2026-11-15' }).expect(400);
    const late = (await add('principal', 'research-calls', { agency: 'DBT', title: 'Closed call', internalDeadline: '2026-10-01', deadline: '2026-10-10' }).expect(201)).body;
    expect((await list('principal', 'research-calls', '?f.due=next_14_days')).rows.map((r: { title: string }) => r.title)).toEqual(['CRG 2026']);
    const prop = (await add('teacher', 'research-proposals', { title: 'Sleep and stress', kind: 'research', callId: call.id, ethicsRequired: true, fundingSought: 1200000 }).expect(201)).body;
    expect(prop).toMatchObject({ status: 'draft', ethicsStatus: 'pending', fundingSought: 1200000, piUserIdName: t.teacher.fullName });
    const lateProp = (await add('teacher', 'research-proposals', { title: 'Too late', kind: 'research', callId: late.id }).expect(201)).body;
    expect((await act('teacher', 'research-proposals', 'submit', [lateProp.id]).expect(200)).body.rows[0]).toMatchObject({ ok: false, code: 'CALL_CLOSED' });
    await act('teacher', 'research-proposals', 'submit', [prop.id]).expect(200);
    await edit('teacher', 'research-proposals', prop.id, { title: 'Changed' }).expect(400); // only drafts change
    expect((await act('principal', 'research-proposals', 'approve', [prop.id]).expect(200)).body.rows[0]).toMatchObject({ ok: false }); // ethics first
    await add('principal', 'research-ethics', { committee: 'iec', protocolNo: 'IEC/2026/014', title: 'Sleep and stress', status: 'approved', approvedOn: '2026-10-05' }).expect(400); // validity needed
    const eth = (await add('principal', 'research-ethics', { committee: 'iec', protocolNo: 'IEC/2026/014', title: 'Sleep and stress', proposalId: prop.id, status: 'approved', approvedOn: '2026-10-05', expiresOn: '2026-12-01' }).expect(201)).body;
    expect(eth.validity).toBe('expiring');
    await add('principal', 'research-ethics', { committee: 'iec', protocolNo: 'IEC/2026/014', title: 'Dup' }).expect(409);
    const approved = (await act('principal', 'research-proposals', 'approve', [prop.id], { startsOn: '2026-11-01' }).expect(200)).body;
    expect(approved.succeeded).toBe(1);
    expect((await list('principal', 'research-calls')).rows.find((r: { id: string }) => r.id === call.id).proposals).toBe(1);
    expect((await list('principal', 'research-projects', '?q=Sleep')).rows[0]).toMatchObject({ status: 'active', startsOn: '2026-11-01' });
  });

  let grantId: string;
  it('keeps grants with spending and utilisation certificates filled from the expenses', async () => {
    const proj = (await add('principal', 'research-projects', { title: 'Crop yield', kind: 'research', piUserId: t.teacher.id, startsOn: '2026-07-01' }).expect(201)).body;
    expect(proj.code).toMatch(/PRJ/);
    await edit('principal', 'research-projects', proj.id, { status: 'completed' }).expect(400);
    const g = (await add('principal', 'research-grants', { projectId: proj.id, agency: 'DST-SERB', sanctionRef: 'CRG/1', sanctioned: 2500000, startsOn: '2026-07-01', endsOn: '2029-06-30' }).expect(201)).body;
    grantId = g.id;
    await http().post(`/v1/research/grants/${g.id}/expenses`).set(as('principal')).send({ head: 'Equipment', amountPaise: 50000000, spentOn: '2026-08-10' }).expect(201);
    await http().post(`/v1/research/grants/${g.id}/expenses`).set(as('principal')).send({ head: 'Travel', amountPaise: 2000000, spentOn: '2026-10-01' }).expect(201);
    expect((await list('principal', 'research-grants')).rows[0]).toMatchObject({ spent: 520000, balance: 1980000, ucs: 0 });
    await edit('principal', 'research-grants', g.id, { sanctioned: 100000 }).expect(400); // below what was spent
    await add('principal', 'grant-ucs', { grantId: g.id, periodFrom: '2026-06-01', periodTo: '2026-09-30' }).expect(400); // outside the grant
    const uc = (await add('principal', 'grant-ucs', { grantId: g.id, periodFrom: '2026-07-01', periodTo: '2026-09-30' }).expect(201)).body;
    expect((await act('principal', 'grant-ucs', 'fill', [uc.id]).expect(200)).body.rows[0].ok).toBe(true);
    expect((await list('principal', 'grant-ucs')).rows[0]).toMatchObject({ utilised: 500000, grantName: 'DST-SERB (CRG/1)' });
    await edit('principal', 'grant-ucs', uc.id, { status: 'submitted' }).expect(400);
    await edit('principal', 'grant-ucs', uc.id, { status: 'submitted', submittedOn: '2026-10-10', reference: 'UC/1' }).expect(200);
    expect((await act('principal', 'grant-ucs', 'fill', [uc.id]).expect(200)).body.rows[0].ok).toBe(false);
  });

  it('shares consultancy revenue, counts functional MoUs, and feeds NAAC and NIRF', async () => {
    const c = (await add('principal', 'research-consultancies', { title: 'Water testing', client: 'HDMC', kind: 'testing', leadUserId: t.teacher.id, startsOn: '2026-07-05', contract: 200000, received: 150000, institutionSharePct: 40 }).expect(201)).body;
    expect(c).toMatchObject({ institutionShare: 60000, consultantShare: 90000 });
    await add('principal', 'research-consultancies', { title: 'Training', client: 'X', kind: 'testing', trainees: 20 }).expect(400);
    await add('principal', 'research-consultancies', { title: 'MDP on GST', client: 'KCCI', kind: 'corporate_training', startsOn: '2026-08-01', received: 50000, trainees: 30 }).expect(201);
    const mou = (await add('principal', 'research-mous', { partner: 'Infosys Ltd', partnerKind: 'industry', signedOn: '2025-08-01', validUntil: '2028-07-31' }).expect(201)).body;
    await add('principal', 'research-mous', { partner: 'Bad', partnerKind: 'industry', signedOn: '2025-08-01', validUntil: '2024-07-31' }).expect(400);
    await add('principal', 'research-mou-activities', { mouId: mou.id, title: 'Internship for 12 students', kind: 'internship', heldOn: '2025-07-01' }).expect(400); // before signing
    await add('principal', 'research-mou-activities', { mouId: mou.id, title: 'Internship for 12 students', kind: 'internship', heldOn: '2026-07-01', participants: 12 }).expect(201);
    expect((await list('principal', 'research-mous', '?f.validity=current')).rows[0]).toMatchObject({ partner: 'Infosys Ltd', activities: 1 });
    // NAAC (autonomous) reads consultancy and MoUs from the registers.
    const o = (await http().get('/v1/accreditation/naac-autonomous/overview').set(as('principal')).expect(200)).body;
    const m = (code: string) => o.metrics.find((x: { code: string }) => x.code === code);
    expect(m('3.5.2').value).toBe(2);
    expect(m('3.7.2').value).toBe(1);
    const n = (await http().get('/v1/accreditation/nirf-engineering/overview').set(as('principal')).expect(200)).body;
    expect(n.metrics.find((x: { code: string }) => x.code === 'RP.FPPP').combinedInputs.consultancy).toBeGreaterThan(0);
    const rp = (await http().get('/v1/research/reports/nirf-rp?toYear=2026').set(as('principal')).expect(200)).body;
    expect(rp.years.at(-1)).toMatchObject({ fy: '2026-27', sponsoredProjects: 1, agencies: 1, sponsoredRupees: 2500000, consultancyProjects: 1, clients: 1, consultancyRupees: 150000, trainingPrograms: 1, trainees: 30, trainingRupees: 50000 });
    const wb = readXlsxSheets((await http().get('/v1/research/reports/nirf-rp.xlsx?toYear=2026').set(as('principal')).buffer(true).parse(binary).expect(200)).body);
    expect(wb.map((s) => s.name)).toEqual(['Sponsored Research Details', 'Consultancy Project Details', 'Executive Development Programs', 'Publications and IPR']);
    const c3 = (await http().get('/v1/research/reports/naac-c3?cycle=2026-27').set(as('principal')).expect(200)).body;
    expect(c3.years).toEqual(['2022-23', '2023-24', '2024-25', '2025-26', '2026-27']);
    expect(c3.rows.find((r: { key: string }) => r.key === 'consultancy_lakhs').values.at(-1)).toBe(2);
    await http().get('/v1/research/reports/naac-c3').set(as('teacher')).expect(403);
  });

  it('runs seed money, recognitions, scholars with doctoral committee meetings and coursework', async () => {
    const s = (await add('principal', 'research-seed-grants', { title: 'Pilot study', applicantUserId: t.teacher.id, requested: 100000, status: 'sanctioned' }).expect(400)).body;
    expect(s.message).toMatch(/sanction/);
    const seed = (await add('principal', 'research-seed-grants', { title: 'Pilot study', applicantUserId: t.teacher.id, requested: 100000, sanctioned: 80000, sanctionedOn: '2026-08-01', status: 'sanctioned' }).expect(201)).body;
    await edit('principal', 'research-seed-grants', seed.id, { utilised: 90000 }).expect(400);
    await edit('principal', 'research-seed-grants', seed.id, { status: 'completed' }).expect(400);
    await edit('principal', 'research-seed-grants', seed.id, { utilised: 75000, reportSubmittedOn: '2026-10-01', status: 'completed' }).expect(200);
    await add('teacher', 'research-recognitions', { kind: 'fellowship', title: 'Visiting fellowship', body: 'ICSSR', level: 'national', receivedOn: '2026-09-01' }).expect(201);
    await add('teacher', 'research-recognitions', { kind: 'award', title: 'For someone else', level: 'state', receivedOn: '2026-09-01', userId: t.teacher2.id }).expect(400);
    expect((await list('teacher2', 'research-recognitions')).total).toBe(0);
    const o = (await http().get('/v1/accreditation/naac-autonomous/overview').set(as('principal')).expect(200)).body;
    expect(o.metrics.find((x: { code: string }) => x.code === '3.1.2').years.at(-1).value).toBe(0.8);

    const sch = (await add('principal', 'research-scholars', { fullName: 'Meera Patil', programme: 'phd', supervisorUserId: t.teacher.id, enrolledOn: '2025-08-01' }).expect(201)).body;
    expect((await list('principal', 'research-scholars', '?f.dcDue=never_met')).total).toBe(1);
    await add('teacher2', 'scholar-dc-meetings', { scholarId: sch.id, heldOn: '2026-02-01', progress: 'satisfactory' }).expect(400); // not the supervisor
    await add('teacher', 'scholar-dc-meetings', { scholarId: sch.id, heldOn: '2026-02-01', progress: 'satisfactory', nextDueOn: '2026-01-01' }).expect(400);
    await add('teacher', 'scholar-dc-meetings', { scholarId: sch.id, heldOn: '2026-02-01', progress: 'satisfactory', nextDueOn: '2026-08-01' }).expect(201);
    expect((await list('principal', 'research-scholars', '?f.dcDue=overdue')).rows[0]).toMatchObject({ fullName: 'Meera Patil', dcMeetings: 1, nextDcDue: '2026-08-01' });
    await add('principal', 'scholar-coursework', { scholarId: sch.id, course: 'Research methodology', credits: 4, status: 'passed' }).expect(400);
    await add('principal', 'scholar-coursework', { scholarId: sch.id, course: 'Research methodology', credits: 4, status: 'passed', grade: 'A', completedOn: '2026-01-10' }).expect(201);
    await add('principal', 'scholar-coursework', { scholarId: sch.id, course: 'Research and publication ethics', credits: 2 }).expect(201);
    expect((await list('principal', 'research-scholars')).rows[0].courseworkDone).toBe('1 / 2');
  });

  it('books instruments without overlaps and charges internal and external rates', async () => {
    const eq = (await add('principal', 'research-equipment', { code: 'CIF-XRD-01', name: 'X-ray diffractometer', internalRate: 500, externalRate: 2500 }).expect(201)).body;
    const dup = (await http().post(`/v1/records/research-equipment/${eq.id}/duplicate`).set(as('principal')).expect(201)).body;
    expect(dup).toMatchObject({ code: 'CIF-XRD-01-2', name: 'X-ray diffractometer (copy)' });
    const b1 = (await add('teacher', 'research-equipment-usage', { equipmentId: eq.id, userKind: 'internal', userId: t.teacher.id, purpose: 'Phase analysis', startsAt: '2026-10-21 10:00', endsAt: '2026-10-21 13:00' }).expect(201)).body;
    expect(b1).toMatchObject({ hours: 3, rate: 500, amount: 1500, startsAt: '2026-10-21 10:00' });
    expect((await add('principal', 'research-equipment-usage', { equipmentId: eq.id, userKind: 'external', externalName: 'Dr. R. Kulkarni', startsAt: '2026-10-21 12:00', endsAt: '2026-10-21 14:00' }).expect(400)).body.message).toMatch(/already booked/);
    await add('principal', 'research-equipment-usage', { equipmentId: eq.id, userKind: 'external', startsAt: '2026-10-21 14:00', endsAt: '2026-10-21 16:00' }).expect(400); // name needed
    const b2 = (await add('principal', 'research-equipment-usage', { equipmentId: eq.id, userKind: 'external', externalName: 'Dr. R. Kulkarni', externalOrg: 'KLE', startsAt: '2026-10-21 13:00', endsAt: '2026-10-21 15:30' }).expect(201)).body;
    expect(b2.amount).toBe(6250);
    await edit('principal', 'research-equipment-usage', b2.id, { status: 'billed' }).expect(400);
    await edit('principal', 'research-equipment-usage', b2.id, { status: 'billed', invoiceRef: 'INV-77' }).expect(200);
    await edit('principal', 'research-equipment', eq.id, { status: 'under_repair' }).expect(200);
    await add('principal', 'research-equipment-usage', { equipmentId: eq.id, userKind: 'internal', userId: t.teacher.id, startsAt: '2026-10-22 10:00', endsAt: '2026-10-22 11:00' }).expect(400);
    expect((await list('principal', 'research-equipment', '?q=CIF-XRD-01&sort=name:asc')).rows[0]).toMatchObject({ hoursThisYear: 5.5, revenueThisYear: 7750 });
    expect((await list('teacher2', 'research-equipment-usage')).total).toBe(0);
  });

  it('imports a register from its template, exports it, and deletes to the bin and back with linked rows', async () => {
    const csv = 'Partner,Partner kind,Signed on,Valid until\r\nKLE University,Academic,01-06-2024,31-05-2027\r\nCanara Bank,industry,2026-01-15,\r\nBad row,Unknown,2026-01-01,\r\n';
    const check = (await http().post('/v1/records/research-mous/import').set(as('principal')).attach('file', Buffer.from(csv), 'mous.csv').expect(200)).body;
    expect(check.totals).toMatchObject({ rows: 3, created: 2, error: 1 });
    const done = (await http().post(`/v1/records/research-mous/import/${check.id}/commit`).set(as('principal')).send({ skipErrors: true }).expect(200)).body;
    expect(done.committed).toBe(true);
    const mous = await list('principal', 'research-mous', '?sort=partner:asc');
    expect(mous.rows.map((r: { partner: string }) => r.partner)).toEqual(['Canara Bank', 'Infosys Ltd', 'KLE University']);
    const x = await http().get('/v1/records/research-mous/export?format=csv&sort=partner:asc').set(as('principal')).expect(200);
    expect(x.text.split('\n')[0]).toContain('Partner');
    expect(x.text).toContain('KLE University');
    const xl = readXlsx((await http().get('/v1/records/research-consultancies/export?format=xlsx').set(as('principal')).buffer(true).parse(binary).expect(200)).body);
    expect(xl[0]).toEqual(expect.arrayContaining(['Project or programme', 'Institution share (INR)']));

    const infosys = mous.rows.find((r: { partner: string }) => r.partner === 'Infosys Ltd');
    const del = (await http().delete(`/v1/records/research-mous/${infosys.id}`).set(as('principal')).expect(200)).body;
    expect(del.rows).toBe(2); // the MoU and its activity
    expect((await list('principal', 'research-mou-activities')).total).toBe(0);
    await http().post(`/v1/recycle-bin/${del.binId}/restore`).set(as('principal')).expect(200);
    expect((await list('principal', 'research-mou-activities')).total).toBe(1);
    // Bulk edit and another institution's view.
    const bulk = (await http().post('/v1/records/research-mous/bulk').set(as('principal')).send({ op: 'update', target: { all: true, query: {} }, fields: { status: 'terminated' } }).expect(200)).body;
    expect(bulk.succeeded).toBe(3);
    expect((await list('outsider', 'research-mous')).total).toBe(0);
    expect((await list('outsider', 'research-publications')).total).toBe(0);
    await http().get(`/v1/records/research-grants/${grantId}`).set(as('outsider')).expect(404);
  });
});
