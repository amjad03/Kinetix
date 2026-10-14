import type { INestApplication } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/**
 * Affiliation profiles end to end: choosing VTU changes how the same marks are graded and who is eligible by
 * attendance; overrides are validated and audited; a programme can follow another university's scheme; the
 * marks-card data contract and the result-sheet import follow the profile.
 */
describe('affiliation profiles', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const [A, B, C] = [0, 1, 2];
  let sessionId: string;

  const results = async () => {
    const rows = (await http().get(`/v1/exam-sessions/${sessionId}/results`).set(as('principal')).expect(200)).body as { rollNo: string; outcome: string; sgpa: number; lines: { percent: number; grade: string; gradePoint: number; passed: boolean; reasons: string[] }[] }[];
    return (i: number) => rows.find((r) => r.rollNo === `R${i + 1}`)!;
  };
  const process = () => http().post(`/v1/exam-sessions/${sessionId}/process`).set(as('principal')).expect(200);
  const eligibility = async () => (await http().get(`/v1/attendance/eligibility?sectionId=${t.section.id}`).set(as('principal')).expect(200)).body as { thresholdPct: number; students: { studentId: string; eligible: boolean }[] };
  const eligible = (e: Awaited<ReturnType<typeof eligibility>>, i: number) => e.students.find((x) => x.studentId === t.students[i].id)!.eligible;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(new FixedClock(new Date('2026-11-25T05:00:00Z')));
    tokens = {
      teacher: await login(t.slug, t.teacher.email!),
      principal: await login(t.slug, t.principal.email!),
      student: await login(t.slug, t.studentUser.email!),
      parentA: await login(t.slug, t.guardian.email!),
      otherPrincipal: await login(other.slug, other.principal.email!),
    };
    // Student A attended 8 of 10 days (80%): eligible at 75%, short at VTU's 85%.
    const days = Array.from({ length: 10 }, (_, i) => `2026-10-${String(i + 5).padStart(2, '0')}`);
    await db.insert(s.attendanceRecords).values(days.map((date, i) => ({ tenantId: t.tenantId, studentId: t.students[A].id, sectionId: t.section.id, date, status: i < 8 ? ('present' as const) : ('absent' as const), markedBy: t.teacher.id, occurredAt: new Date(`${date}T04:00:00Z`) })));
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('lists the universities and boards, and has nothing selected yet', async () => {
    const list = (await http().get('/v1/affiliation/profiles').set(as('teacher')).expect(200)).body as { code: string; schemes: { code: string }[] }[];
    expect(list.map((p) => p.code)).toEqual(expect.arrayContaining(['vtu', 'bangalore-university', 'rguhs', 'kslu', 'cbse', 'kseab-sslc', 'karnataka-puc', 'autonomous']));
    expect(list.find((p) => p.code === 'vtu')!.schemes.map((x) => x.code)).toContain('2022');
    await http().get('/v1/affiliation/profiles').set(as('student')).expect(403);
    const vtu = (await http().get('/v1/affiliation/profiles/vtu').set(as('principal')).expect(200)).body;
    expect(vtu.schemes[0].sources.length).toBeGreaterThan(0);
    expect(vtu.schemes[0].description.find((d: { section: string }) => d.section === 'attendance').lines[0]).toContain('85%');
    await http().get('/v1/affiliation/profiles/nowhere').set(as('principal')).expect(404);
    expect((await http().get('/v1/affiliation').set(as('principal')).expect(200)).body.selected).toBeNull();
    await http().get('/v1/affiliation/rules').set(as('principal')).expect(404);
  });

  it('grades with the scheme\'s own rules while no profile is chosen', async () => {
    const scaleId = (await http().post('/v1/grade-scales').set(as('principal')).send({ name: 'BU NEP', preset: 'bu-nep', isDefault: true }).expect(201)).body.id;
    const scheme = (
      await http()
        .put('/v1/schemes')
        .set(as('principal'))
        .send({
          subjectId: t.subject.id,
          academicYearId: t.section.academicYearId,
          name: 'Theory',
          credits: 4,
          gradeScaleId: scaleId,
          passRules: { minInternalPercent: null, minExternalPercent: 40, minTotalPercent: 40 },
          components: [
            { code: 'CIE', name: 'Internal', kind: 'internal', weight: 50 },
            { code: 'SEE', name: 'Semester end exam', kind: 'external', weight: 50 },
          ],
        })
        .expect(200)
    ).body;
    const ia = (await http().post('/v1/assessments').set(as('teacher')).send({ sectionId: t.section.id, subjectId: t.subject.id, title: 'CIE', kind: 'internal', maxMarks: 50, heldOn: '2026-10-20', componentId: scheme.components[0].id }).expect(201)).body.id;
    sessionId = (await http().post('/v1/exam-sessions').set(as('principal')).send({ academicYearId: t.section.academicYearId, programId: t.program.id, term: 3, name: 'Sem 3 Nov 2026', startsOn: '2026-11-02', endsOn: '2026-11-20' }).expect(201)).body.id;
    const see = (await http().post(`/v1/exam-sessions/${sessionId}/papers`).set(as('principal')).send({ subjectId: t.subject.id, sectionId: t.section.id, examDate: '2026-11-05', startsAt: '10:00', endsAt: '13:00', maxMarks: 50 }).expect(201)).body.assessmentId;
    await http().post(`/v1/exam-sessions/${sessionId}/schedule`).set(as('principal')).expect(200);
    for (const [id, values] of [
      [ia, [40, 45, 15]],
      [see, [19, 45, 40]],
    ] as const) {
      await http().put(`/v1/assessments/${id}/marks`).set(as('teacher')).send({ entries: values.map((marks, i) => ({ studentId: t.students[i].id, marks })) }).expect(200);
      await http().post(`/v1/assessments/${id}/submit`).set(as('teacher')).expect(200);
      await http().post(`/v1/assessments/${id}/verify`).set(as('principal')).expect(200);
    }
    expect((await process()).body).toEqual({ students: 3, passed: 2, failed: 1 });
    const by = await results();
    // A: SEE 19/50 = 38% < 40% fails. B: 90 -> O, 9.0 (percentage ÷ 10). C: CIE 30% (no CIE minimum) + 40 = 55 -> 5.5.
    expect(by(A).lines[0]).toMatchObject({ percent: 59, grade: 'F', passed: false });
    expect(by(B).lines[0]).toMatchObject({ percent: 90, grade: 'O', gradePoint: 9 });
    expect(by(C).lines[0]).toMatchObject({ percent: 55, passed: true, gradePoint: 5.5 });
    const e = await eligibility();
    expect(e.thresholdPct).toBe(75);
    expect(eligible(e, A)).toBe(true);
  });

  it('selecting VTU 2022 changes grading, eligibility and presets (authorised, audited)', async () => {
    await http().put('/v1/affiliation').set(as('teacher')).send({ profileCode: 'vtu', schemeCode: '2022' }).expect(403);
    await http().put('/v1/affiliation').set(as('principal')).send({ profileCode: 'vtu', schemeCode: '1999' }).expect(400);
    expect((await http().put('/v1/affiliation').set(as('principal')).send({ profileCode: 'vtu', schemeCode: '2022' }).expect(200)).body).toEqual({ profileCode: 'vtu', schemeCode: '2022' });
    const rules = (await http().get('/v1/affiliation/rules').set(as('teacher')).expect(200)).body;
    expect(rules.profile.shortName).toBe('VTU');
    expect(rules.rules.terminology).toMatchObject({ internalShort: 'CIE', registerNo: 'University Seat Number' });
    expect(rules.differences).toEqual([]);

    expect((await process()).body).toEqual({ students: 3, passed: 2, failed: 1 });
    const by = await results();
    // A: SEE 38% meets VTU's 35%, CIE 80%, 59 -> B (55-59), grade point 6. B: O, 10. C: CIE 30% < 40%: not eligible.
    expect(by(A)).toMatchObject({ outcome: 'pass', sgpa: 6 });
    expect(by(A).lines[0]).toMatchObject({ percent: 59, grade: 'B', gradePoint: 6, passed: true });
    expect(by(B).lines[0]).toMatchObject({ grade: 'O', gradePoint: 10 });
    expect(by(C)).toMatchObject({ outcome: 'fail', sgpa: 0 });
    expect(by(C).lines[0]).toMatchObject({ grade: 'NE', passed: false });
    expect(by(C).lines[0].reasons).toEqual(expect.arrayContaining(['internal', 'not_eligible']));
    const [stored] = (await owner.query('select rules_ref from exam_results where session_id = $1 limit 1', [sessionId])).rows;
    expect(stored.rules_ref).toEqual({ profile: 'vtu', scheme: '2022', version: 1, overridden: false });

    const e = await eligibility();
    expect(e.thresholdPct).toBe(85);
    expect(eligible(e, A)).toBe(false);

    const presets = (await http().get('/v1/scheme-presets').set(as('teacher')).expect(200)).body;
    expect(presets.affiliation).toMatchObject({ code: 'vtu', scheme: '2022' });
    expect(presets.schemes.affiliation.components.map((c: { code: string }) => c.code)).toEqual(['CIE-T', 'CIE-A', 'SEE']);
    expect((await http().post('/v1/grade-scales').set(as('principal')).send({ name: 'VTU', preset: 'affiliation' }).expect(201)).body.rules.pointsMode).toBe('band');

    const caps = (await http().get('/v1/institution/capabilities').set(as('teacher')).expect(200)).body;
    expect(caps.affiliation).toMatchObject({ profileCode: 'vtu', terminology: { externalShort: 'SEE' } });
    expect(caps.boardOrUniversity).toBe('Visvesvaraya Technological University');
    expect((await http().get('/v1/admin/institution/setup').set(as('principal')).expect(200)).body.affiliation).toMatchObject({ profileCode: 'vtu', scheme: '2022' });
    // Another institution is untouched.
    expect((await http().get('/v1/affiliation').set(as('otherPrincipal')).expect(200)).body.selected).toBeNull();
  });

  it('validates overrides, applies them and audits each changed value', async () => {
    await http().put('/v1/affiliation/overrides').set(as('principal')).send({ overrides: { attendance: { minPercent: 140 } }, reason: 'typo' }).expect(400);
    await http().put('/v1/affiliation/overrides').set(as('principal')).send({ overrides: { attendance: { minPercent: 80 } } }).expect(400); // a reason is required
    const saved = (await http().put('/v1/affiliation/overrides').set(as('principal')).send({ overrides: { attendance: { minPercent: 80, condonableToPercent: 75 } }, reason: 'Academic Council resolution 12/2026' }).expect(200)).body;
    expect(saved).toEqual({ overrides: { attendance: { minPercent: 80 } }, changed: ['attendance.minPercent'] });
    const e = await eligibility();
    expect(e.thresholdPct).toBe(80);
    expect(eligible(e, A)).toBe(true);
    const rules = (await http().get('/v1/affiliation/rules').set(as('principal')).expect(200)).body;
    expect(rules.differences).toEqual([{ path: 'attendance.minPercent', before: 85, after: 80 }]);
    const history = (await http().get('/v1/affiliation/history').set(as('principal')).expect(200)).body;
    expect(history[0]).toMatchObject({ action: 'affiliation.overrides_saved', data: { reason: 'Academic Council resolution 12/2026', changes: { 'attendance.minPercent': { before: 85, after: 80 } } } });
    expect(history.map((h: { action: string }) => h.action)).toContain('affiliation.selected');
  });

  it('lets a programme follow another scheme, then return to the institution\'s', async () => {
    await http().put(`/v1/affiliation/programmes/${t.program.id}`).set(as('principal')).send({ profileCode: 'bangalore-university', schemeCode: 'nep-2021' }).expect(200);
    const view = (await http().get('/v1/affiliation').set(as('principal')).expect(200)).body;
    expect(view.programmes.find((g: { programId: string }) => g.programId === t.program.id)).toMatchObject({ follows: 'own', profileCode: 'bangalore-university', schemeCode: 'nep-2021' });
    expect((await http().get(`/v1/affiliation/rules?programId=${t.program.id}`).set(as('principal')).expect(200)).body.source).toBe('programme');
    await process();
    let by = await results();
    expect(by(A).lines[0]).toMatchObject({ grade: 'F', passed: false }); // BU: 40% in SEE
    expect(by(B).lines[0]).toMatchObject({ grade: 'O', gradePoint: 9 });
    expect((await eligibility()).thresholdPct).toBe(75);

    await http().delete(`/v1/affiliation/programmes/${t.program.id}`).set(as('principal')).expect(200);
    await http().delete(`/v1/affiliation/programmes/${t.program.id}`).set(as('principal')).expect(404);
    await process();
    by = await results();
    expect(by(A).lines[0]).toMatchObject({ grade: 'B', passed: true });
  });

  it('gives the marks-card data of a published result in the profile\'s layout', async () => {
    await http().post(`/v1/exam-sessions/${sessionId}/publish`).set(as('principal')).expect(200);
    const card = (await http().get(`/v1/affiliation/marks-card/${t.students[A].id}?sessionId=${sessionId}`).set(as('parentA')).expect(200)).body;
    expect(card.title).toBe('Grade Card');
    expect(card.header.find((h: { field: string }) => h.field === 'registerNo')).toEqual({ field: 'registerNo', label: 'University Seat Number', value: 'R1' });
    expect(card.header.find((h: { field: string }) => h.field === 'universityName').value).toBe('Visvesvaraya Technological University');
    expect(card.header.find((h: { field: string }) => h.field === 'examMonthYear').value).toBe('November 2026');
    expect(card.subjects[0]).toMatchObject({ code: 'BCOM-3.1', internal: 40, internalMax: 50, external: 19, externalMax: 50, total: 59, grade: 'B', gradePoint: 6, creditPoints: 24, result: 'pass' });
    expect(card.summary.find((x: { field: string }) => x.field === 'sgpa').value).toBe(6);
    expect(card.result).toMatchObject({ passed: true, percentEquivalent: 60, classAwarded: 'First Class' });
    await http().get(`/v1/affiliation/marks-card/${t.students[B].id}?sessionId=${sessionId}`).set(as('parentA')).expect(404);
    await http().get(`/v1/affiliation/marks-card/${t.students[A].id}?sessionId=${sessionId}`).set(as('otherPrincipal')).expect(404);
  });

  it('reads a VTU result sheet into the marks history and installs the VTU tabulation register', async () => {
    const csv = ['USN,Student Name,Subject Code,Subject Name,Internal Marks,External Marks,Total,Result', 'R1,Student A,BCS301,Mathematics,40,35,75,P', 'R2,Student B,BCS301,Mathematics,30,,30,A'].join('\n');
    const dry = (await http().post('/v1/affiliation/result-sheet').set(as('principal')).send({ csv, academicYear: '2025-26', term: 2 }).expect(200)).body;
    expect(dry).toMatchObject({ profile: 'vtu', outcomes: { pass: 1, absent: 1 }, report: { dryRun: true, committed: false, totals: { rows: 2, created: 2, error: 0 } } });
    expect((await owner.query('select count(*)::int as n from legacy_marks where tenant_id = $1', [t.tenantId])).rows[0].n).toBe(0);
    const done = (await http().post('/v1/affiliation/result-sheet').set(as('principal')).send({ csv, academicYear: '2025-26', term: 2, dryRun: false }).expect(200)).body;
    expect(done.report).toMatchObject({ committed: true });
    const rows = (await owner.query('select roll_no, external_marks::float8 as external_marks, max_external::float8 as max_external, result from legacy_marks where tenant_id = $1 order by roll_no', [t.tenantId])).rows;
    expect(rows).toEqual([
      { roll_no: 'R1', external_marks: 35, max_external: 50, result: 'pass' },
      { roll_no: 'R2', external_marks: null, max_external: 50, result: 'fail' },
    ]);
    await http().post('/v1/affiliation/result-sheet').set(as('principal')).send({ csv: 'Name,Marks\nA,1', academicYear: '2025-26', term: 2 }).expect(400);
    await http().post('/v1/affiliation/result-sheet').set(as('teacher')).send({ csv, academicYear: '2025-26', term: 2 }).expect(403);

    const tpl = (await http().post('/v1/affiliation/tabulation-template').set(as('principal')).send({}).expect(200)).body;
    expect(tpl).toMatchObject({ code: 'vtu-2022', university: 'Visvesvaraya Technological University' });
    expect(tpl.config.pass).toEqual({ minInternalPercent: 40, minExternalPercent: 35, minTotalPercent: 40 });
  });

  it('changing the profile clears overrides made for the old one', async () => {
    await http().put('/v1/affiliation').set(as('principal')).send({ profileCode: 'bangalore-university' }).expect(200);
    const view = (await http().get('/v1/affiliation').set(as('principal')).expect(200)).body;
    expect(view.selected).toMatchObject({ profileCode: 'bangalore-university', schemeCode: 'sep-2024', overrides: {} });
    expect((await eligibility()).thresholdPct).toBe(75);
  });
});
