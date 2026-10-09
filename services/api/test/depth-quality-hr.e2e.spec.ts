import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

const R = (rupees: number) => rupees * 100;

describe('quality and HR depth: criteria trees, evidence engine, CQI loop, workload, evaluation, overtime, Form 16', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  // Tuesday 20 October 2026, 10:00 IST.
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(as(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(as(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(as(who)).send(body);
  const bin = (res: request.Response, cb: (e: Error | null, b: Buffer) => void) => {
    const d: Buffer[] = [];
    res.on('data', (c: Buffer) => d.push(c));
    res.on('end', () => cb(null, Buffer.concat(d)));
  };

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@qh.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
    return u;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    const hr = await addUser('Hema HR', 'hr_manager');
    const acct = await addUser('Anil Accounts', 'accountant');
    const hod = await addUser('Hari Hod', 'hod');
    const quality = await addUser('Qasim Quality', 'quality_officer');
    const [dept] = await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Commerce', headUserId: hod.id }).returning();
    app = await createApp(clock);
    tokens = {
      hr: await login(t.slug, hr.email!),
      accountant: await login(t.slug, acct.email!),
      hod: await login(t.slug, hod.email!),
      quality: await login(t.slug, quality.email!),
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      student: await login(t.slug, t.studentUser.email!),
    };
    Object.assign(ids, { hr: hr.id, hod: hod.id, quality: quality.id, dept: dept.id, teacher: t.teacher.id, teacher2: t.teacher2.id });
    const profile = (code: string, over: object = {}) => ({ employeeCode: code, employmentType: 'permanent', dateOfJoining: '2026-04-01', status: 'active', taxRegime: 'new', pan: 'ABCDE1234F', uan: '100200300400', expectedVersion: 0, ...over });
    await put('hr', `/v1/hr/staff/${t.teacher.id}`, profile('T001', { departmentId: dept.id })).expect(200);
    await put('hr', `/v1/hr/staff/${t.teacher2.id}`, profile('T002', { pan: 'ABCDE1234G' })).expect(200);
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('quality', () => {
    let fw: { id: string; criteria: { id: string; code: string; score: number | null; evidence: number }[] };
    const crit = (code: string) => fw.criteria.find((c) => c.code === code)!;
    const reload = async () => (fw = (await get('quality', `/v1/quality/frameworks/${fw.id}`).expect(200)).body);

    it('builds a criteria tree from a ready-made template, and scores it as figures arrive', async () => {
      await post('teacher', '/v1/quality/frameworks', { name: 'NAAC', template: 'naac' }).expect(403);
      const created = (await post('quality', '/v1/quality/frameworks', { name: 'NAAC 2026 cycle', template: 'naac', version: '2026' }).expect(201)).body;
      fw = { id: created.id, criteria: [] };
      await reload();
      expect(fw.criteria).toHaveLength(18);
      expect(fw.criteria.map((c) => c.code)).toEqual(expect.arrayContaining(['1', '2.1', '2.6', '5.2', '7.1']));
      expect((await get('quality', '/v1/quality/frameworks').expect(200)).body[0]).toMatchObject({ name: 'NAAC 2026 cycle', criteria: 18, withFigure: 0, score: null });

      const added = (await post('quality', `/v1/quality/frameworks/${fw.id}/criteria`, { parentId: crit('7').id, code: '7.2', title: 'Green campus', metric: 'Solar share', unit: '%', target: 40, weight: 2 }).expect(201)).body;
      await post('quality', `/v1/quality/frameworks/${fw.id}/criteria`, { code: '7.2', title: 'Duplicate' }).expect(409);
      await post('quality', `/v1/quality/frameworks/${fw.id}/criteria`, { parentId: '00000000-0000-4000-8000-000000000000', code: '9', title: 'Orphan' }).expect(400);

      // Only the owner can record a figure; changing the target needs an administrator.
      await put('quality', `/v1/quality/criteria/${added.id}`, { ownerId: ids.hod }).expect(200);
      await put('hod', `/v1/quality/criteria/${added.id}`, { target: 90 }).expect(403);
      await put('teacher', `/v1/quality/criteria/${added.id}`, { actual: 10 }).expect(403);
      await put('hod', `/v1/quality/criteria/${added.id}`, { actual: 20 }).expect(200);
      await reload();
      expect(crit('7.2').score).toBe(50); // 20 of 40
      expect(crit('7').score).toBe(50); // the parent is the mean of what has a figure
      expect((await get('quality', '/v1/quality/frameworks').expect(200)).body[0].score).toBe(50);
    });

    it('collects figures from other modules as dated evidence, once per criterion', async () => {
      await post('teacher', `/v1/quality/frameworks/${fw.id}/harvest`).expect(403);
      const first = (await post('quality', `/v1/quality/frameworks/${fw.id}/harvest`).expect(200)).body;
      expect(first.harvested).toBeGreaterThanOrEqual(3);
      expect(first.items.find((i: { code: string }) => i.code === '2.1')).toMatchObject({ source: 'students', value: 3 });
      await reload();
      const ev = (await get('quality', `/v1/quality/criteria/${crit('2.1').id}/evidence`).expect(200)).body;
      expect(ev).toHaveLength(1);
      expect(ev[0]).toMatchObject({ source: 'students' });
      expect(ev[0].title).toContain('Students on roll: 3');
      await post('quality', `/v1/quality/frameworks/${fw.id}/harvest`).expect(200);
      expect((await get('quality', `/v1/quality/criteria/${crit('2.1').id}/evidence`).expect(200)).body).toHaveLength(1); // refreshed, not duplicated
      expect((await get('quality', `/v1/quality/frameworks/${fw.id}`).expect(200)).body.criteria.find((c: { code: string }) => c.code === '2.1').actual).toBe(3);
    });

    it('takes manual evidence with a file, and keeps the file private to the quality team', async () => {
      const added = (await post('quality', `/v1/quality/criteria/${crit('7.1').id}/evidence`, { title: 'Best practice booklet', note: 'Printed 2026' }).expect(201)).body;
      await http().post(`/v1/quality/evidence/${added.id}/file`).set(as('quality')).attach('file', Buffer.from('not a real document'), 'proof.pdf').expect(400);
      const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
      const up = (await http().post(`/v1/quality/evidence/${added.id}/file`).set(as('quality')).attach('file', pdf, 'booklet.pdf').expect(201)).body;
      expect(up.fileName).toBe('booklet.pdf');
      const back = await get('quality', `/v1/quality/evidence/${added.id}/file`).buffer().parse(bin).expect(200);
      expect((back.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      await get('teacher', `/v1/quality/evidence/${added.id}/file`).expect(403);
      await http().post(`/v1/quality/evidence/${added.id}/file`).set(as('teacher')).attach('file', pdf, 'x.pdf').expect(403);
    });

    it('closes the CQI loop with a root cause and a re-measurement', async () => {
      const [co] = await db.insert(s.courseOutcomes).values({ tenantId: t.tenantId, coSetId: (await db.insert(s.coSets).values({ tenantId: t.tenantId, subjectId: t.subject.id, version: 1, status: 'active', createdBy: t.principal.id }).returning())[0].id, code: 'CO9', statement: 'Prepare final accounts', ord: 0 }).returning();
      const action = (await post('quality', `/v1/obe/programs/${t.program.id}/actions`, { scope: 'co', targetId: co.id, title: 'Remedial classes for CO9' }).expect(201)).body;
      await post('quality', `/v1/quality/actions/${action.id}/remeasure`, { value: 70 }).expect(409); // no baseline or target yet
      await put('quality', `/v1/quality/actions/${action.id}/root-cause`, { rootCause: 'Students lack ledger practice', baselineValue: 52, targetValue: 65, remeasureOn: '2026-12-01' }).expect(200);
      let loop = (await get('quality', `/v1/quality/cqi?programId=${t.program.id}`).expect(200)).body;
      expect(loop.items[0]).toMatchObject({ rootCause: 'Students lack ledger practice', state: 'planned' });
      clock.at = new Date('2026-12-02T04:30:00Z');
      loop = (await get('quality', '/v1/quality/cqi').expect(200)).body;
      expect(loop.items[0].state).toBe('awaiting_remeasure');
      const miss = (await post('quality', `/v1/quality/actions/${action.id}/remeasure`, { value: 58, note: 'Improved a little' }).expect(200)).body;
      expect(miss).toMatchObject({ state: 'not_effective', status: 'in_progress' });
      const hit = (await post('quality', `/v1/quality/actions/${action.id}/remeasure`, { value: 68 }).expect(200)).body;
      expect(hit).toMatchObject({ state: 'effective', status: 'done' });
      expect((await get('quality', '/v1/quality/cqi').expect(200)).body.summary).toMatchObject({ effective: 1, notEffective: 0 });
      clock.at = new Date('2026-10-20T04:30:00Z');
    });

    it('tags exam questions with outcomes and writes the outcome map attainment uses', async () => {
      const sess = (await post('principal', '/v1/exam-sessions', { academicYearId: t.section.academicYearId, programId: t.program.id, term: 3, name: 'Outcome test', startsOn: '2026-10-25', endsOn: '2026-11-20' }).expect(201)).body.id;
      const paper = (await post('principal', `/v1/exam-sessions/${sess}/papers`, { subjectId: t.subject.id, sectionId: t.section.id, examDate: '2026-11-05', startsAt: '10:00', endsAt: '13:00', maxMarks: 60 }).expect(201)).body;
      await put('principal', `/v1/evaluation/papers/${paper.id}/questions`, { questions: [{ no: '1', maxMarks: 20 }, { no: '2', maxMarks: 40 }] }).expect(200);
      const qs = await db.select().from(s.evalQuestions).where(eq(s.evalQuestions.tenantId, t.tenantId));
      const [set] = await db.select().from(s.coSets).where(eq(s.coSets.tenantId, t.tenantId));
      const cos = await db.select().from(s.courseOutcomes).where(eq(s.courseOutcomes.tenantId, t.tenantId));
      const coA = cos.find((c) => c.coSetId === set.id)!;
      const [script] = await db.insert(s.evalScripts).values({ tenantId: t.tenantId, paperId: paper.id, studentId: t.students[0].id, dummyNo: 'D1', uploadedBy: t.principal.id }).returning();
      const [alloc] = await db.insert(s.evalAllocations).values({ tenantId: t.tenantId, scriptId: script.id, paperId: paper.id, examinerId: t.teacher.id, round: 1, status: 'submitted' }).returning();
      const q1 = qs.find((q) => q.no === '1')!;
      const q2 = qs.find((q) => q.no === '2')!;
      await db.insert(s.evalMarks).values([{ tenantId: t.tenantId, allocationId: alloc.id, questionId: q1.id, marks: 15 }, { tenantId: t.tenantId, allocationId: alloc.id, questionId: q2.id, marks: 20 }]);

      await put('student', `/v1/quality/eval-questions/${q1.id}/co`, { coId: coA.id }).expect(403);
      await put('principal', `/v1/quality/eval-questions/${q1.id}/co`, { coId: '00000000-0000-4000-8000-000000000000' }).expect(400);
      await post('principal', `/v1/quality/exam-papers/${paper.id}/apply-outcome-map`).expect(409); // nothing tagged
      await put('principal', `/v1/quality/eval-questions/${q1.id}/co`, { coId: coA.id }).expect(200);
      const report = (await get('principal', `/v1/quality/exam-papers/${paper.id}/question-outcomes`).expect(200)).body;
      expect(report.untagged).toBe(1);
      expect(report.outcomeOptions.map((o: { code: string }) => o.code)).toEqual(['CO9']);
      expect(report.questions.find((q: { no: string }) => q.no === '1')).toMatchObject({ code: 'CO9', percent: 75 });
      expect(report.outcomes).toEqual([expect.objectContaining({ coId: coA.id, maxMarks: 20, percent: 75 })]);
      await put('principal', `/v1/quality/eval-questions/${q2.id}/co`, { coId: coA.id }).expect(200);
      expect((await post('principal', `/v1/quality/exam-papers/${paper.id}/apply-outcome-map`).expect(200)).body).toEqual({ mapped: 1 });
      const map = await db.select().from(s.assessmentCoMap).where(eq(s.assessmentCoMap.tenantId, t.tenantId));
      expect(map.find((m) => m.assessmentId === paper.assessmentId)).toMatchObject({ coId: coA.id, share: 1 });

      // A batch from a scanner: files are matched to roll numbers by a map; one bad roll number does not stop the rest.
      const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
      const url = `/v1/evaluation/papers/${paper.id}/scripts/bulk`;
      const send = (who: string, mapJson: unknown) => {
        let r = http().post(url).set(as(who)).field('map', JSON.stringify(mapJson));
        for (const f of ['scan-0001.png', 'scan-0002.png', 'scan-0003.png', 'scan-0004.png', 'scan-extra.png']) r = r.attach('files', PNG, { filename: f, contentType: 'image/png' });
        return r;
      };
      const mapping = [{ file: 'scan-0001.png', rollNo: 'R2' }, { file: 'scan-0002.png', rollNo: 'R2' }, { file: 'scan-0003.png', rollNo: 'R3' }, { file: 'scan-0004.png', rollNo: 'R9' }, { file: 'scan-0099.png', rollNo: 'R3' }];
      await send('teacher', mapping).expect(403);
      await send('principal', 'not json').expect(400);
      const done = (await send('principal', mapping).expect(201)).body;
      expect(done.uploaded.map((u: { rollNo: string; pages: number }) => [u.rollNo, u.pages])).toEqual([['R2', 2], ['R3', 1]]);
      expect(done.uploaded[0].dummyNo).toMatch(/^\d{7}$/);
      expect(done.failed).toEqual([{ rollNo: 'R9', error: expect.stringContaining('roll number') }]);
      expect(done.missing).toEqual(['scan-0099.png']);
      expect(done.unmapped).toEqual(['scan-extra.png']);
      const again = (await send('principal', mapping.slice(0, 3)).expect(201)).body;
      expect(again.uploaded).toEqual([]);
      expect(again.failed.map((f: { rollNo: string }) => f.rollNo)).toEqual(['R2', 'R3']); // already uploaded
    });

    it('removes a branch of the tree with its evidence', async () => {
      await reload();
      const gone = (await http().delete(`/v1/quality/criteria/${crit('7').id}`).set(as('quality')).expect(200)).body;
      expect(gone.removed).toBe(3); // 7, 7.1, 7.2
      await reload();
      expect(fw.criteria).toHaveLength(16); // 18 from the template and one added, less the three removed
    });
  });

  describe('faculty', () => {
    it('keeps qualifications and skills, verified by HR, and finds staff by them', async () => {
      await post('student', '/v1/hr/qualifications', { kind: 'skill', title: 'Tally' }).expect(403);
      await post('teacher', '/v1/hr/qualifications', { userId: ids.teacher2, kind: 'degree', title: 'M.Com' }).expect(403);
      const own = (await post('teacher', '/v1/hr/qualifications', { kind: 'degree', title: 'M.Com', institution: 'Bangalore University', year: 2012, level: 'Postgraduate' }).expect(201)).body;
      expect(own.verifiedAt).toBeNull();
      const phd = (await post('hr', '/v1/hr/qualifications', { userId: ids.teacher, kind: 'degree', title: 'PhD in Accounting', institution: 'Mysore University', year: 2019 }).expect(201)).body;
      expect(phd.verifiedAt).not.toBeNull();
      await post('teacher', `/v1/hr/qualifications/${own.id}/verify`).expect(403);
      expect((await post('hr', `/v1/hr/qualifications/${own.id}/verify`).expect(200)).body.verifiedAt).not.toBeNull();
      expect((await get('teacher', '/v1/hr/qualifications').expect(200)).body).toHaveLength(2);
      expect((await get('teacher2', '/v1/hr/qualifications').expect(200)).body).toHaveLength(0); // own record only
      expect((await get('hr', '/v1/hr/qualifications/search?q=phd').expect(200)).body[0]).toMatchObject({ fullName: t.teacher.fullName, title: 'PhD in Accounting' });
      await get('hr', '/v1/hr/qualifications/search?q=p').expect(400);
      await http().delete(`/v1/hr/qualifications/${own.id}`).set(as('teacher2')).expect(404);
      await http().delete(`/v1/hr/qualifications/${own.id}`).set(as('teacher')).expect(200);
    });

    it('reports teaching hours against the norm, and a head of department sees only their department', async () => {
      const all = (await get('hr', '/v1/hr/workload?norm=16').expect(200)).body;
      const row = all.teachers.find((r: { userId: string }) => r.userId === ids.teacher);
      expect(row).toMatchObject({ hoursPerWeek: 0.9, periods: 1, classes: 1, subjects: 1, load: 'under', department: 'Commerce' });
      expect(all.summary.under).toBeGreaterThanOrEqual(1);
      expect((await get('hr', '/v1/hr/workload?norm=1').expect(200)).body.teachers.find((r: { userId: string }) => r.userId === ids.teacher).load).toBe('within');
      const dept = (await get('hod', '/v1/hr/workload').expect(200)).body.teachers;
      expect(dept.map((r: { userId: string }) => r.userId)).toEqual([ids.teacher]); // teacher2 is in no department
      await get('teacher', '/v1/hr/workload').expect(403);
    });

    it('collects student, head of department, peer and self ratings into one score', async () => {
      const full = (n: number) => Object.fromEntries(['clarity', 'preparation', 'punctuality', 'engagement', 'fairness', 'support'].map((k) => [k, n]));
      expect((await get('teacher', '/v1/hr/evaluations/criteria').expect(200)).body.criteria).toHaveLength(6);
      expect((await get('student', '/v1/hr/evaluations/to-rate').expect(200)).body).toEqual([expect.objectContaining({ staffUserId: ids.teacher, rated: false })]);
      await post('student', '/v1/hr/evaluations', { staffUserId: ids.teacher, raterKind: 'student', scores: { clarity: 4 } }).expect(400);
      await post('student', '/v1/hr/evaluations', { staffUserId: ids.teacher2, raterKind: 'student', scores: full(4) }).expect(403); // does not teach this class
      await post('student', '/v1/hr/evaluations', { staffUserId: ids.teacher, raterKind: 'hod', scores: full(4) }).expect(403);
      await post('student', '/v1/hr/evaluations', { staffUserId: ids.teacher, raterKind: 'student', scores: full(4), comment: 'Clear explanations' }).expect(201);
      await post('student', '/v1/hr/evaluations', { staffUserId: ids.teacher, raterKind: 'student', scores: full(4) }).expect(409);
      expect((await get('student', '/v1/hr/evaluations/to-rate').expect(200)).body[0].rated).toBe(true);
      await post('teacher2', '/v1/hr/evaluations', { staffUserId: ids.teacher, raterKind: 'hod', scores: full(5) }).expect(403);
      await post('hod', '/v1/hr/evaluations', { staffUserId: ids.teacher, raterKind: 'hod', scores: full(5), comment: 'Well prepared' }).expect(201);
      await post('teacher', '/v1/hr/evaluations', { staffUserId: ids.teacher, raterKind: 'peer', scores: full(3) }).expect(403); // not your own peer rating
      await post('teacher2', '/v1/hr/evaluations', { staffUserId: ids.teacher, raterKind: 'peer', scores: full(3) }).expect(201);
      await post('teacher2', '/v1/hr/evaluations', { staffUserId: ids.teacher, raterKind: 'self', scores: full(5) }).expect(403);
      await post('teacher', '/v1/hr/evaluations', { staffUserId: ids.teacher, raterKind: 'self', scores: full(5) }).expect(201);

      const report = (await get('teacher', '/v1/hr/evaluations/report').expect(200)).body;
      expect(report.composite).toBe(4.3); // (4x40 + 5x30 + 3x15 + 5x15) / 100
      expect(report.kinds.find((k: { kind: string }) => k.kind === 'student')).toMatchObject({ count: 1, average: 4 });
      expect(report.comments.map((c: { comment: string }) => c.comment).sort()).toEqual(['Clear explanations', 'Well prepared']);
      expect(JSON.stringify(report)).not.toContain(t.studentUser.id); // the student is not named
      await get('teacher2', `/v1/hr/evaluations/report?staffUserId=${ids.teacher}`).expect(403);
      expect((await get('hod', `/v1/hr/evaluations/report?staffUserId=${ids.teacher}`).expect(200)).body.composite).toBe(4.3);
      expect((await get('hr', `/v1/hr/evaluations/report?staffUserId=${ids.teacher}`).expect(200)).body.composite).toBe(4.3);
    });
  });

  describe('payroll extras', () => {
    let run: { id: string; version: number; payslips: { user: { id: string }; grossPaise: number; netPaise: number; earnings: { code: string; amountPaise: number }[]; deductions: { code: string; amountPaise: number }[] }[] };
    let otId: string;

    it('lists active staff to choose from, for payroll staff only', async () => {
      await get('teacher', '/v1/hr/payroll/staff-options').expect(403);
      const staff = (await get('accountant', '/v1/hr/payroll/staff-options').expect(200)).body as { id: string; employeeCode: string }[];
      expect(staff.map((x) => x.employeeCode).sort()).toEqual(['T001', 'T002']);
    });

    it('works out overtime from the salary, and holds it for approval', async () => {
      const comps = (await get('accountant', '/v1/payroll/components').expect(200)).body as { id: string; code: string }[];
      const c = Object.fromEntries(comps.map((x) => [x.code, x.id]));
      ids.basic = c.BASIC;
      ids.hra = c.HRA;
      await put('accountant', `/v1/payroll/structures/${ids.teacher}`, { effectiveFrom: '2026-04-01', lines: [{ componentId: c.BASIC, monthlyPaise: R(50_000) }, { componentId: c.HRA, monthlyPaise: R(10_000) }] }).expect(200);
      await post('teacher', '/v1/hr/payroll/adjustments', { userId: ids.teacher, kind: 'overtime', payMonth: '2026-10', hours: 10, reason: 'Valuation duty' }).expect(403);
      await post('accountant', '/v1/hr/payroll/adjustments', { userId: ids.teacher, kind: 'overtime', payMonth: '2026-10', reason: 'No hours' }).expect(400);
      const ot = (await post('accountant', '/v1/hr/payroll/adjustments', { userId: ids.teacher, kind: 'overtime', payMonth: '2026-10', hours: 10, reason: 'Valuation duty after hours' }).expect(201)).body;
      otId = ot.id;
      expect(ot).toMatchObject({ status: 'pending', amountPaise: R(5_769) }); // 60,000 / 26 days / 8 hours x 10 hours x 2
      const bonus = (await post('accountant', '/v1/hr/payroll/adjustments', { userId: ids.teacher, kind: 'recovery', payMonth: '2026-10', amountPaise: R(1_000), reason: 'Advance recovery' }).expect(201)).body;
      await post('accountant', `/v1/hr/payroll/adjustments/${otId}/decide`, { approve: true }).expect(403);
      await post('principal', `/v1/hr/payroll/adjustments/${otId}/decide`, { approve: true }).expect(200);
      await post('principal', `/v1/hr/payroll/adjustments/${otId}/decide`, { approve: true }).expect(409);
      await post('principal', `/v1/hr/payroll/adjustments/${bonus.id}/decide`, { approve: true }).expect(200);
    });

    it('computes the arrears of a salary revision once', async () => {
      await post('accountant', '/v1/hr/payroll/adjustments/revision-arrears', { userId: ids.teacher, payMonth: '2026-10' }).expect(409); // only one structure
      await put('accountant', `/v1/payroll/structures/${ids.teacher}`, { effectiveFrom: '2026-08-01', lines: [{ componentId: ids.basic, monthlyPaise: R(58_000) }, { componentId: ids.hra, monthlyPaise: R(12_000) }] }).expect(200);
      const arrears = (await post('accountant', '/v1/hr/payroll/adjustments/revision-arrears', { userId: ids.teacher, payMonth: '2026-10' }).expect(201)).body;
      expect(arrears).toMatchObject({ kind: 'arrear', amountPaise: R(20_000), ratePaise: R(10_000) }); // Rs 10,000 more a month for August and September
      await post('accountant', '/v1/hr/payroll/adjustments/revision-arrears', { userId: ids.teacher, payMonth: '2026-10' }).expect(409);
      await post('principal', `/v1/hr/payroll/adjustments/${arrears.id}/decide`, { approve: true }).expect(200);
    });

    it('puts approved adjustments on the payslip, and locks them with the run', async () => {
      run = (await post('accountant', '/v1/payroll/runs', { month: '2026-10' }).expect(201)).body;
      const slip = run.payslips.find((p) => p.user.id === ids.teacher)!;
      expect(slip.earnings.map((e) => e.code)).toEqual(expect.arrayContaining(['OT', 'ARR']));
      expect(slip.earnings.find((e) => e.code === 'OT')!.amountPaise).toBe(R(5_769));
      expect(slip.earnings.find((e) => e.code === 'ARR')!.amountPaise).toBe(R(20_000));
      expect(slip.grossPaise).toBe(R(70_000 + 5_769 + 20_000));
      expect(slip.deductions.find((d) => d.code === 'REC')!.amountPaise).toBe(R(1_000));
      const approved = (await post('principal', `/v1/payroll/runs/${run.id}/approve`, { expectedVersion: run.version }).expect(200)).body;
      await post('principal', `/v1/payroll/runs/${run.id}/lock`, { expectedVersion: approved.version }).expect(200);
      await post('accountant', '/v1/hr/payroll/adjustments', { userId: ids.teacher, kind: 'bonus', payMonth: '2026-10', amountPaise: R(500), reason: 'Late' }).expect(409); // locked month
      expect((await get('accountant', '/v1/hr/payroll/adjustments?month=2026-10').expect(200)).body.filter((a: { runId: string | null }) => a.runId === run.id)).toHaveLength(3);
    });

    it('tracks tax deposits against deductions and prints Form 16 for the employee', async () => {
      await get('teacher', `/v1/hr/payroll/form16/${ids.teacher}?fy=2026-27`).expect(409); // no TAN yet
      await put('accountant', '/v1/hr/payroll/tax-profile', { tan: 'BLRA12345B', pan: 'ABCDE1234F', deductorName: 'Soundarya Institute' }).expect(403);
      await put('principal', '/v1/hr/payroll/tax-profile', { tan: 'bad', pan: 'ABCDE1234F', deductorName: 'Soundarya Institute' }).expect(400);
      await put('principal', '/v1/hr/payroll/tax-profile', { tan: 'BLRA12345B', pan: 'ABCDE1234F', deductorName: 'Soundarya Institute', deductorAddress: 'Bengaluru', responsiblePerson: 'Principal', responsibleDesignation: 'Principal' }).expect(200);
      await post('teacher', '/v1/hr/payroll/challans', { payMonth: '2026-10', bsrCode: '0510308', challanSerial: '00001', depositedOn: '2026-11-05', tdsPaise: 100 }).expect(403);
      await post('accountant', '/v1/hr/payroll/challans', { payMonth: '2026-10', bsrCode: '051', challanSerial: '00001', depositedOn: '2026-11-05', tdsPaise: 100 }).expect(400);
      await post('accountant', '/v1/hr/payroll/challans', { payMonth: '2026-10', bsrCode: '0510308', challanSerial: '00001', depositedOn: '2026-11-05', tdsPaise: 100 }).expect(201);
      await post('accountant', '/v1/hr/payroll/challans', { payMonth: '2026-10', bsrCode: '0510308', challanSerial: '00001', depositedOn: '2026-11-05', tdsPaise: 100 }).expect(409);

      const tds = run.payslips.find((p) => p.user.id === ids.teacher)!.deductions.find((d) => d.code === 'TDS')?.amountPaise ?? 0;
      const sum = (await get('accountant', '/v1/hr/payroll/tds-summary?fy=2026-27').expect(200)).body;
      expect(sum.months.find((m: { month: string }) => m.month === '2026-10')).toMatchObject({ quarter: 'Q3', depositedPaise: 100 });
      expect(sum.deductedPaise).toBeGreaterThanOrEqual(tds);
      expect(sum.shortMonths.includes('2026-10')).toBe(sum.deductedPaise > 100);

      const doc = (await get('teacher', `/v1/hr/payroll/form16/${ids.teacher}?fy=2026-27`).buffer().parse(bin).expect(200)).body as Buffer;
      const text = doc.toString('latin1');
      expect(text).toContain('FORM 16');
      expect(text).toContain('BLRA12345B');
      expect(text).toContain('0510308');
      await get('teacher2', `/v1/hr/payroll/form16/${ids.teacher}?fy=2026-27`).expect(403);
      expect((await get('accountant', `/v1/hr/payroll/form16/${ids.teacher}?fy=2026-27`).buffer().parse(bin).expect(200)).body.length).toBeGreaterThan(500);
      await get('accountant', `/v1/hr/payroll/form16/${ids.teacher2}?fy=2026-27`).expect(404); // no locked pay for them
    });
  });
});
