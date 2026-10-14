import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/**
 * Relative (curve) grading where the regulation allows it: switched on by the exam office, previewed for a subject
 * (mean, standard deviation, cut-offs with moderation, grades against the absolute ones), applied to processed results
 * and cleared again; refused under a profile that does not allow it. The re-admission scheme: a student rejoining
 * after a break moves to the curriculum version in force, with passed subjects credited by code or equivalence.
 */
describe('relative grading and the re-admission scheme', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  const tok: Record<string, string> = {};
  let sessionId = '';
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tok[who]}` });
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const enter = (assessmentId: string, values: number[]) => http().put(`/v1/assessments/${assessmentId}/marks`).set(as('teacher')).send({ entries: values.map((marks, i) => ({ studentId: t.students[i].id, marks })) });
  const verify = async (id: string) => {
    await http().post(`/v1/assessments/${id}/submit`).set(as('teacher')).expect(200);
    await http().post(`/v1/assessments/${id}/verify`).set(as('principal')).expect(200);
  };
  const grades = async () => {
    const rows = (await http().get(`/v1/exam-sessions/${sessionId}/results`).set(as('principal')).expect(200)).body as { rollNo: string; lines: { grade: string; gradePoint: number }[] }[];
    return ['R1', 'R2', 'R3'].map((r) => rows.find((x) => x.rollNo === r)!.lines[0].grade);
  };

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(new FixedClock(new Date('2026-11-25T05:00:00Z')));
    tok.principal = await login(t.principal.email!);
    tok.teacher = await login(t.teacher.email!);

    const scaleId = (await http().post('/v1/grade-scales').set(as('principal')).send({ name: 'UGC', preset: 'bu-nep', isDefault: true }).expect(201)).body.id;
    const comps = (
      await http()
        .put('/v1/schemes')
        .set(as('principal'))
        .send({ subjectId: t.subject.id, academicYearId: t.section.academicYearId, name: 'Theory', credits: 4, gradeScaleId: scaleId, passRules: { minInternalPercent: null, minExternalPercent: 40, minTotalPercent: 40 }, components: [{ code: 'IA', name: 'Internal', kind: 'internal', weight: 40 }, { code: 'SEE', name: 'Semester end', kind: 'external', weight: 60 }] })
        .expect(200)
    ).body.components as { id: string }[];
    const ia = (await http().post('/v1/assessments').set(as('teacher')).send({ sectionId: t.section.id, subjectId: t.subject.id, title: 'Internal', kind: 'internal', maxMarks: 40, heldOn: '2026-10-20', componentId: comps[0].id }).expect(201)).body.id;
    await enter(ia, [32, 24, 20]).expect(200);
    await verify(ia);
    sessionId = (await http().post('/v1/exam-sessions').set(as('principal')).send({ academicYearId: t.section.academicYearId, programId: t.program.id, term: 3, name: 'Semester 3 Nov 2026', startsOn: '2026-11-02', endsOn: '2026-11-20' }).expect(201)).body.id;
    const see = (await http().post(`/v1/exam-sessions/${sessionId}/papers`).set(as('principal')).send({ subjectId: t.subject.id, sectionId: t.section.id, examDate: '2026-11-05', startsAt: '10:00', endsAt: '13:00', maxMarks: 60 }).expect(201)).body.assessmentId;
    await http().post(`/v1/exam-sessions/${sessionId}/schedule`).set(as('principal')).expect(200);
    await enter(see, [48, 36, 25]).expect(200); // totals 80, 60 and 45 percent
    await verify(see);
    await http().post(`/v1/exam-sessions/${sessionId}/process`).set(as('principal')).expect(200);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('previews a subject on the curve: mean, standard deviation, cut-offs with moderation, both distributions', async () => {
    const st = (await http().get('/v1/relative-grading/settings').set(as('principal')).expect(200)).body;
    expect(st).toMatchObject({ allowed: true, enabled: false, profile: null, minClassSize: 30 });
    const absolute = await grades();
    const pv = (await http().post(`/v1/relative-grading/sessions/${sessionId}/subjects/${t.subject.id}/preview`).set(as('principal')).send({ shift: 0 }).expect(200)).body;
    expect(pv.stats).toEqual({ candidates: 3, mean: 61.67, sd: 14.34 });
    expect(pv.passPercent).toBe(40);
    expect(pv.cuts.map((c: { grade: string; minPercent: number }) => [c.grade, c.minPercent])).toEqual([['O', 83.18], ['A+', 76.01], ['A', 68.84], ['B+', 61.67], ['B', 54.5], ['C', 47.33], ['P', 40]]);
    expect(pv.tooSmall).toBe(true);
    expect(pv.relative.filter((d: { count: number }) => d.count).map((d: { grade: string }) => d.grade)).toEqual(['A+', 'B', 'P']);
    expect(pv.absolute.reduce((n: number, d: { count: number }) => n + d.count, 0)).toBe(3);
    const moderated = (await http().post(`/v1/relative-grading/sessions/${sessionId}/subjects/${t.subject.id}/preview`).set(as('principal')).send({ shift: -2 }).expect(200)).body;
    expect(moderated.cuts[0].minPercent).toBe(81.18);
    await http().post(`/v1/relative-grading/sessions/${sessionId}/subjects/${t.subject.id}/preview`).set(as('principal')).send({ shift: 9 }).expect(400); // beyond the moderation limit
    expect(await grades()).toEqual(absolute); // a preview changes nothing
  });

  it('is applied only when switched on and the class is large enough, regrades processed results, and can be cleared', async () => {
    const put = (body: object) => http().put(`/v1/relative-grading/sessions/${sessionId}/subjects/${t.subject.id}`).set(as('principal')).send(body);
    const absolute = await grades();
    await put({ shift: 0 }).expect(409); // off
    await http().put('/v1/relative-grading/settings').set(as('teacher')).send({ enabled: true }).expect(403);
    await http().put('/v1/relative-grading/settings').set(as('principal')).send({ enabled: true }).expect(200);
    expect((await put({ shift: 0 }).expect(409)).body.message).toMatch(/too small/);
    await http().put('/v1/relative-grading/settings').set(as('principal')).send({ enabled: true, minClassSize: 3 }).expect(200);
    // Saving the exam office's own settings keeps the switch (same settings row).
    const office = (await http().get('/v1/exam-office/settings').set(as('principal')).expect(200)).body.settings;
    await http().put('/v1/exam-office/settings').set(as('principal')).send(office).expect(200);
    expect((await http().get('/v1/relative-grading/settings').set(as('principal')).expect(200)).body).toMatchObject({ enabled: true, minClassSize: 3 });
    const applied = (await put({ shift: 0, note: 'Board of examiners, 24 Nov' }).expect(200)).body;
    expect(applied.regraded).toBe(3);
    expect(await grades()).toEqual(['A+', 'B', 'P']);
    const list = (await http().get(`/v1/relative-grading/sessions/${sessionId}`).set(as('principal')).expect(200)).body;
    expect(list.subjects[0].applied).toMatchObject({ candidates: 3, mean: 61.67, sd: 14.34, note: 'Board of examiners, 24 Nov' });
    const audit = (await owner.query("select action from audit_log where tenant_id = $1 and action like 'exam.relative_grading%'", [t.tenantId])).rows.map((r) => r.action);
    expect(audit).toEqual(expect.arrayContaining(['exam.relative_grading.settings', 'exam.relative_grading.applied']));
    await http().delete(`/v1/relative-grading/sessions/${sessionId}/subjects/${t.subject.id}`).set(as('principal')).expect(200);
    expect(await grades()).toEqual(absolute);
  });

  it('is refused where the regulation does not allow it', async () => {
    await http().put('/v1/affiliation').set(as('principal')).send({ profileCode: 'vtu', schemeCode: '2022' }).expect(200);
    const st = (await http().get('/v1/relative-grading/settings').set(as('principal')).expect(200)).body;
    expect(st).toMatchObject({ allowed: false, enabled: false, profile: 'vtu/2022' });
    await http().put('/v1/relative-grading/settings').set(as('principal')).send({ enabled: true }).expect(403);
    await http().post(`/v1/relative-grading/sessions/${sessionId}/subjects/${t.subject.id}/preview`).set(as('principal')).send({ shift: 0 }).expect(403);
    await http().put('/v1/affiliation').set(as('principal')).send({ profileCode: 'ugc', schemeCode: 'cbcs-2015' }).expect(200);
    expect((await http().get('/v1/relative-grading/settings').set(as('principal')).expect(200)).body).toMatchObject({ allowed: true, profile: 'ugc/cbcs-2015' });
  });

  it('moves a rejoining student to the scheme in force, crediting passed subjects by code or equivalence', async () => {
    const version = async (year: number, label: string, subjects: { code: string; name: string; term: number }[]) => {
      const v = (await http().post('/v1/curriculum/versions').set(as('principal')).send({ programId: t.program.id, regulationYear: year, label }).expect(201)).body;
      await http().put(`/v1/curriculum/versions/${v.id}/content`).set(as('principal')).send({ subjects: subjects.map((x) => ({ ...x, credits: 4, hours: 60, units: [], cos: [] })) }).expect(200);
      await http().post(`/v1/curriculum/versions/${v.id}/approve`).set(as('principal')).send({ bosRef: `BOS/${year}`, universityRef: `UNI/${year}` }).expect(200);
      await http().post(`/v1/curriculum/versions/${v.id}/activate`).set(as('principal')).send({ effectiveFrom: `${year}-06-01` }).expect(200);
      return v.id as string;
    };
    const old = await version(2024, 'CBCS scheme', [{ code: 'BCOM-3.1', name: 'Corporate Accounting', term: 3 }, { code: 'BC201', name: 'Costing', term: 2 }]);
    const neu = await version(2026, 'NEP scheme', [{ code: 'BCN-1.1', name: 'Financial Accounting', term: 1 }, { code: 'BC201', name: 'Costing', term: 2 }, { code: 'BCN-3.1', name: 'Corporate Accounts', term: 3 }]);
    await http().post(`/v1/curriculum/versions/${old}/pin`).set(as('principal')).send({ sectionIds: [t.section.id], replace: true }).expect(200);
    // Student A passed Corporate Accounting in a published session.
    await owner.query("update exam_sessions set status = 'published' where id = $1", [sessionId]);
    const a = t.students[0].id;
    const found = (await http().get(`/v1/readmissions/search?q=${encodeURIComponent(t.students[0].fullName.slice(0, 4))}`).set(as('principal')).expect(200)).body;
    expect(found.map((x: { id: string }) => x.id)).toContain(a);
    expect((await http().get(`/v1/readmissions/search?id=${a}`).set(as('principal')).expect(200)).body).toEqual([expect.objectContaining({ id: a, program: expect.any(String) })]);
    await http().get('/v1/readmissions/search?q=ab').set(as('teacher')).expect(403);

    const before = (await http().get(`/v1/readmissions/students/${a}/preview?rejoinedOn=2026-07-01&rejoinTerm=4`).set(as('principal')).expect(200)).body;
    expect(before).toMatchObject({ from: { id: old }, to: { id: neu }, credited: [], notCounted: [{ code: 'BCOM-3.1' }] });
    await http().post('/v1/records/curriculum-equivalences').set(as('principal')).send({ fromVersionId: old, fromCode: 'BCOM-3.1', toVersionId: neu, toCode: 'BCN-3.9' }).expect(400); // no such subject
    await http().post('/v1/records/curriculum-equivalences').set(as('principal')).send({ fromVersionId: old, fromCode: 'BCOM-3.1', toVersionId: neu, toCode: 'BCN-3.1', note: 'Same syllabus, renumbered' }).expect(201);
    const eq = (await http().get('/v1/records/curriculum-equivalences').set(as('principal')).expect(200)).body.rows;
    expect(eq[0]).toMatchObject({ fromCode: 'BCOM-3.1', toCode: 'BCN-3.1', fromName: 'Corporate Accounting', toName: 'Corporate Accounts', fromVersion: '2024 v1: CBCS scheme', toVersion: '2026 v1: NEP scheme' });
    const pl = (await http().get(`/v1/readmissions/students/${a}/preview?rejoinedOn=2026-07-01&rejoinTerm=4`).set(as('principal')).expect(200)).body;
    expect(pl.credited).toEqual([expect.objectContaining({ fromCode: 'BCOM-3.1', toCode: 'BCN-3.1', credits: 4 })]);
    expect(pl.toTake.map((x: { code: string }) => x.code)).toEqual(['BCN-1.1', 'BC201']);
    expect(pl.equivalencesUsed).toBe(1);
    // Rejoining in 2025 the old scheme is still the one in force.
    expect((await http().get(`/v1/readmissions/students/${a}/preview?rejoinedOn=2025-07-01&rejoinTerm=4`).set(as('principal')).expect(200)).body).toMatchObject({ sameVersion: true, to: { id: old } });

    await http().post('/v1/readmissions').set(as('teacher')).send({ studentId: a, rejoinedOn: '2026-07-01', rejoinTerm: 4 }).expect(403);
    const done = (await http().post('/v1/readmissions').set(as('principal')).send({ studentId: a, rejoinedOn: '2026-07-01', rejoinTerm: 4, note: 'Rejoined after a medical break' }).expect(201)).body;
    expect(done).toMatchObject({ toVersionId: neu, fromVersionId: old, rejoinTerm: 4 });
    expect((await http().get(`/v1/curriculum/students/${a}`).set(as('principal')).expect(200)).body.version.id).toBe(neu);
    const hist = (await http().get(`/v1/readmissions/students/${a}`).set(as('principal')).expect(200)).body;
    expect(hist[0]).toMatchObject({ to: { label: 'NEP scheme' }, from: { label: 'CBCS scheme' }, note: 'Rejoined after a medical break' });
    const h = (await http().get(`/v1/records/students/${a}/history`).set(as('principal')).expect(200)).body.items.map((x: { action: string }) => x.action);
    expect(h).toContain('student.readmission_scheme');
  });
});

