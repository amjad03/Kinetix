import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('OBE: outcomes, CO-PO matrix, attainment and accreditation exports', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const base = () => `/v1/obe/programs/${t.program.id}`;
  const year = () => t.section.academicYearId;
  let po1: string, po2: string, pso1: string;
  let setId: string, co1: string, co2: string;
  let testId: string, examId: string;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(new FixedClock(new Date('2026-11-01T05:00:00Z')));
    tokens = {
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      student: await login(t.slug, t.studentUser.email!),
      otherPrincipal: await login(other.slug, other.principal.email!),
    };
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });
  const actions = async () => (await owner.query('select action from audit_log where tenant_id = $1', [t.tenantId])).rows.map((r) => r.action as string);

  it('records mission, vision, PEOs, POs and PSOs; only leaders may', async () => {
    const add = (as_: string, kind: string, code: string, statement = `Statement of ${code}`) => http().post(`${base()}/outcomes`).set(as(as_)).send({ kind, code, statement });
    await add('teacher', 'po', 'PO1').expect(403);
    await add('student', 'po', 'PO1').expect(403);
    await add('principal', 'mission', 'M1', 'Quality commerce education').expect(201);
    await add('principal', 'vision', 'V1').expect(201);
    await add('principal', 'peo', 'PEO1').expect(201);
    po1 = (await add('principal', 'po', 'PO1').expect(201)).body.id;
    po2 = (await add('principal', 'po', 'PO2').expect(201)).body.id;
    pso1 = (await add('principal', 'pso', 'PSO1').expect(201)).body.id;
    await add('principal', 'po', 'PO1').expect(409);
    await http().post(`${base()}/outcomes`).set(as('principal')).send({ kind: 'po', code: 'PO3', statement: '' }).expect(400);
    await http().get(`${base()}/outcomes`).set(as('otherPrincipal')).expect(200).then((r) => expect(r.body).toEqual([])); // tenant isolation
    expect((await http().get(`${base()}/outcomes`).set(as('teacher')).expect(200)).body).toHaveLength(6);
  });

  it('validates attainment configuration', async () => {
    const cfg = (await http().get(`${base()}/config`).set(as('teacher')).expect(200)).body;
    expect(cfg.targetLevel).toBe(2);
    await http().put(`${base()}/config`).set(as('principal')).send({ ...cfg, targetLevel: 5 }).expect(400);
    await http().put(`${base()}/config`).set(as('teacher')).send(cfg).expect(403);
    await http().put(`${base()}/config`).set(as('principal')).send(cfg).expect(200);
  });

  it('versions COs, edits the CO-PO matrix in a draft and freezes it on activation', async () => {
    const sub = `/v1/obe/subjects/${t.subject.id}/co-sets`;
    await http().post(sub).set(as('teacher2')).send({}).expect(403); // does not teach the subject
    const set = (await http().post(sub).set(as('teacher')).send({}).expect(201)).body;
    setId = set.id;
    expect(set.version).toBe(1);
    await http().post(sub).set(as('teacher')).send({}).expect(409); // a draft is already open
    co1 = (await http().post(`/v1/obe/co-sets/${setId}/outcomes`).set(as('teacher')).send({ code: 'CO1', statement: 'Prepare company accounts', bloomLevel: 'Apply' }).expect(201)).body.id;
    co2 = (await http().post(`/v1/obe/co-sets/${setId}/outcomes`).set(as('teacher')).send({ code: 'CO2', statement: 'Analyse financial statements' }).expect(201)).body.id;
    await http().post(`/v1/obe/co-sets/${setId}/outcomes`).set(as('teacher')).send({ code: 'CO1', statement: 'dup dup' }).expect(409);

    const cells = [{ coId: co1, outcomeId: po1, strength: 3 }, { coId: co1, outcomeId: po2, strength: 1 }, { coId: co2, outcomeId: po1, strength: 2 }, { coId: co2, outcomeId: pso1, strength: 0 }];
    await http().put(`/v1/obe/co-sets/${setId}/matrix`).set(as('teacher')).send({ cells: [{ coId: co1, outcomeId: co2, strength: 3 }] }).expect(400);
    await http().put(`/v1/obe/co-sets/${setId}/matrix`).set(as('teacher')).send({ cells: [{ coId: co1, outcomeId: po1, strength: 4 }] }).expect(400);
    await http().put(`/v1/obe/co-sets/${setId}/matrix`).set(as('teacher')).send({ cells }).expect(200);
    const m = (await http().get(`/v1/obe/co-sets/${setId}/matrix`).set(as('teacher')).expect(200)).body;
    expect(m.cells).toHaveLength(3); // strength 0 means no mapping
    expect(m.outcomes.map((o: { code: string }) => o.code)).toEqual(['PO1', 'PO2', 'PSO1']);

    await http().post(`/v1/obe/co-sets/${setId}/activate`).set(as('teacher')).expect(200);
    await http().post(`/v1/obe/co-sets/${setId}/outcomes`).set(as('teacher')).send({ code: 'CO3', statement: 'Too late for v1' }).expect(409);
    await http().put(`/v1/obe/co-sets/${setId}/matrix`).set(as('teacher')).send({ cells }).expect(409);

    // A new version starts as a copy; v1 stays active until v2 is activated.
    const v2 = (await http().post(sub).set(as('teacher')).send({ note: 'Revised syllabus' }).expect(201)).body;
    expect(v2.version).toBe(2);
    const m2 = (await http().get(`/v1/obe/co-sets/${v2.id}/matrix`).set(as('teacher')).expect(200)).body;
    expect(m2.cos.map((c: { code: string }) => c.code)).toEqual(['CO1', 'CO2']);
    expect(m2.cells).toHaveLength(3);
    const all = (await http().get(sub).set(as('teacher')).expect(200)).body;
    expect(all.map((x: { version: number; status: string }) => `${x.version}:${x.status}`)).toEqual(['2:draft', '1:active']);
  });

  it('maps assessments to COs and computes direct + indirect attainment to the known values', async () => {
    const mk = async (title: string, kind: string, max: number, marks: number[]) => {
      const id = (await http().post('/v1/assessments').set(as('teacher')).send({ sectionId: t.section.id, subjectId: t.subject.id, title, kind, maxMarks: max, heldOn: '2026-10-20' }).expect(201)).body.id as string;
      await http().put(`/v1/assessments/${id}/marks`).set(as('teacher')).send({ entries: marks.map((m, i) => ({ studentId: t.students[i].id, marks: m })) }).expect(200);
      return id;
    };
    testId = await mk('Unit test 1', 'test', 10, [9, 7, 4]);
    examId = await mk('Mid exam', 'exam', 10, [8, 5, 3]);
    await http().put(`/v1/obe/assessments/${testId}/cos`).set(as('teacher2')).send({ maps: [{ coId: co1, share: 1 }] }).expect(403);
    await http().put(`/v1/obe/assessments/${testId}/cos`).set(as('teacher')).send({ maps: [{ coId: co1, share: 0.5 }, { coId: co2, share: 0.5 }] }).expect(200);
    await http().put(`/v1/obe/assessments/${examId}/cos`).set(as('teacher')).send({ maps: [{ coId: co1, share: 1 }] }).expect(200);
    await http().put(`/v1/obe/assessments/${examId}/cos`).set(as('teacher')).send({ maps: [{ coId: co1, share: 1.5 }] }).expect(400);

    const sv = (await http().post('/v1/obe/surveys').set(as('teacher')).send({ programId: t.program.id, subjectId: t.subject.id, academicYearId: year(), kind: 'course_exit', title: 'Course exit survey', scaleMax: 5, minResponses: 5, weight: 1 }).expect(201)).body;
    await http().post('/v1/obe/surveys').set(as('teacher')).send({ programId: t.program.id, academicYearId: year(), kind: 'alumni', title: 'Alumni' }).expect(403);
    await http().post(`/v1/obe/surveys/${sv.id}/ratings`).set(as('teacher')).send({ ratings: [{ coId: co1, rating: 6 }] }).expect(400);
    await http().post(`/v1/obe/surveys/${sv.id}/ratings`).set(as('teacher')).send({ ratings: [{ outcomeId: po1, rating: 4 }] }).expect(400);
    await http().post(`/v1/obe/surveys/${sv.id}/ratings`).set(as('teacher')).send({ ratings: Array.from({ length: 5 }, () => ({ coId: co1, rating: 4 })) }).expect(200);

    await http().post(`${base()}/attainment/compute`).set(as('teacher')).send({ academicYearId: year() }).expect(403);
    const run = (await http().post(`${base()}/attainment/compute`).set(as('principal')).send({ academicYearId: year() }).expect(200)).body;
    expect(run).toMatchObject({ cos: 2, outcomes: 3 });

    const a = (await http().get(`${base()}/attainment?academicYearId=${year()}`).set(as('principal')).expect(200)).body;
    const co = (code: string) => a.cos.find((c: { code: string }) => c.code.endsWith(code));
    const po = (code: string) => a.pos.find((c: { code: string }) => c.code === code);
    // CO1: internal 9/10*.5=4.5/5, 3.5/5, 2/5 -> 90%, 70%, 40%: 2 of 3 attain 60% -> 66.7% -> level 2.
    //      external 8, 5, 3 of 10 -> 1 of 3 -> 33.3% -> level 0. direct = (30*2 + 70*0)/100 = 0.6.
    //      indirect = 4/5 * 3 = 2.4. combined = (80*0.6 + 20*2.4)/100 = 0.96.
    expect(co('CO1')).toMatchObject({ direct: 0.6, indirect: 2.4, combined: 0.96, target: 2, gap: 1.04, met: false });
    expect(co('CO1').detail.byKind.map((k: { kind: string; level: number }) => [k.kind, k.level])).toEqual([['external', 0], ['internal', 2]]);
    // CO2: only the internal test (half its marks) -> level 2, no survey -> combined 2.
    expect(co('CO2')).toMatchObject({ direct: 2, indirect: null, combined: 2, gap: 0, met: true });
    // PO1 = (3 * 0.96 + 2 * 2) / 5 = 1.376; PO2 = 0.96; PSO1 has no mapped CO.
    expect(po('PO1')).toMatchObject({ combined: 1.38, met: false });
    expect(po('PO2')).toMatchObject({ combined: 0.96 });
    expect(po('PSO1')).toMatchObject({ combined: null, met: false, gap: null });
    expect(a.summary).toMatchObject({ cosMet: 1, cos: 2, posMet: 0, pos: 3 });
    expect(a.summary.gaps.map((g: { code: string }) => g.code).sort()).toEqual(['BCOM-3.1/CO1', 'PO1', 'PO2']); // unmet and measured; PSO1 has no measurement
    expect(a.summary.gaps[2].gap).toBe(0.62); // largest first: 1.04, 1.04, then PO1 at 2 - 1.38
    expect(a.cos.every((c: { trend: string }) => c.trend === 'new')).toBe(true);

    // A second run gives a trend against the first.
    await http().post(`${base()}/attainment/compute`).set(as('principal')).send({ academicYearId: year() }).expect(200);
    const b = (await http().get(`${base()}/attainment?academicYearId=${year()}`).set(as('principal')).expect(200)).body;
    expect(b.cos.every((c: { trend: string }) => c.trend === 'flat')).toBe(true);
    await http().get(`${base()}/attainment?academicYearId=${year()}`).set(as('student')).expect(403);
  });

  it('tracks improvement actions and evidence, and exports NAAC/NBA reports', async () => {
    const act = (await http().post(`${base()}/actions`).set(as('principal')).send({ scope: 'co', targetId: co1, title: 'Remedial classes for CO1', dueOn: '2026-12-15' }).expect(201)).body;
    await http().post(`${base()}/actions`).set(as('teacher')).send({ scope: 'co', targetId: co1, title: 'No rights here' }).expect(403);
    const done = (await http().put(`/v1/obe/actions/${act.id}`).set(as('principal')).send({ status: 'done' }).expect(200)).body;
    expect(done.closedAt).not.toBeNull();
    await http().post(`${base()}/evidence`).set(as('principal')).send({ scope: 'co', targetId: co1, title: 'Remedial attendance sheet' }).expect(400);
    await http().post(`${base()}/evidence`).set(as('principal')).send({ scope: 'co', targetId: co1, title: 'Remedial attendance sheet', url: 'https://example.com/sheet.pdf' }).expect(201);
    expect((await http().get(`${base()}/evidence?targetId=${co1}`).set(as('principal')).expect(200)).body).toHaveLength(1);
    expect((await http().get(`${base()}/actions`).set(as('principal')).expect(200)).body[0]).toMatchObject({ title: 'Remedial classes for CO1', status: 'done' });

    const csv = await http().get(`${base()}/report.csv?academicYearId=${year()}`).set(as('principal')).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Course outcome attainment,BCOM-3.1/CO1');
    expect(csv.text).toContain('Quality commerce education');
    expect(csv.text).toContain('CO-PO matrix');
    const bin = (res: request.Response, cb: (e: Error | null, b: Buffer) => void) => { const d: Buffer[] = []; res.on('data', (c: Buffer) => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d))); };
    for (const [fw, title] of [['nba', 'NBA SAR'], ['naac', 'NAAC']] as const) {
      const pdf = await http().get(`${base()}/report.pdf?academicYearId=${year()}&framework=${fw}`).set(as('principal')).buffer().parse(bin).expect(200);
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      expect((pdf.body as Buffer).toString('latin1')).toContain(title);
    }
    await http().get(`${base()}/report.csv?academicYearId=${year()}`).set(as('student')).expect(403);
    expect(await actions()).toEqual(expect.arrayContaining(['obe.outcome.created', 'obe.config.updated', 'obe.coset.created', 'obe.coset.activated', 'obe.co.created', 'obe.matrix.saved', 'obe.assessment.mapped', 'obe.survey.rated', 'obe.attainment.computed', 'obe.action.created', 'obe.evidence.added', 'obe.report.exported']));
  });
});
