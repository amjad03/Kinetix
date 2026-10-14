import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { framework, metricsOf } from '../src/accreditation/frameworks/index.js';
import { scoreOf } from '../src/accreditation/engine.js';
import { readXlsxSheets } from '../src/common/xlsx.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

const marks = (key: string) => Object.fromEntries(framework(key)!.criteria.map((c) => [c.id, c.weight]));

describe('NBA, AICTE, UGC and CBSE catalogues', () => {
  it('weighs NBA Tier-I and management SARs to 1000 marks criterion by criterion', () => {
    expect(marks('nba-ug-eng-t1')).toEqual({ 1: 50, 2: 100, 3: 175, 4: 100, 5: 200, 6: 80, 7: 75, 8: 50, 9: 50, 10: 120 });
    expect(marks('nba-pg-mgmt')).toEqual({ 1: 50, 2: 100, 3: 100, 4: 125, 5: 100, 6: 250, 7: 100, 8: 75, 9: 50, 10: 50 });
    for (const k of ['nba-ug-eng-t1', 'nba-pg-mgmt', 'nba-mba', 'nba-pgdm']) expect(metricsOf(framework(k)!).reduce((a, m) => a + m.weight, 0), k).toBe(1000);
    // Programme-level criteria carry 780 marks at Tier-I, institution-level 220.
    expect([1, 2, 3, 4, 5, 6, 7].reduce((a, c) => a + marks('nba-ug-eng-t1')[c], 0)).toBe(780);
    for (const k of ['aicte', 'ugc', 'cbse']) {
      const f = framework(k)!;
      expect(f.scoring, k).toBe('none');
      expect(f.body, k).toBe(k);
    }
    expect(framework('cbse')!.criteria.map((c) => c.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('scores management faculty with the 20% Ph.D. pre-qualifier and Tier-I first-year SFR bands', () => {
    const mba = framework('nba-pg-mgmt')!;
    const phd = metricsOf(mba).find((m) => m.code === '6.3')!;
    expect(scoreOf(mba, phd, 15, {}, null, 30)).toBe(0);
    expect(scoreOf(mba, phd, 30, {}, null, 30)).toBe(15);
    const t1 = framework('nba-ug-eng-t1')!;
    const fy = metricsOf(t1).find((m) => m.code === '8.1')!;
    expect(scoreOf(t1, fy, 18, {}, null, 5)).toBe(5);
    expect(scoreOf(t1, fy, 24, {}, null, 5)).toBe(3);
    expect(scoreOf(t1, fy, 30, {}, null, 5)).toBe(0);
  });
});

describe('regulatory returns, the evidence repository and the IQAC registers', () => {
  const owner = ownerPool();
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tok: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tok[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const bin = async (who: string, url: string) => (await http().get(url).set(as(who)).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200)).body as Buffer;
  const sheets = (b: Buffer) => readXlsxSheets(b);
  const sheet = (b: Buffer, name: string) => sheets(b).find((s) => s.name === name)?.rows ?? null;
  const add = (who: string, e: string, body: object) => http().post(`/v1/records/${e}`).set(as(who)).send(body);
  const edit = (who: string, e: string, id: string, body: object) => http().patch(`/v1/records/${e}/${id}`).set(as(who)).send(body);

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    tok.principal = await login(t.slug, t.principal.email!);
    tok.teacher = await login(t.slug, t.teacher.email!);
    tok.outsider = await login(other.slug, other.principal.email!);
    const q = (s: string, v: unknown[] = []) => owner.query(s, v);
    const [prof] = (await q(`insert into designations (tenant_id, name) values ($1, 'Professor') returning id`, [t.tenantId])).rows;
    await q(`insert into staff_profiles (tenant_id, user_id, employee_code, employment_type, date_of_joining, gender, designation_id) values ($1, $2, 'E1', 'permanent', '2012-07-01', 'female', $4), ($1, $3, 'E2', 'permanent', '2021-06-15', 'male', null)`, [t.tenantId, t.teacher.id, t.teacher2.id, prof.id]);
    await q(`update students set enrolled_on = '2026-08-01' where tenant_id = $1`, [t.tenantId]);
    await q(`insert into institution_profiles (tenant_id, legal_name, affiliation_no, email) values ($1, 'Sunrise Public School', '830123', 'office@sunrise.in')`, [t.tenantId]);
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('exports NBA Tier-I and management SARs with their year-by-year tables', async () => {
    const t1 = await bin('principal', '/v1/accreditation/nba-ug-eng-t1/export.xlsx?tier=1');
    const n1 = sheets(t1).map((s) => s.name);
    for (const s of ['Summary', 'Criterion 1', 'Criterion 10', 'Table 4.1', 'Table 5.1', 'Table 8.1', 'CO-PO attainment', 'CO-PO matrix']) expect(n1, s).toContain(s);
    expect(sheet(t1, 'Table 5.1')![3]).toEqual(['Item', 'CAY (2026-27)', 'CAYm1 (2025-26)', 'CAYm2 (2024-25)']);
    await http().get('/v1/accreditation/nba-ug-eng-t1/export.xlsx?tier=2').set(as('principal')).expect(400);
    const mba = await bin('principal', '/v1/accreditation/nba-mba/export.xlsx');
    for (const s of ['Criterion 6', 'Table 5.1', 'Table 6.1', 'Table 7.2']) expect(sheets(mba).map((x) => x.name), s).toContain(s);
    await http().get('/v1/accreditation/nba-pg-mgmt/export.xlsx?tier=1').set(as('principal')).expect(400);
    const r = (await http().get('/v1/accreditation/nba-pg-mgmt/readiness').set(as('principal')).expect(200)).body;
    expect(r.framework).toMatchObject({ key: 'nba-pg-mgmt', body: 'nba', scoring: 'nba' });
  });

  it('lays out the AICTE data with the norms check, the UGC disclosure checklist and the CBSE Appendix IX', async () => {
    const ai = await bin('principal', '/v1/accreditation/aicte/export.xlsx');
    expect(sheets(ai).map((s) => s.name)).toEqual(['Institution', 'Norms check', '1 Institution and applicant', '2 Land and buildings', '3 Programmes and intake', '4 Faculty', '5 Facilities', '6 Committees and compliance', '7 Finance and disclosure', 'To complete by hand']);
    const norms = sheet(ai, 'Norms check')!;
    expect(norms[3]).toEqual(['Norm', 'Required', 'Available', 'Status']);
    // Three students need one teacher at 1 : 20; two teachers are in position.
    expect(norms[4]).toEqual(['Regular faculty', '1', '2', 'Meets the norm']);
    const fac = sheet(ai, '4 Faculty')!;
    expect(fac.some((row) => row[0] === 'AICTE-4.2')).toBe(true);

    const ugc = await bin('principal', '/v1/accreditation/ugc/export.xlsx');
    expect(sheets(ugc).map((s) => s.name).slice(0, 2)).toEqual(['Institution', 'Disclosure checklist']);
    expect(sheet(ugc, 'Disclosure checklist')![3]).toEqual(['Section', 'Item', 'Ready', 'Evidence files']);

    // CBSE results come from the rows entered for each year.
    await http().put('/v1/accreditation/cbse/metrics/CBSE-C.2').set(as('principal')).send({ year: '2026-27', rows: [['2026', '120', '118', '98.3', '']] }).expect(200);
    await http().put('/v1/accreditation/cbse/metrics/CBSE-B.1').set(as('principal')).send({ options: [0, 1, 4, 5] }).expect(200);
    const o = (await http().get('/v1/accreditation/cbse/overview').set(as('principal')).expect(200)).body;
    expect(o.metrics.find((m: { code: string }) => m.code === 'CBSE-C.2').years.at(-1).value).toBeCloseTo(98.33, 1);
    const cb = await bin('principal', '/v1/accreditation/cbse/export.xlsx');
    const ap = sheet(cb, 'Appendix IX disclosure')!;
    expect(ap[0]).toEqual(['Appendix IX: Mandatory public disclosure']);
    expect(ap.find((r) => r[1] === 'Affiliation no. (if applicable)')![2]).toBe('830123');
    expect(ap.find((r) => r[1] === 'Copy of the valid building safety certificate')![2]).toBe('Yes');
    expect(ap.find((r) => r[0] === '2026')).toEqual(['2026', '120', '118', '98.3']);
    for (const s of ['A General information', 'D Staff (teaching)', 'F OASIS annual data', 'To complete by hand']) expect(sheets(cb).map((x) => x.name), s).toContain(s);
    await http().get('/v1/accreditation/cbse/export.xlsx').set(as('teacher')).expect(403);
  });

  it('keeps evidence with tags and a validity date, and finds what is expiring', async () => {
    const pdf = (name: string) => ({ filename: name, contentType: 'application/pdf', contentBase64: Buffer.from(`%PDF-1.4 ${name}`).toString('base64') });
    const e1 = (await http().post('/v1/accreditation/cbse/metrics/CBSE-B.1/evidence').set(as('principal')).send({ title: 'Fire safety certificate', file: pdf('fire.pdf'), tags: ['Safety', 'certificate'], validUntil: '2026-11-15' }).expect(201)).body;
    expect(e1).toMatchObject({ tags: ['safety', 'certificate'], validUntil: '2026-11-15' });
    await http().post('/v1/accreditation/cbse/metrics/CBSE-B.1/evidence').set(as('principal')).send({ title: 'Building safety certificate', url: 'https://example.org/b.pdf', tags: ['safety'], validUntil: '2028-03-31' }).expect(201);
    await http().post('/v1/accreditation/cbse/metrics/CBSE-A.1/evidence').set(as('principal')).send({ title: 'Affiliation letter', url: 'https://example.org/a.pdf' }).expect(201);
    const all = (await http().get('/v1/accreditation/cbse/evidence-repository').set(as('principal')).expect(200)).body;
    expect(all.rows).toHaveLength(3);
    expect(all.tags).toEqual(['certificate', 'safety']);
    expect((await http().get('/v1/accreditation/cbse/evidence-repository?tag=safety').set(as('principal')).expect(200)).body.rows).toHaveLength(2);
    const soon = (await http().get('/v1/accreditation/cbse/evidence-repository?expiring=60').set(as('principal')).expect(200)).body.rows;
    expect(soon.map((r: { title: string }) => r.title)).toEqual(['Fire safety certificate']);
    await http().put(`/v1/accreditation/evidence/${e1.id}`).set(as('principal')).send({ validUntil: '2026-10-01', tags: ['safety'] }).expect(200);
    const after = (await http().get('/v1/accreditation/cbse/evidence-repository?q=fire').set(as('principal')).expect(200)).body.rows[0];
    expect(after).toMatchObject({ expired: true, tags: ['safety'], metric: 'CBSE-B.1' });
    await http().put(`/v1/accreditation/evidence/${e1.id}`).set(as('teacher')).send({ tags: [] }).expect(403);
    expect((await http().get('/v1/accreditation/cbse/evidence-repository').set(as('outsider')).expect(200)).body.rows).toHaveLength(0);
  });

  it('keeps the IQAC committee, meetings, action points, initiatives and AQAR submissions as lists', async () => {
    await add('principal', 'iqac-members', { name: 'Dr. S. Hegde', category: 'chairperson', termFrom: '2025-06-01' }).expect(201);
    await add('principal', 'iqac-members', { name: 'Another head', category: 'chairperson', termFrom: '2026-06-01' }).expect(400);
    await add('principal', 'iqac-members', { name: 'Prof. K. Rao', category: 'coordinator', termFrom: '2025-06-01', termTo: '2025-01-01' }).expect(400);
    await add('principal', 'iqac-members', { name: 'Prof. K. Rao', category: 'coordinator', termFrom: '2025-06-01', userId: t.teacher.id }).expect(201);
    await add('principal', 'iqac-members', { name: 'Ms. Alumna', category: 'alumni', termFrom: '2025-06-01', organisation: 'Infosys' }).expect(201);
    const csv = 'Name,Category,Term from\r\nMr. Employer,Employer,2025-06-01\r\nDr. Expert,External expert,2025-06-01\r\n';
    const check = (await http().post('/v1/records/iqac-members/import').set(as('principal')).attach('file', Buffer.from(csv), 'm.csv').expect(200)).body;
    expect(check.totals).toMatchObject({ created: 2, error: 0 });
    await http().post(`/v1/records/iqac-members/import/${check.id}/commit`).set(as('principal')).send({}).expect(200);

    const m = (await add('principal', 'iqac-meetings', { title: 'First IQAC meeting 2026-27', meetingOn: '2026-07-15', status: 'held', present: 9 }).expect(201)).body;
    await edit('principal', 'iqac-meetings', m.id, { status: 'minutes_approved' }).expect(400);
    await edit('principal', 'iqac-meetings', m.id, { minutes: 'AQAR plan adopted', status: 'minutes_approved' }).expect(200);
    await add('principal', 'iqac-meetings', { title: 'Second IQAC meeting', meetingOn: '2026-11-20', status: 'scheduled' }).expect(201);

    const a1 = (await add('principal', 'iqac-actions', { meetingId: m.id, action: 'Collect alumni feedback', criterion: '1', priority: 'high', dueOn: '2026-09-30' }).expect(201)).body;
    const a2 = (await add('principal', 'iqac-actions', { meetingId: m.id, action: 'Academic audit of all departments', criterion: '6', dueOn: '2026-12-15' }).expect(201)).body;
    expect((await http().get('/v1/records/iqac-actions?f.overdue=yes').set(as('principal')).expect(200)).body.rows.map((r: { id: string }) => r.id)).toEqual([a1.id]);
    await edit('principal', 'iqac-actions', a1.id, { status: 'done' }).expect(400);
    const bulk = (await http().post('/v1/records/iqac-actions/bulk').set(as('principal')).send({ op: 'update', target: { ids: [a1.id, a2.id] }, fields: { ownerUserId: t.teacher.id } }).expect(200)).body;
    expect(bulk.succeeded).toBe(2);
    await edit('principal', 'iqac-actions', a1.id, { status: 'done', actionTaken: 'Alumni survey run in August' }).expect(200);
    expect((await owner.query('select closed_at is not null as closed from iqac_actions where id = $1', [a1.id])).rows[0].closed).toBe(true);
    // The old endpoint keeps the same rule.
    await http().put(`/v1/accreditation/iqac/actions/${a2.id}`).set(as('principal')).send({ status: 'done' }).expect(400);

    await add('principal', 'iqac-initiatives', { title: 'Academic and administrative audit', kind: 'audit', criterion: '6', plannedOn: '2026-11-15' }).expect(201);
    const done = (await add('principal', 'iqac-initiatives', { title: 'NIRF data workshop', kind: 'workshop', status: 'done', plannedOn: '2026-08-10' }).expect(400)).body;
    expect(done.message).toMatch(/date/);
    await add('principal', 'iqac-initiatives', { title: 'NIRF data workshop', kind: 'workshop', status: 'done', plannedOn: '2026-08-10', heldOn: '2026-08-12', participants: 40 }).expect(201);
    await add('principal', 'iqac-feedback', { cycle: '2026-27', stakeholder: 'students', summary: 'More laboratory hours', status: 'action_taken' }).expect(400);
    await add('principal', 'iqac-feedback', { cycle: '2026-27', stakeholder: 'students', summary: 'More laboratory hours', actionTaken: 'Two hours added', status: 'action_taken' }).expect(201);
    await add('principal', 'iqac-aqar', { year: '2025-26', dueOn: '2026-12-31', status: 'submitted' }).expect(400);
    await add('principal', 'iqac-aqar', { year: '2025-26', dueOn: '2026-12-31' }).expect(201);
    await add('principal', 'iqac-aqar', { year: '2025-26' }).expect(409);
    await add('principal', 'iqac-practices', { kind: 'best_practice', title: 'Mentoring circles', objectives: 'Reduce dropouts' }).expect(201);

    const s = (await http().get('/v1/accreditation/iqac/summary?cycle=2026-27').set(as('principal')).expect(200)).body;
    expect(s.composition).toMatchObject({ total: 5, byCategory: { chairperson: 1, coordinator: 1, alumni: 1, employer: 1, external_expert: 1 } });
    expect(s.composition.missing).toEqual(['management', 'teacher', 'administrative', 'student', 'local_society']);
    expect(s.meetings).toMatchObject({ held: 1, scheduled: 1, approved: 1, norm: 4, short: 2 });
    expect(s.actions).toMatchObject({ open: 1, overdue: 0, done: 1, total: 2 });
    expect(s.initiatives).toEqual({ planned: 1, done: 1 });
    expect(s.feedback.stakeholders.find((x: { stakeholder: string }) => x.stakeholder === 'students').status).toBe('action_taken');
    expect(s.aqar[0]).toMatchObject({ year: '2025-26', status: 'preparing' });

    const atr = await bin('principal', '/v1/accreditation/iqac/atr.xlsx?cycle=2026-27');
    expect(sheets(atr).map((x) => x.name)).toEqual(['Feedback and action taken', 'IQAC actions', 'IQAC composition', 'Quality initiatives']);
    expect(sheet(atr, 'IQAC actions')![1].slice(0, 9)).toEqual(['First IQAC meeting 2026-27', '2026-07-15', 'Collect alumni feedback', t.teacher.fullName, '', '1', 'high', '2026-09-30', 'done']);
    const o = (await http().get('/v1/accreditation/naac/overview').set(as('principal')).expect(200)).body;
    expect(o.metrics.find((x: { code: string }) => x.code === '6.5.1').autoNarrative).toContain('1 of 2 action points completed; 1 quality initiatives held; 5 members');

    await http().get('/v1/records/iqac-members').set(as('teacher')).expect(403);
    expect((await http().get('/v1/records/iqac-meetings').set(as('outsider')).expect(200)).body.total).toBe(0);
    await http().get('/v1/accreditation/iqac/summary').set(as('teacher')).expect(403);
  });
});
