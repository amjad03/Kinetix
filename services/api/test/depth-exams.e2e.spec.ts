import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { Readable } from 'node:stream';
import { ObjectStorage } from '../src/storage/storage.service.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('exam depth: timed paper release, practicals, normalisation, classes, approval, reports', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(new Date('2026-11-01T05:00:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const ids: Record<string, string> = {};
  const cos: string[] = [];
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
  const pdf = async (who: string, url: string, status = 200) => (await get(who, url).buffer().parse(bin).expect(status)).body as Buffer;
  const [A, B, C] = [0, 1, 2];

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@dx.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
    return u;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    const controller = await addUser('Esha Controller', 'exam_controller');
    const [set] = await db.insert(s.coSets).values({ tenantId: t.tenantId, subjectId: t.subject.id, version: 1, status: 'active', createdBy: t.principal.id }).returning();
    for (const [i, code] of ['CO1', 'CO2', 'CO3'].entries()) {
      const [co] = await db.insert(s.courseOutcomes).values({ tenantId: t.tenantId, coSetId: set.id, code, statement: `Outcome ${code}`, ord: i }).returning();
      cos.push(co.id);
    }
    const bloom = ['remember', 'understand', 'apply', 'analyze'];
    const diff = ['easy', 'medium', 'hard'];
    await db.insert(s.qbQuestions).values(
      Array.from({ length: 24 }, (_, i) => ({ tenantId: t.tenantId, subjectId: t.subject.id, topic: `Topic ${i % 4}`, coId: cos[i % 3], bloom: bloom[i % 4], difficulty: diff[i % 3], marks: i < 16 ? 2 : 5, type: i < 16 ? 'short' : 'long', text: `Explain concept number ${i} of corporate accounting with the zebra${i} ledger treatment`, answer: `Answer ${i}`, status: 'approved', authorId: t.teacher.id })),
    );
    app = await createApp(clock);
    tokens = {
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      controller: await login(t.slug, controller.email!),
      parentA: await login(t.slug, t.guardian.email!),
      parentB: await login(t.slug, t.guardian2.email!),
      student: await login(t.slug, t.studentUser.email!),
    };
    ids.controller = controller.id;
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('reports which questions have been used, and seals a locked paper until its release time', async () => {
    const bp = (await post('teacher', '/v1/question-bank/blueprints', {
      subjectId: t.subject.id,
      title: 'Release test',
      totalMarks: 18,
      durationMinutes: 90,
      sections: [
        { name: 'Section A', count: 4, questionMarks: 2, type: 'short', bloom: { remember: 1, apply: 1 }, difficulty: { easy: 1, hard: 1 }, coverage: [cos[0], cos[1]] },
        { name: 'Section B', count: 2, questionMarks: 5, bloom: { analyze: 1 }, coverage: [cos[2]] },
      ],
    }).expect(201)).body;
    ids.paper = (await post('teacher', '/v1/question-bank/papers', { blueprintId: bp.id, title: 'Sealed paper', seed: 'alpha' }).expect(201)).body.id;

    const usage = (await get('principal', `/v1/question-bank/usage?subjectId=${t.subject.id}`).expect(200)).body;
    expect(usage.total).toBe(24);
    expect(usage.unused).toBe(18);
    expect(usage.questions[0].papers).toBe(1);
    expect(usage.questions[23].papers).toBe(0);
    const used = (await get('principal', `/v1/question-bank/questions/${usage.questions[0].id}/usage`).expect(200)).body;
    expect(used[0]).toMatchObject({ title: 'Sealed paper' });
    await get('teacher', '/v1/question-bank/usage').expect(403);

    const at = '2026-11-02T04:00:00.000Z';
    await post('principal', `/v1/question-bank/papers/${ids.paper}/release`, { releaseAt: at, controllerId: ids.controller }).expect(409); // not locked yet
    await owner.query("update qb_papers set status = 'locked', locked_at = now() where id = $1", [ids.paper]);
    await post('principal', `/v1/question-bank/papers/${ids.paper}/release`, { releaseAt: '2026-10-01T00:00:00.000Z', controllerId: ids.controller }).expect(409); // in the past
    await post('principal', `/v1/question-bank/papers/${ids.paper}/release`, { releaseAt: at, controllerId: t.teacher.id }).expect(409); // not an exam controller
    const sched = (await post('principal', `/v1/question-bank/papers/${ids.paper}/release`, { releaseAt: at, controllerId: ids.controller }).expect(200)).body;
    expect(sched).toMatchObject({ status: 'scheduled', state: 'sealed' });

    // Sealed for everyone, the setter included, until the time comes.
    await get('teacher', `/v1/question-bank/papers/${ids.paper}/paper.pdf`).expect(403);
    expect((await get('controller', '/v1/question-bank/releases/mine').expect(200)).body[0]).toMatchObject({ title: 'Sealed paper', state: 'sealed' });
    expect((await get('principal', '/v1/question-bank/releases').expect(200)).body[0]).toMatchObject({ title: 'Sealed paper', controller: 'Esha Controller', state: 'sealed' });
    await get('teacher', '/v1/question-bank/releases').expect(403);
    await get('controller', `/v1/question-bank/releases/${ids.paper}/paper.pdf`).expect(403);
    await get('teacher', `/v1/question-bank/releases/${ids.paper}/paper.pdf`).expect(403); // not a controller

    clock.at = new Date('2026-11-02T04:00:01Z');
    expect((await get('controller', '/v1/question-bank/releases/mine').expect(200)).body[0].state).toBe('released');
    const copy = await pdf('controller', `/v1/question-bank/releases/${ids.paper}/paper.pdf`);
    expect(copy.subarray(0, 5).toString()).toBe('%PDF-');
    await get('teacher', `/v1/question-bank/papers/${ids.paper}/paper.pdf`).expect(200); // open to the setter once released
    await post('principal', `/v1/question-bank/papers/${ids.paper}/release/cancel`).expect(409); // too late to cancel
    const audit = (await owner.query("select count(*)::int as n from audit_log where tenant_id = $1 and action = 'qb.paper.released_copy_downloaded'", [t.tenantId])).rows[0].n;
    expect(audit).toBe(1);
    clock.at = new Date('2026-11-01T05:00:00Z');
  });

  let comps: { id: string; code: string }[];
  let scaleId: string;
  let sessionId: string;
  let iaId: string;
  let seeId: string;

  it('normalises a whole assessment with a preview, keeps the original marks, and can undo', async () => {
    scaleId = (await post('principal', '/v1/grade-scales', { name: 'BU NEP', preset: 'bu-nep', isDefault: true }).expect(201)).body.id;
    comps = (await put('principal', '/v1/schemes', {
      subjectId: t.subject.id,
      academicYearId: t.section.academicYearId,
      name: 'BU NEP theory',
      credits: 4,
      gradeScaleId: scaleId,
      passRules: { minInternalPercent: null, minExternalPercent: 40, minTotalPercent: 40 },
      components: [{ code: 'IA', name: 'Internal assessment', kind: 'internal', weight: 40 }, { code: 'SEE', name: 'Semester end exam', kind: 'external', weight: 60 }],
    }).expect(200)).body.components;
    iaId = (await post('teacher', '/v1/assessments', { sectionId: t.section.id, subjectId: t.subject.id, title: 'Internal assessment', kind: 'internal', maxMarks: 40, heldOn: '2026-10-20', componentId: comps[0].id }).expect(201)).body.id;
    await http().put(`/v1/assessments/${iaId}/marks`).set(as('teacher')).send({ entries: [32, 20, 40].map((marks, i) => ({ studentId: t.students[i].id, marks })) }).expect(200);
    await post('principal', `/v1/exam-ops/normalise/${iaId}`, { method: 'scale', value: 1.1, reason: 'Paper was harder than planned' }).expect(409); // not verified yet
    await post('teacher', `/v1/assessments/${iaId}/submit`).expect(200);
    await post('principal', `/v1/assessments/${iaId}/verify`).expect(200);

    await post('teacher', `/v1/exam-ops/normalise/${iaId}`, { method: 'scale', value: 1.1, reason: 'Harder paper' }).expect(403);
    await post('principal', `/v1/exam-ops/normalise/${iaId}`, { method: 'scale', value: 1.1, reason: 'x' }).expect(400);
    const preview = (await post('principal', `/v1/exam-ops/normalise/${iaId}`, { method: 'scale', value: 1.1, reason: 'Paper was harder than planned', preview: true }).expect(200)).body;
    expect(preview).toMatchObject({ preview: true, students: 3, changed: 2, meanBefore: 30.67 });
    expect(preview.changes.map((c: { after: number }) => c.after).sort()).toEqual([22, 35.2]); // the full-marks student stays at 40
    expect((await get('teacher', `/v1/assessments/${iaId}`).expect(200)).body.students[A].moderatedMarks).toBeNull(); // preview saved nothing

    const applied = (await post('principal', `/v1/exam-ops/normalise/${iaId}`, { method: 'scale', value: 1.1, reason: 'Paper was harder than planned' }).expect(200)).body;
    expect(applied).toMatchObject({ preview: false, changed: 2 });
    const detail = (await get('teacher', `/v1/assessments/${iaId}`).expect(200)).body;
    expect(detail.markStatus).toBe('moderated');
    expect(detail.students[A]).toMatchObject({ marks: 32, moderatedMarks: 35.2 }); // the original stays
    expect((await get('principal', `/v1/exam-ops/normalisations?assessmentId=${iaId}`).expect(200)).body[0]).toMatchObject({ method: 'scale', affected: 2, revertedAt: null });

    await post('principal', `/v1/exam-ops/normalisations/${applied.id}/revert`).expect(200);
    await post('principal', `/v1/exam-ops/normalisations/${applied.id}/revert`).expect(409);
    expect((await get('teacher', `/v1/assessments/${iaId}`).expect(200)).body.students[A].moderatedMarks).toBeNull();
    await post('principal', `/v1/exam-ops/normalise/${iaId}`, { method: 'scale', value: 1.1, reason: 'Paper was harder than planned' }).expect(200);
  });

  it('schedules practical and viva sittings with examiners, and records their marks', async () => {
    sessionId = (await post('principal', '/v1/exam-sessions', { academicYearId: t.section.academicYearId, programId: t.program.id, term: 3, name: 'Semester 3 end exam Nov 2026', startsOn: '2026-11-02', endsOn: '2026-11-20' }).expect(201)).body.id;
    const body = { subjectId: t.subject.id, kind: 'practical', batchLabel: 'Batch 1', roomId: t.room.id, slotDate: '2026-11-10', startsAt: '10:00', endsAt: '12:00', internalExaminerId: t.teacher.id, externalExaminerName: 'Dr Rao', externalExaminerOrg: 'GFGC Mysuru', maxMarks: 25, studentIds: [t.students[A].id, t.students[B].id] };
    await post('teacher', `/v1/exam-sessions/${sessionId}/practicals`, body).expect(403);
    await post('principal', `/v1/exam-sessions/${sessionId}/practicals`, { ...body, endsAt: '09:00' }).expect(400);
    const opts = (await get('principal', '/v1/exam-ops/options').expect(200)).body;
    expect(opts.sessions.map((x: { id: string }) => x.id)).toContain(sessionId);
    expect(opts.controllers.map((x: { fullName: string }) => x.fullName)).toEqual(['Esha Controller']);
    expect(opts.staff.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining([t.teacher.id, t.teacher2.id]));
    expect(opts.normalisable.map((x: { id: string }) => x.id)).toContain(iaId);
    await post('principal', `/v1/exam-sessions/${sessionId}/practicals`, { ...body, studentIds: undefined }).expect(400); // no candidates
    const slot = (await post('principal', `/v1/exam-sessions/${sessionId}/practicals`, body).expect(201)).body;
    await post('principal', `/v1/exam-sessions/${sessionId}/practicals`, { ...body, roomId: null, startsAt: '11:00', endsAt: '13:00' }).expect(409); // same examiner
    await post('principal', `/v1/exam-sessions/${sessionId}/practicals`, { ...body, internalExaminerId: t.teacher2.id, startsAt: '11:00', endsAt: '13:00' }).expect(409); // same room
    const viva = (await post('principal', `/v1/exam-sessions/${sessionId}/practicals`, { ...body, kind: 'viva', batchLabel: 'Batch 2', startsAt: '12:00', endsAt: '13:00', studentIds: undefined, sectionId: t.section.id }).expect(201)).body; // back to back is fine, and a whole class can sit

    const mine = (await get('teacher', '/v1/practicals/mine').expect(200)).body;
    expect(mine).toHaveLength(2);
    expect(mine[0]).toMatchObject({ subject: 'Corporate Accounting', room: 'Room 1', externalExaminerName: 'Dr Rao' });
    expect(mine[0].candidates.map((c: { rollNo: string }) => c.rollNo)).toEqual(['R1', 'R2']);
    expect(mine[1].candidates).toHaveLength(3); // the class
    expect(viva.id).toBeTruthy();

    await post('teacher2', `/v1/practicals/${slot.id}/marks`, { entries: [{ studentId: t.students[A].id, present: true, marks: 20 }] }).expect(403);
    await post('teacher', `/v1/practicals/${slot.id}/marks`, { entries: [{ studentId: t.students[A].id, present: true, marks: 30 }] }).expect(400);
    await post('teacher', `/v1/practicals/${slot.id}/marks`, { entries: [{ studentId: t.students[C].id, present: true, marks: 10 }] }).expect(400); // not in this sitting
    expect((await post('teacher', `/v1/practicals/${slot.id}/marks`, { entries: [{ studentId: t.students[A].id, present: true, marks: 22 }] }).expect(200)).body).toMatchObject({ status: 'scheduled', pending: 1 });
    expect((await post('teacher', `/v1/practicals/${slot.id}/marks`, { entries: [{ studentId: t.students[B].id, present: false }] }).expect(200)).body).toMatchObject({ status: 'done', pending: 0 });
    const done = (await get('principal', `/v1/exam-sessions/${sessionId}/practicals`).expect(200)).body[0];
    expect(done.candidates).toEqual(expect.arrayContaining([expect.objectContaining({ rollNo: 'R1', present: true, marks: 22 }), expect.objectContaining({ rollNo: 'R2', present: false, marks: null })]));
    await post('principal', `/v1/practicals/${slot.id}/cancel`).expect(409); // already done

    // The examiner can also type a sheet: "roll no, marks", with A for absent.
    await post('teacher', `/v1/practicals/${viva.id}/marks`, { sheet: 'R1, 8\nr2, 9.5' }).expect(200);
    await post('teacher', `/v1/practicals/${viva.id}/marks`, { sheet: 'R9, 8' }).expect(400); // not in this sitting
    await post('teacher', `/v1/practicals/${viva.id}/marks`, { sheet: 'R3, lots' }).expect(400);
    await post('teacher', `/v1/practicals/${viva.id}/marks`, { sheet: 'R1, 30' }).expect(400); // more than the maximum of 25
    expect((await post('teacher', `/v1/practicals/${viva.id}/marks`, { sheet: 'R3, A' }).expect(200)).body).toMatchObject({ status: 'done', pending: 0 });
    const sheeted = (await get('principal', `/v1/exam-sessions/${sessionId}/practicals`).expect(200)).body.find((x: { id: string }) => x.id === viva.id);
    expect(sheeted.candidates).toEqual(expect.arrayContaining([expect.objectContaining({ rollNo: 'R2', present: true, marks: 9.5 }), expect.objectContaining({ rollNo: 'R3', present: false, marks: null })]));
  });

  it('processes the session, classifies the results, and prints the consolidated sheet', async () => {
    const p1 = (await post('principal', `/v1/exam-sessions/${sessionId}/papers`, { subjectId: t.subject.id, sectionId: t.section.id, examDate: '2026-11-05', startsAt: '10:00', endsAt: '13:00', maxMarks: 60 }).expect(201)).body;
    seeId = p1.assessmentId;
    await get('principal', `/v1/exam-sessions/${sessionId}/classification`).expect(409); // nothing processed
    await http().put(`/v1/assessments/${seeId}/marks`).set(as('teacher')).send({ entries: [45, 24, 23].map((marks, i) => ({ studentId: t.students[i].id, marks })) }).expect(200);
    await post('teacher', `/v1/assessments/${seeId}/submit`).expect(200);
    await post('principal', `/v1/assessments/${seeId}/verify`).expect(200);
    await post('principal', `/v1/exam-sessions/${sessionId}/schedule`).expect(200);

    // The student's profile photo is printed on the hall ticket.
    expect((await post('principal', `/v1/exam-sessions/${sessionId}/hall-tickets`, {}).expect(200)).body.issued).toBe(3);
    const plain = await pdf('student', `/v1/exam-sessions/${sessionId}/hall-tickets/${t.students[C].id}/pdf`);
    expect(plain.toString('latin1')).not.toContain('/Subtype /Image');
    const jpeg = Buffer.from('ffd8ffe000104a46494600010100000100010000ffc0000b080001000101011100ffd9', 'hex');
    const key = `tenants/${t.tenantId}/profile/photo-test`;
    await app.get(ObjectStorage).put(key, Readable.from(jpeg), 1_000_000, 'image/jpeg');
    await owner.query('update users set photo_key = $2 where id = $1', [t.studentUser.id, key]);
    const withPhoto = await pdf('student', `/v1/exam-sessions/${sessionId}/hall-tickets/${t.students[C].id}/pdf`);
    expect(withPhoto.toString('latin1')).toContain('/Subtype /Image');
    expect(withPhoto.toString('latin1')).toContain('/Filter /DCTDecode');
    await post('principal', `/v1/exam-sessions/${sessionId}/process`).expect(200);

    // A: IA 40 x 1.1 -> 35.2 plus SEE 45 = 80.2. B: 22 + 24 = 46. C fails the external minimum.
    const cls = (await get('principal', `/v1/exam-sessions/${sessionId}/classification`).expect(200)).body;
    expect(cls.bands.map((b: { name: string }) => b.name)).toEqual(['Distinction', 'First class', 'Second class', 'Pass class']);
    const by = (roll: string) => cls.students.find((r: { rollNo: string }) => r.rollNo === roll);
    expect(by('R1')).toMatchObject({ percent: 80.2, class: 'Distinction', rank: 1, distinctions: 1 });
    expect(by('R2')).toMatchObject({ percent: 46, class: 'Pass class', rank: 2 });
    expect(by('R3')).toMatchObject({ class: 'Fail', rank: null });

    await put('teacher', '/v1/exam-ops/class-bands', { bands: [{ name: 'Good', minPercent: 40 }] }).expect(403);
    await put('principal', '/v1/exam-ops/class-bands', { bands: [] }).expect(400);
    await put('principal', '/v1/exam-ops/class-bands', { bands: [{ name: 'Good', minPercent: 40 }, { name: 'Outstanding', minPercent: 80 }] }).expect(200);
    const again = (await get('principal', `/v1/exam-sessions/${sessionId}/classification`).expect(200)).body;
    expect(again.students.find((r: { rollNo: string }) => r.rollNo === 'R1')).toMatchObject({ class: 'Outstanding' });
    expect(again.students.find((r: { rollNo: string }) => r.rollNo === 'R2')).toMatchObject({ class: 'Good' });

    const sheet = await pdf('principal', `/v1/exam-sessions/${sessionId}/consolidated.pdf`);
    expect(sheet.subarray(0, 5).toString()).toBe('%PDF-');
    expect(sheet.toString('latin1')).toContain('Outstanding');
    await get('teacher', `/v1/exam-sessions/${sessionId}/consolidated.pdf`).expect(403);
  });

  it('holds publication until the approval route has approved the results', async () => {
    await db.insert(s.workflowDefinitions).values({ tenantId: t.tenantId, requestType: 'result_publish', name: 'Result publication', fields: [], steps: [{ name: 'Principal approval', approver: { kind: 'role', role: 'principal' } }], active: true, createdBy: t.principal.id });
    expect((await get('principal', `/v1/exam-sessions/${sessionId}/publish-approval`).expect(200)).body).toMatchObject({ required: true, approved: false, request: null });
    expect((await post('principal', `/v1/exam-sessions/${sessionId}/publish`).expect(409)).body.message).toMatch(/approval/);
    await post('teacher', `/v1/exam-sessions/${sessionId}/request-publish`).expect(403);
    const req = (await post('controller', `/v1/exam-sessions/${sessionId}/request-publish`).expect(200)).body;
    expect(req.requestId).toBeTruthy();
    await post('controller', `/v1/exam-sessions/${sessionId}/request-publish`).expect(409); // already open
    await post('principal', `/v1/exam-sessions/${sessionId}/publish`).expect(409); // still waiting
    await post('principal', `/v1/workflows/requests/${req.requestId}/decide`, { decision: 'approve', comment: 'Verified with the result sheet' }).expect(200);
    expect((await get('principal', `/v1/exam-sessions/${sessionId}/publish-approval`).expect(200)).body).toMatchObject({ approved: true, request: { status: 'approved' } });
    await post('principal', `/v1/exam-sessions/${sessionId}/publish`).expect(200);
  });

  it('prints a progress report for the family, and not for another family', async () => {
    const doc = await pdf('parentA', `/v1/results/students/${t.students[A].id}/progress-report.pdf`);
    const text = doc.toString('latin1');
    expect(text).toContain('PROGRESS REPORT');
    expect(text).toContain('Corporate Accounting');
    expect(text).toContain('Semester 3 end exam Nov 2026');
    await get('parentB', `/v1/results/students/${t.students[A].id}/progress-report.pdf`).expect(404);
    expect((await pdf('principal', `/v1/results/students/${t.students[C].id}/progress-report.pdf`)).toString('latin1')).toContain('Fail');
  });

  it('leaves an audit trail', async () => {
    const rows = (await owner.query('select action from audit_log where tenant_id = $1', [t.tenantId])).rows.map((r) => r.action as string);
    expect(rows).toEqual(expect.arrayContaining(['qb.paper.release_scheduled', 'exam.practical_scheduled', 'exam.practical_marks', 'marks.normalised', 'marks.normalisation_reverted', 'exam.class_bands_saved', 'exam.results.approval_requested']));
  });
});
