import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { bloomNumber, checkCo, leadingVerb } from '../src/obe/bloom.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('Bloom verb check', () => {
  it('reads the leading verb and checks it against the level', () => {
    expect(leadingVerb('CO1: Students will be able to apply ratio analysis')).toBe('apply');
    expect(leadingVerb('On completion of the course, the student will be able to design a ledger')).toBe('design');
    expect(bloomNumber('L3')).toBe(3);
    expect(bloomNumber('Analyze')).toBe(4);
    expect(bloomNumber('K6')).toBe(6);
    expect(bloomNumber('')).toBeNull();
    expect(checkCo('Prepare company accounts', 'Apply')).toMatchObject({ verb: 'prepare', ok: true });
    expect(checkCo('Understand the ratios', 'L2')).toMatchObject({ ok: false, message: expect.stringContaining('cannot be measured') });
    expect(checkCo('Designs a cash budget', 'Remember')).toMatchObject({ ok: false, levels: [6], message: '"designs" is a Create verb, not Remember' });
    expect(checkCo('Florp the widgets')).toMatchObject({ ok: false, message: expect.stringContaining('not an action verb') });
    expect(checkCo('Compare two balance sheets')).toMatchObject({ ok: true, levels: [4] });
  });
});

describe('OBE depth: PEO-mission, versions, targets, student-wise attainment, trend, CQI actions', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tok: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const as = (who: string) => ({ authorization: `Bearer ${tok[who]}` });
  const base = () => `/v1/obe/programs/${t.program.id}`;
  const year = () => t.section.academicYearId;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(new FixedClock(new Date('2026-11-01T05:00:00Z')));
    tok.teacher = await login(t.slug, t.teacher.email!);
    tok.teacher2 = await login(t.slug, t.teacher2.email!);
    tok.principal = await login(t.slug, t.principal.email!);
    tok.student = await login(t.slug, t.studentUser.email!);
    tok.outsider = await login(other.slug, other.principal.email!);
    const db = drizzle(owner, { schema: s });
    const [q] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Quality Officer', email: 'iqac@obe-depth.in', passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: q.id, role: 'quality_officer' });
    tok.quality = await login(t.slug, 'iqac@obe-depth.in');
    const add = async (kind: string, code: string, statement = `Statement of ${code}`) => (await http().post(`${base()}/outcomes`).set(as('principal')).send({ kind, code, statement }).expect(201)).body.id as string;
    ids.v1 = await add('vision', 'V1', 'A centre of excellence in commerce education');
    ids.m1 = await add('mission', 'M1', 'Quality commerce education');
    ids.m2 = await add('mission', 'M2', 'Industry readiness');
    ids.peo1 = await add('peo', 'PEO1', 'Graduates practise accountancy with integrity');
    ids.peo2 = await add('peo', 'PEO2', 'Graduates pursue higher studies');
    ids.po1 = await add('po', 'PO1');
    ids.po2 = await add('po', 'PO2');
    ids.pso1 = await add('pso', 'PSO1');
  }, 60000);
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('gives OBE staff, the quality officer among them, the programmes, years and courses to pick from', async () => {
    const r = (await http().get('/v1/obe/structure').set(as('quality')).expect(200)).body;
    expect(r.programs.map((p: { id: string }) => p.id)).toContain(t.program.id);
    expect(r.academicYears.map((y: { id: string }) => y.id)).toContain(year());
    expect(Array.isArray(r.subjects)).toBe(true);
    await http().get('/v1/admin/structure').set(as('quality')).expect(403);
    await http().get('/v1/obe/structure').set(as('student')).expect(403);
  });

  it('keeps the PEO-mission matrix with justification, every PEO serving the mission', async () => {
    const pm = `${base()}/peo-mission`;
    await http().put(pm).set(as('principal')).send({ cells: [{ peoId: ids.peo1, missionId: ids.m1, strength: 3 }] }).expect(400); // PEO2 left out
    await http().put(pm).set(as('principal')).send({ cells: [{ peoId: ids.peo1, missionId: ids.po1, strength: 3 }] }).expect(400);
    await http().put(pm).set(as('teacher')).send({ cells: [] }).expect(403);
    const cells = [{ peoId: ids.peo1, missionId: ids.m1, strength: 3, justification: 'Integrity is part of quality education' }, { peoId: ids.peo2, missionId: ids.m1, strength: 2 }, { peoId: ids.peo2, missionId: ids.m2, strength: 0 }];
    expect((await http().put(pm).set(as('principal')).send({ cells }).expect(200)).body).toEqual({ cells: 2 });
    const g = (await http().get(pm).set(as('teacher')).expect(200)).body;
    expect(g.peos.map((x: { code: string }) => x.code)).toEqual(['PEO1', 'PEO2']);
    expect(g.missions.map((x: { code: string }) => x.code)).toEqual(['M1', 'M2']);
    expect(g.cells).toEqual(expect.arrayContaining([{ peoId: ids.peo1, missionId: ids.m1, strength: 3, justification: 'Integrity is part of quality education' }]));
    // The NBA criterion 1 narrative reads it.
    const o = (await http().get('/v1/accreditation/nba-ug-eng-t1/overview').set(as('principal')).expect(200)).body;
    expect(o.metrics.find((m: { code: string }) => m.code === '1.5').autoNarrative).toContain('PEO1 serves M1 (3)');
  });

  it('publishes versions of the statements and shows what changed since the last one', async () => {
    const v = `${base()}/versions`;
    const v1 = (await http().post(v).set(as('principal')).send({ effectiveFrom: '2026-27', note: 'Board of studies, June 2026' }).expect(201)).body;
    expect(v1).toMatchObject({ version: 1, effectiveFrom: '2026-27' });
    expect(v1.statements).toHaveLength(8);
    await http().post(v).set(as('principal')).send({ effectiveFrom: '2027-28' }).expect(409); // nothing changed
    await http().put(`/v1/obe/outcomes/${ids.po1}`).set(as('principal')).send({ statement: 'Apply accounting standards' }).expect(200);
    const list = (await http().get(v).set(as('teacher')).expect(200)).body;
    expect(list.changedSinceLatest.changed).toEqual([expect.objectContaining({ code: 'PO1', statement: 'Apply accounting standards', before: 'Statement of PO1' })]);
    await http().post(v).set(as('principal')).send({ effectiveFrom: '2025-26' }).expect(400);
    await http().post(v).set(as('teacher')).send({ effectiveFrom: '2027-28' }).expect(403);
    expect((await http().post(v).set(as('principal')).send({ effectiveFrom: '2027-28' }).expect(201)).body.version).toBe(2);
  });

  it('flags COs whose verb does not fit, and keeps a justification with each mapping', async () => {
    const sub = `/v1/obe/subjects/${t.subject.id}/co-sets`;
    ids.set = (await http().post(sub).set(as('teacher')).send({}).expect(201)).body.id;
    ids.co1 = (await http().post(`/v1/obe/co-sets/${ids.set}/outcomes`).set(as('teacher')).send({ code: 'CO1', statement: 'Prepare company accounts', bloomLevel: 'Apply' }).expect(201)).body.id;
    ids.co2 = (await http().post(`/v1/obe/co-sets/${ids.set}/outcomes`).set(as('teacher')).send({ code: 'CO2', statement: 'Understand financial ratios', bloomLevel: 'L2' }).expect(201)).body.id;
    expect((await http().post('/v1/obe/check-co').set(as('teacher')).send({ statement: 'Evaluate audit evidence', bloomLevel: 'L5' }).expect(200)).body).toMatchObject({ ok: true, verb: 'evaluate' });
    await http().put(`/v1/obe/co-sets/${ids.set}/matrix`).set(as('teacher')).send({ cells: [{ coId: ids.co1, outcomeId: ids.po1, strength: 3, justification: 'Preparing accounts applies the standards' }, { coId: ids.co1, outcomeId: ids.po2, strength: 1 }, { coId: ids.co2, outcomeId: ids.po1, strength: 2 }] }).expect(200);
    const m = (await http().get(`/v1/obe/co-sets/${ids.set}/matrix`).set(as('teacher')).expect(200)).body;
    expect(m.cos.map((c: { code: string; verbCheck: { ok: boolean } }) => [c.code, c.verbCheck.ok])).toEqual([['CO1', true], ['CO2', false]]);
    expect(m.cells.find((c: { coId: string; outcomeId: string }) => c.coId === ids.co1 && c.outcomeId === ids.po1).justification).toBe('Preparing accounts applies the standards');
    const r = (await http().get(`${base()}/readiness`).set(as('principal')).expect(200)).body;
    const item = (k: string) => r.items.find((i: { key: string }) => i.key === k);
    expect(item('statements').done).toBe(true);
    expect(item('peoMission').done).toBe(true);
    expect(item('published').detail).toBe('Version 2 from 2027-28');
    expect(item('cos').done).toBe(false); // the version is still a draft
    await http().post(`/v1/obe/co-sets/${ids.set}/activate`).set(as('teacher')).expect(200);
    const r2 = (await http().get(`${base()}/readiness`).set(as('principal')).expect(200)).body;
    expect(r2.items.find((i: { key: string }) => i.key === 'verbs')).toMatchObject({ done: false, detail: '1 of 2 COs need a better action verb or Bloom level' });
    expect(r2.items.find((i: { key: string }) => i.key === 'justified')).toMatchObject({ done: false, detail: '1 of 3 mappings justified' });
    await http().get(`${base()}/readiness`).set(as('teacher')).expect(403);
  });

  it('sets targets per outcome and year, and the computation and student-wise view use them', async () => {
    const mk = async (title: string, kind: string, max: number, marks: number[]) => {
      const id = (await http().post('/v1/assessments').set(as('teacher')).send({ sectionId: t.section.id, subjectId: t.subject.id, title, kind, maxMarks: max, heldOn: '2026-10-20' }).expect(201)).body.id as string;
      await http().put(`/v1/assessments/${id}/marks`).set(as('teacher')).send({ entries: marks.map((m, i) => ({ studentId: t.students[i].id, marks: m })) }).expect(200);
      return id;
    };
    const test = await mk('Unit test 1', 'test', 10, [9, 7, 4]);
    const exam = await mk('Mid exam', 'exam', 10, [8, 5, 3]);
    await http().put(`/v1/obe/assessments/${test}/cos`).set(as('teacher')).send({ maps: [{ coId: ids.co1, share: 0.5 }, { coId: ids.co2, share: 0.5 }] }).expect(200);
    await http().put(`/v1/obe/assessments/${exam}/cos`).set(as('teacher')).send({ maps: [{ coId: ids.co1, share: 1 }] }).expect(200);

    const tg = `${base()}/targets`;
    const before = (await http().get(`${tg}?academicYearId=${year()}`).set(as('principal')).expect(200)).body;
    expect(before).toMatchObject({ defaultLevel: 2, defaultThreshold: 60, maxLevel: 3 });
    expect(before.rows.map((r: { code: string }) => r.code)).toEqual(['BCOM-3.1/CO1', 'BCOM-3.1/CO2', 'PO1', 'PO2', 'PSO1']);
    await http().put(tg).set(as('principal')).send({ academicYearId: year(), targets: [{ targetId: ids.po1, targetLevel: 4 }] }).expect(400); // above the scale
    await http().put(tg).set(as('principal')).send({ academicYearId: year(), targets: [{ targetId: ids.po1, targetLevel: 2, thresholdPercent: 50 }] }).expect(400); // thresholds are for COs
    await http().put(tg).set(as('teacher')).send({ academicYearId: year(), targets: [] }).expect(403);
    expect((await http().put(tg).set(as('principal')).send({ academicYearId: year(), targets: [{ targetId: ids.co1, targetLevel: 0.9, thresholdPercent: 50, rationale: 'First offering' }, { targetId: ids.po1, targetLevel: 3 }] }).expect(200)).body).toEqual({ set: 2, cleared: 0 });

    await http().post(`${base()}/attainment/compute`).set(as('principal')).send({ academicYearId: year() }).expect(200);
    const a = (await http().get(`${base()}/attainment?academicYearId=${year()}`).set(as('principal')).expect(200)).body;
    // CO1 at a 50% threshold: test 90/70/40% -> 2 of 3, exam 80/50/30% -> 2 of 3: both level 2, so direct 2 against a 0.9 target.
    expect(a.cos.find((c: { code: string }) => c.code.endsWith('CO1'))).toMatchObject({ direct: 2, combined: 2, target: 0.9, met: true });
    // PO1 = (3 x 2 + 2 x 2) / 5 = 2 against its own target of 3.
    expect(a.pos.find((c: { code: string }) => c.code === 'PO1')).toMatchObject({ combined: 2, target: 3, gap: 1, met: false });
    expect(a.pos.find((c: { code: string }) => c.code === 'PO2')).toMatchObject({ combined: 2, target: 2, met: true });

    const sw = (await http().get(`${base()}/attainment/students?academicYearId=${year()}&subjectId=${t.subject.id}`).set(as('teacher')).expect(200)).body;
    expect(sw.cos.map((c: { code: string; threshold: number; attained: number; measured: number; level: number }) => [c.code, c.threshold, c.attained, c.measured, c.level])).toEqual([
      ['CO1', 50, 2, 3, 2],
      ['CO2', 60, 2, 3, 2],
    ]);
    expect(sw.students.map((s: { rollNo: string; cos: { percent: number; attained: boolean }[] }) => [s.rollNo, s.cos[0].percent, s.cos[0].attained])).toEqual([
      ['R1', 83.3, true],
      ['R2', 56.7, true],
      ['R3', 33.3, false],
    ]);
    await http().get(`${base()}/attainment/students?academicYearId=${year()}&subjectId=${t.subject.id}`).set(as('student')).expect(403);

    const trend = (await http().get(`${base()}/attainment/trend`).set(as('principal')).expect(200)).body;
    expect(trend.years).toEqual([{ id: year(), label: '2026-27' }]);
    expect(trend.outcomes.find((o: { code: string }) => o.code === 'PO1')).toEqual({ code: 'PO1', values: [2], target: 3 });
    expect(trend.courses).toEqual([{ yearId: year(), cos: 2, met: 2 }]);

    // Targets carry to the next offering; clearing one returns it to the programme default.
    const [next] = (await owner.query(`insert into academic_years (tenant_id, label, starts_on, ends_on, is_current) values ($1, '2027-28', '2027-06-01', '2028-05-31', false) returning id`, [t.tenantId])).rows;
    expect((await http().post(`${tg}/copy`).set(as('principal')).send({ fromYearId: year(), toYearId: next.id }).expect(200)).body).toEqual({ copied: 2, kept: 0 });
    expect((await http().post(`${tg}/copy`).set(as('principal')).send({ fromYearId: year(), toYearId: next.id }).expect(200)).body).toEqual({ copied: 0, kept: 2 });
    expect((await http().put(tg).set(as('principal')).send({ academicYearId: next.id, targets: [{ targetId: ids.po1, targetLevel: null }] }).expect(200)).body).toEqual({ set: 0, cleared: 1 });
    expect((await http().get(`${tg}?academicYearId=${next.id}`).set(as('principal')).expect(200)).body.rows.find((r: { code: string }) => r.code === 'PO1').targetLevel).toBeNull();
    expect((await http().get(`${tg}?academicYearId=${year()}`).set(as('outsider')).expect(200)).body.rows).toEqual([]);
  });

  it('opens improvement actions for the gaps and runs them as a list with bulk changes and history', async () => {
    const g = (await http().post(`${base()}/actions/from-gaps`).set(as('principal')).send({ academicYearId: year(), dueOn: '2027-03-31' }).expect(200)).body;
    expect(g).toEqual({ gaps: 1, created: 1, alreadyOpen: 0 });
    expect((await http().post(`${base()}/actions/from-gaps`).set(as('principal')).send({ academicYearId: year() }).expect(200)).body).toEqual({ gaps: 1, created: 0, alreadyOpen: 1 });
    const meta = (await http().get('/v1/records/obe-actions/meta').set(as('principal')).expect(200)).body;
    expect(meta.can).toMatchObject({ create: false, import: false, write: true });
    const l = (await http().get(`/v1/records/obe-actions?f.programId=${t.program.id}`).set(as('principal')).expect(200)).body;
    expect(l.rows[0]).toMatchObject({ code: 'PO1', scope: 'po', program: 'BCom', year: '2026-27', baselineValue: 2, targetValue: 3, dueOn: '2027-03-31', status: 'open' });
    const id = l.rows[0].id;
    const bulk = (await http().post('/v1/records/obe-actions/bulk').set(as('principal')).send({ op: 'update', target: { ids: [id] }, fields: { ownerId: t.teacher.id, status: 'in_progress' } }).expect(200)).body;
    expect(bulk.succeeded).toBe(1);
    await http().patch(`/v1/records/obe-actions/${id}`).set(as('principal')).send({ rootCause: 'Too few problem-solving sessions', remeasuredValue: 3, status: 'done' }).expect(200);
    const row = (await owner.query('select status, closed_at is not null as closed, remeasured_at is not null as remeasured from improvement_actions where id = $1', [id])).rows[0];
    expect(row).toEqual({ status: 'done', closed: true, remeasured: true });
    expect((await http().get(`/v1/records/obe-actions?f.programId=${t.program.id}`).set(as('principal')).expect(200)).body.rows[0].closed).toBe(true);
    const h = (await http().get(`/v1/records/obe-actions/${id}/history`).set(as('principal')).expect(200)).body.items;
    expect(h[0].changes.map((c: { field: string }) => c.field).sort()).toEqual(['remeasuredValue', 'rootCause', 'status']);
    await http().get('/v1/records/obe-actions').set(as('teacher')).expect(403);
    expect((await http().get('/v1/records/obe-actions').set(as('outsider')).expect(200)).body.total).toBe(0);
  });
});
