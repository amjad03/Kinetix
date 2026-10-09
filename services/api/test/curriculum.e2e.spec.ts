import type { INestApplication } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { degreeCode } from '../src/curriculum/university.controller.js';
import { docxOf, pdfOf, SYLLABUS } from '../src/curriculum/curriculum.spec.js';
import { createApp, createTenant, env, FixedClock, ownerPool } from './helpers.js';

describe('curriculum versions, school mode and university basics', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let yearId: string;
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(auth(who)).send(body);
  const q = async (sql: string, args: unknown[] = []) => (await owner.query(sql, args)).rows;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    tokens = {
      principal: await login(t.slug, t.principal.email!),
      teacher: await login(t.slug, t.teacher.email!),
      student: await login(t.slug, t.studentUser.email!),
      parent: await login(t.slug, t.guardian.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
    yearId = (await q('select id from academic_years where tenant_id = $1', [t.tenantId]))[0].id;
    Object.assign(ids, { prog: t.program.id, a: t.students[0].id, b: t.students[1].id, c: t.students[2].id });
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('curriculum versions', () => {
    const content = {
      subjects: [
        { code: 'BCOM-101', name: 'Financial Accounting', term: 1, credits: 4, hours: 60, units: [{ title: 'Basics', hours: 10, topics: ['Journal', 'Ledger'] }], cos: [{ code: 'CO1', statement: 'Record transactions' }] },
        { code: 'BCOM-102', name: 'Business Law', term: 1, credits: 3, units: [], cos: [] },
      ],
    };

    it('creates a regulation and a draft, and keeps editing to staff', async () => {
      await post('teacher', '/v1/curriculum/regulations', { name: 'NEP 2024', year: 2024, effectiveFrom: '2024-06-01' }).expect(403);
      const reg = (await post('principal', '/v1/curriculum/regulations', { name: 'NEP 2024', year: 2024, effectiveFrom: '2024-06-01' }).expect(201)).body;
      await post('principal', '/v1/curriculum/regulations', { name: 'NEP 2024', year: 2024, effectiveFrom: '2024-06-01' }).expect(409);
      const v = (await post('principal', '/v1/curriculum/versions', { programId: ids.prog, regulationYear: 2024, label: 'NEP 2024 BCom', regulationId: reg.id }).expect(201)).body;
      expect(v).toMatchObject({ status: 'draft', versionNo: 1 });
      ids.v1 = v.id;
      await post('principal', `/v1/curriculum/versions/${v.id}/approve`, { bosRef: 'BoS/2024/07' }).expect(400); // no subjects yet
      const saved = (await put('principal', `/v1/curriculum/versions/${v.id}/content`, content).expect(200)).body;
      expect(saved.content.subjects).toHaveLength(2);
      expect(saved.content.subjects[0].units[0].topics).toEqual(['Journal', 'Ledger']);
      await put('principal', `/v1/curriculum/versions/${v.id}/content`, { subjects: [content.subjects[0], content.subjects[0]] }).expect(400);
    });

    it('moves draft to approved to active, then pins new entrants only', async () => {
      await post('principal', `/v1/curriculum/versions/${ids.v1}/activate`).expect(409); // not approved
      await post('teacher', `/v1/curriculum/versions/${ids.v1}/approve`, { bosRef: 'x1' }).expect(403);
      expect((await post('principal', `/v1/curriculum/versions/${ids.v1}/approve`, { bosRef: 'BoS/2024/07' }).expect(200)).body).toMatchObject({ status: 'approved', bosRef: 'BoS/2024/07' });
      await put('principal', `/v1/curriculum/versions/${ids.v1}/content`, content).expect(409); // frozen
      // A first-semester section with two new students; the existing semester 3 students are not entrants.
      const [sec] = await db.insert(s.sections).values({ tenantId: t.tenantId, programId: ids.prog, academicYearId: yearId, term: 1, name: 'A', displayName: 'BCom Sem 1 A' }).returning();
      ids.sec1 = sec.id;
      const kids = await db.insert(s.students).values(['N1', 'N2'].map((x, i) => ({ tenantId: t.tenantId, sectionId: sec.id, rollNo: `N${i}`, fullName: `New ${x}` }))).returning();
      ids.n1 = kids[0].id;
      const act = (await post('principal', `/v1/curriculum/versions/${ids.v1}/activate`).expect(200)).body;
      expect(act).toMatchObject({ status: 'active', pinnedNow: 2 });
      const mine = (await get('principal', `/v1/curriculum/students/${ids.n1}`).expect(200)).body;
      expect(mine).toMatchObject({ pinned: true, version: { id: ids.v1, versionNo: 1 } });
      expect(mine.content.subjects).toHaveLength(2);
      expect((await get('principal', `/v1/curriculum/students/${ids.a}`).expect(200)).body).toEqual({ pinned: false });
      // Explicit pin of the semester 3 section: pins the three of them, leaving the new entrants alone.
      expect((await post('principal', `/v1/curriculum/versions/${ids.v1}/pin`, { sectionIds: [t.section.id] }).expect(200)).body).toEqual({ pinned: 3 });
      expect((await post('principal', `/v1/curriculum/versions/${ids.v1}/pin`, { sectionIds: [t.section.id] }).expect(200)).body).toEqual({ pinned: 0 });
      await post('principal', `/v1/curriculum/versions/${ids.v1}/pin`, { sectionIds: [other.section.id] }).expect(400);
    });

    it('lets families see their own child\'s version and nobody else\'s', async () => {
      expect((await get('parent', `/v1/curriculum/students/${ids.a}`).expect(200)).body.pinned).toBe(true);
      await get('parent', `/v1/curriculum/students/${ids.b}`).expect(404);
      await get('student', `/v1/curriculum/students/${ids.c}`).expect(200);
      await get('outsider', `/v1/curriculum/versions/${ids.v1}`).expect(404);
    });

    it('starts a revision, shows a diff, and keeps pinned students on the old version', async () => {
      const v2 = (await post('principal', '/v1/curriculum/versions', { programId: ids.prog, regulationYear: 2024, label: 'NEP 2024 revision', cloneFromId: ids.v1 }).expect(201)).body;
      expect(v2).toMatchObject({ status: 'draft', versionNo: 2, supersedesId: ids.v1 });
      ids.v2 = v2.id;
      const edited = structuredClone(content);
      edited.subjects[0].credits = 5;
      edited.subjects[0].units[0].topics.push('Trial balance');
      edited.subjects.push({ code: 'BCOM-103', name: 'Data Analytics', term: 1, credits: 3, hours: 0, units: [], cos: [] });
      await put('principal', `/v1/curriculum/versions/${v2.id}/content`, edited).expect(200);
      const d = (await get('principal', `/v1/curriculum/diff?from=${ids.v1}&to=${v2.id}`).expect(200)).body;
      expect(d.added.map((x: { code: string }) => x.code)).toEqual(['BCOM-103']);
      expect(d.removed).toEqual([]);
      expect(d.changed).toEqual([{ code: 'BCOM-101', name: 'Financial Accounting', changes: ['Credits 4 to 5', 'Unit "Basics" topics changed (1 added, 0 removed)'] }]);
      expect(d.unchanged).toBe(1);
      await post('principal', `/v1/curriculum/versions/${v2.id}/approve`, { bosRef: 'BoS/2025/02' }).expect(200);
      await post('principal', `/v1/curriculum/versions/${v2.id}/activate`).expect(200);
      const list = (await get('principal', `/v1/curriculum/versions?programId=${ids.prog}`).expect(200)).body;
      expect(list.map((x: { versionNo: number; status: string }) => [x.versionNo, x.status])).toEqual([[2, 'active'], [1, 'archived']]);
      expect((await get('principal', `/v1/curriculum/students/${ids.n1}`).expect(200)).body.version.id).toBe(ids.v1);
      expect((await post('principal', `/v1/curriculum/versions/${ids.v2}/pin`, { sectionIds: [ids.sec1], replace: true }).expect(200)).body).toEqual({ pinned: 2 });
      expect((await get('principal', `/v1/curriculum/students/${ids.n1}`).expect(200)).body.version.id).toBe(ids.v2);
    });

    it('proposes a draft from an uploaded PDF or Word syllabus (preview output without an AI server)', async () => {
      const up = (name: string, buf: Buffer) => http().post('/v1/curriculum/imports').set(auth('principal')).field('programId', ids.prog).field('regulationYear', '2026').attach('file', buf, name);
      await http().post('/v1/curriculum/imports').set(auth('teacher')).field('programId', ids.prog).field('regulationYear', '2026').attach('file', pdfOf(SYLLABUS), 's.pdf').expect(403);
      await up('notes.txt', Buffer.from('just some plain text that is not a syllabus file')).expect(400);
      const pdf = (await up('syllabus.pdf', pdfOf(SYLLABUS)).expect(201)).body;
      expect(pdf).toMatchObject({ preview: true, status: 'proposed', fileName: 'syllabus.pdf' });
      expect(pdf.proposal.subjects.map((x: { code: string; credits: number }) => [x.code, x.credits])).toEqual([['BCOM-301', 4], ['BCOM-302', 3]]);
      const doc = (await up('syllabus.docx', docxOf(SYLLABUS)).expect(201)).body;
      expect(doc.proposal.subjects[0].units[0]).toMatchObject({ title: 'Share Capital', topics: ['Issue of shares', 'Forfeiture', 'Reissue'] });
      expect((await get('principal', `/v1/curriculum/imports/${doc.id}`).expect(200)).body.id).toBe(doc.id);
      const draft = (await post('principal', `/v1/curriculum/imports/${doc.id}/draft`, { label: 'Imported 2026' }).expect(201)).body;
      expect(draft).toMatchObject({ status: 'draft', source: 'import', regulationYear: 2026, versionNo: 1 });
      await post('principal', `/v1/curriculum/imports/${doc.id}/draft`).expect(409);
      expect((await get('principal', `/v1/curriculum/versions/${draft.id}`).expect(200)).body.content.subjects).toHaveLength(2);
      expect((await q("select count(*)::int as n from audit_log where tenant_id = $1 and action = 'curriculum.syllabus_uploaded'", [t.tenantId]))[0].n).toBe(2);
    });
  });

  describe('school mode', () => {
    it('keeps a report card with remarks, co-curricular grades, attendance and promotion, as a PDF', async () => {
      const [y] = await q('select starts_on::text as s from academic_years where id = $1', [yearId]);
      await db.insert(s.attendanceRecords).values([0, 1, 2, 3].map((i) => ({ tenantId: t.tenantId, studentId: ids.c, sectionId: t.section.id, date: `2026-09-0${i + 1}`, status: (i === 3 ? 'absent' : 'present') as 'present', markedBy: t.teacher.id, occurredAt: new Date(`2026-09-0${i + 1}T04:00:00Z`) })));
      expect(y.s).toBe('2026-08-01');
      const body = {
        studentId: ids.c,
        academicYearId: yearId,
        termLabel: 'Term 1',
        remarks: 'Works steadily and helps classmates.',
        behaviourGrade: 'A',
        lines: [{ subjectName: 'Mathematics', marks: 88, maxMarks: 100 }, { subjectName: 'Science', marks: 48, maxMarks: 50, remark: 'Excellent practicals' }],
        coCurricular: [{ activity: 'Football', grade: 'A', remark: 'Captain' }],
      };
      await put('student', '/v1/school/report-cards', body).expect(403);
      await put('teacher', '/v1/school/report-cards', { ...body, promotionStatus: 'promoted' }).expect(409);
      const card = (await put('teacher', '/v1/school/report-cards', body).expect(200)).body;
      await put('principal', '/v1/school/report-cards', { ...body, promotionStatus: 'promoted', promotedTo: 'Grade 8' }).expect(200);
      const full = (await get('student', `/v1/school/report-cards/${card.id}`).expect(200)).body;
      expect(full).toMatchObject({ promotionStatus: 'promoted', remarks: 'Works steadily and helps classmates.', attendance: { total: 4, present: 3, percent: 75 } });
      expect(full.lines.map((l: { grade: string }) => l.grade)).toEqual(['A2', 'A1']);
      expect(full.coCurricular).toHaveLength(1);
      const pdf = await get('student', `/v1/school/report-cards/${card.id}/pdf`).expect(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      expect(Buffer.from(pdf.body).subarray(0, 5).toString()).toBe('%PDF-');
      await get('parent', `/v1/school/report-cards/${card.id}`).expect(404);
      await get('outsider', `/v1/school/report-cards/${card.id}`).expect(404);
      expect((await get('parent', `/v1/school/report-cards?studentId=${ids.a}`).expect(200)).body).toEqual([]);
      await put('teacher', '/v1/school/report-cards', { ...body, lines: [{ subjectName: 'Art', marks: 60, maxMarks: 50 }] }).expect(400);
    });

    it('sets up PUC streams and combinations with practical and internal components', async () => {
      const stream = (await post('principal', '/v1/school/puc/streams', { code: 'SCI', name: 'Science' }).expect(201)).body;
      await post('principal', '/v1/school/puc/streams', { code: 'SCI', name: 'Science again' }).expect(409);
      const subjects = [
        { name: 'Physics', theoryMax: 70, practicalMax: 30 },
        { name: 'Chemistry', theoryMax: 70, practicalMax: 30 },
        { name: 'Mathematics', theoryMax: 80, internalMax: 20 },
        { name: 'English', theoryMax: 80, internalMax: 20 },
      ];
      await post('teacher', '/v1/school/puc/combinations', { streamId: stream.id, code: 'PCMB', name: 'PCMB', subjects }).expect(403);
      const combo = (await post('principal', '/v1/school/puc/combinations', { streamId: stream.id, code: 'PCME', name: 'Physics, Chemistry, Maths, English', subjects, seats: 1 }).expect(201)).body;
      ids.combo = combo.id;
      await post('principal', '/v1/school/puc/enrollments', { studentId: ids.a, academicYearId: yearId, combinationId: combo.id }).expect(200);
      await post('principal', '/v1/school/puc/enrollments', { studentId: ids.c, academicYearId: yearId, combinationId: combo.id }).expect(409); // only one seat
      await post('principal', '/v1/school/puc/enrollments', { studentId: ids.a, academicYearId: yearId, combinationId: combo.id }).expect(200); // same student again is not a second seat
      const m = { studentId: ids.a, academicYearId: yearId };
      await put('teacher', '/v1/school/puc/marks', { ...m, subjectName: 'Physics', theory: 71 }).expect(400);
      await put('teacher', '/v1/school/puc/marks', { ...m, subjectName: 'Mathematics', practical: 10 }).expect(400); // no practical for maths
      await put('teacher', '/v1/school/puc/marks', { ...m, subjectName: 'Biology', theory: 10 }).expect(400);
      await put('teacher', '/v1/school/puc/marks', { studentId: ids.c, academicYearId: yearId, subjectName: 'Physics', theory: 10 }).expect(400); // not enrolled
      await put('teacher', '/v1/school/puc/marks', { ...m, subjectName: 'Physics', theory: 60, practical: 28 }).expect(200);
      await put('teacher', '/v1/school/puc/marks', { ...m, subjectName: 'Physics', internal: undefined, practical: 29 }).expect(200);
      const sum = (await get('parent', `/v1/school/puc/students/${ids.a}?academicYearId=${yearId}`).expect(200)).body;
      expect(sum).toMatchObject({ enrolled: true, combination: { code: 'PCME' }, complete: false, total: 89, max: 400 });
      expect(sum.subjects[0]).toMatchObject({ subject: 'Physics', theory: 60, practical: 29, total: 89, complete: true });
      await get('parent', `/v1/school/puc/students/${ids.b}?academicYearId=${yearId}`).expect(404);
      const streams = (await get('principal', '/v1/school/puc/streams').expect(200)).body;
      expect(streams[0].combinations[0]).toMatchObject({ code: 'PCME', enrolled: 1 });
    });

    it('tracks learning outcome and competency mastery', async () => {
      const o1 = (await post('principal', '/v1/school/outcomes', { grade: 7, subjectName: 'Science', code: 'SCI7-LO1', statement: 'Explains how plants make food' }).expect(201)).body;
      const o2 = (await post('principal', '/v1/school/outcomes', { kind: 'competency', grade: 7, subjectName: 'Science', code: 'SCI7-C1', statement: 'Plans and runs a fair test' }).expect(201)).body;
      await post('principal', '/v1/school/outcomes', { grade: 7, subjectName: 'Science', code: 'SCI7-LO1', statement: 'Duplicate code here' }).expect(409);
      await put('student', '/v1/school/mastery', { studentId: ids.c, outcomeId: o1.id, level: 'mastery' }).expect(403);
      await put('teacher', '/v1/school/mastery', { studentId: ids.c, outcomeId: o1.id, level: 'developing', evidence: 'Quiz 2' }).expect(200);
      await put('teacher', '/v1/school/mastery', { studentId: ids.c, outcomeId: o1.id, level: 'proficient', evidence: 'Quiz 4' }).expect(200);
      await put('teacher', '/v1/school/mastery', { studentId: ids.c, outcomeId: o2.id, level: 'beginning' }).expect(200);
      await put('teacher', '/v1/school/mastery', { studentId: ids.b, outcomeId: o1.id, level: 'mastery' }).expect(200);
      const mine = (await get('student', `/v1/school/mastery/students/${ids.c}`).expect(200)).body;
      expect(mine.outcomes.map((o: { code: string; level: string }) => [o.code, o.level])).toEqual([['SCI7-C1', 'beginning'], ['SCI7-LO1', 'proficient']]);
      expect(mine.subjects).toEqual([{ subject: 'Science', assessed: 2, proficient: 1, percent: 50 }]);
      await get('student', `/v1/school/mastery/students/${ids.b}`).expect(404);
      const sec = (await get('teacher', `/v1/school/mastery/sections/${t.section.id}`).expect(200)).body;
      expect(sec.students).toBe(3);
      expect(sec.outcomes.find((o: { code: string }) => o.code === 'SCI7-LO1').levels).toEqual({ beginning: 0, developing: 0, proficient: 1, mastery: 1 });
      expect((await get('teacher', '/v1/school/outcomes?grade=7').expect(200)).body).toHaveLength(2);
    });

    it('runs the house system: allotment, a points ledger and the leaderboard', async () => {
      const red = (await post('principal', '/v1/houses', { name: 'Red', colour: '#dc2626', motto: 'Courage' }).expect(201)).body;
      const blue = (await post('principal', '/v1/houses', { name: 'Blue' }).expect(201)).body;
      await post('principal', '/v1/houses', { name: 'Red' }).expect(409);
      await post('teacher', '/v1/houses', { name: 'Green' }).expect(403);
      await post('principal', `/v1/houses/${red.id}/members`, { studentIds: [ids.a, ids.b], captainId: ids.a }).expect(200);
      await post('principal', `/v1/houses/${blue.id}/members`, { studentIds: [ids.b, ids.c] }).expect(200); // b moves to Blue
      await post('teacher', `/v1/houses/${red.id}/points`, { points: 10, reason: 'Won the quiz', category: 'academics', studentId: ids.a }).expect(201);
      await post('teacher', `/v1/houses/${red.id}/points`, { points: 5, reason: 'Clean classroom', studentId: ids.b }).expect(400); // b is in Blue now
      await post('teacher', `/v1/houses/${blue.id}/points`, { points: 15, reason: 'Sports day relay', category: 'sports' }).expect(201);
      await post('teacher', `/v1/houses/${blue.id}/points`, { points: -3, reason: 'Late to assembly', category: 'discipline' }).expect(201);
      await post('teacher', `/v1/houses/${blue.id}/points`, { points: 0, reason: 'nothing' }).expect(400);
      await post('student', `/v1/houses/${blue.id}/points`, { points: 5, reason: 'self award' }).expect(403);
      const board = (await get('student', '/v1/houses/leaderboard').expect(200)).body;
      expect(board.map((h: { name: string; points: number; members: number; rank: number }) => [h.rank, h.name, h.points, h.members])).toEqual([[1, 'Blue', 12, 2], [2, 'Red', 10, 1]]);
      const detail = (await get('teacher', `/v1/houses/${red.id}`).expect(200)).body;
      expect(detail.members).toHaveLength(1);
      expect(detail.members[0]).toMatchObject({ isCaptain: true, points: 10 });
      expect(detail.total).toBe(10);
      await get('outsider', `/v1/houses/${red.id}`).expect(404);
    });
  });

  describe('university basics', () => {
    it('keeps a registry of affiliated institutions', async () => {
      const i = (await post('principal', '/v1/university/institutions', { code: 'AFF-01', name: 'Sri Sharada College', model: 'affiliated', university: 'Bangalore University', city: 'Bengaluru', affiliationValidTo: '2028-05-31' }).expect(201)).body;
      await post('principal', '/v1/university/institutions', { code: 'AFF-01', name: 'Dup' }).expect(409);
      await post('teacher', '/v1/university/institutions', { code: 'AFF-02', name: 'No' }).expect(403);
      expect((await put('principal', `/v1/university/institutions/${i.id}`, { active: false }).expect(200)).body.active).toBe(false);
      expect((await get('principal', '/v1/university/institutions').expect(200)).body).toHaveLength(1);
      expect((await get('outsider', '/v1/university/institutions').expect(200)).body).toEqual([]);
    });

    it('runs a convocation: eligible list, registration, degrees with a verifiable QR', async () => {
      // A final-semester section whose two students have results: one pass, one fail.
      const [fin] = await db.insert(s.sections).values({ tenantId: t.tenantId, programId: ids.prog, academicYearId: yearId, term: 6, name: 'A', displayName: 'BCom Sem 6 A' }).returning();
      const grads = await db.insert(s.students).values(['Asha', 'Bela'].map((n, i) => ({ tenantId: t.tenantId, sectionId: fin.id, rollNo: `G${i}`, fullName: `Grad ${n}`, status: 'active' }))).returning();
      const [session] = await db.insert(s.examSessions).values({ tenantId: t.tenantId, academicYearId: yearId, programId: ids.prog, term: 6, name: 'Sem 6 exam', startsOn: '2026-05-01', endsOn: '2026-05-20', createdBy: t.principal.id }).returning();
      await db.insert(s.examResults).values([
        { tenantId: t.tenantId, sessionId: session.id, studentId: grads[0].id, sgpa: 8.5, cgpa: 8.2, creditsAttempted: 24, creditsEarned: 24, creditPoints: 200, outcome: 'pass' },
        { tenantId: t.tenantId, sessionId: session.id, studentId: grads[1].id, sgpa: 3, cgpa: 4, creditsAttempted: 24, creditsEarned: 10, creditPoints: 40, outcome: 'fail' },
      ]);
      await post('teacher', '/v1/university/convocations', { name: 'x', heldOn: '2026-12-10', graduationYear: 2026 }).expect(403);
      const c = (await post('principal', '/v1/university/convocations', { name: '2026 Convocation', heldOn: '2026-12-10', graduationYear: 2026, programId: ids.prog }).expect(201)).body;
      expect((await post('principal', `/v1/university/convocations/${c.id}/eligible`).expect(200)).body).toEqual({ added: 1, eligible: 1 });
      expect((await post('principal', `/v1/university/convocations/${c.id}/eligible`).expect(200)).body).toEqual({ added: 0, eligible: 1 });
      const one = (await get('principal', `/v1/university/convocations/${c.id}`).expect(200)).body;
      expect(one.candidates).toHaveLength(1);
      expect(one.candidates[0]).toMatchObject({ name: 'Grad Asha', status: 'eligible', cgpa: 8.2, degreeTitle: 'BCom' });
      const cand = one.candidates[0].id as string;
      await post('principal', `/v1/university/convocations/${c.id}/register`, { studentId: grads[0].id }).expect(409); // registration not open yet
      await post('principal', `/v1/university/convocations/${c.id}/open`).expect(200);
      await post('principal', `/v1/university/convocations/${c.id}/issue`).expect(400); // nobody registered
      await post('student', `/v1/university/convocations/${c.id}/register`).expect(404); // Student C is not an eligible graduate
      await post('principal', `/v1/university/convocations/${c.id}/candidates`, { studentId: ids.c }).expect(201);
      expect((await post('student', `/v1/university/convocations/${c.id}/register`, { studentId: ids.a }).expect(403)).body).toBeDefined();
      expect((await post('student', `/v1/university/convocations/${c.id}/register`).expect(200)).body.status).toBe('registered');
      expect((await post('principal', `/v1/university/convocations/${c.id}/register`, { studentId: grads[0].id }).expect(200)).body.status).toBe('registered');
      const withheld = (await get('principal', `/v1/university/convocations/${c.id}`).expect(200)).body.candidates.find((x: { name: string }) => x.name === 'Student C').id;
      await post('principal', `/v1/university/convocations/${c.id}/candidates/${withheld}/withhold`).expect(200);
      await post('teacher', `/v1/university/convocations/${c.id}/issue`).expect(403);
      await get('principal', `/v1/university/convocations/${c.id}/candidates/${cand}/certificate.pdf`).expect(409); // not issued yet
      expect((await post('principal', `/v1/university/convocations/${c.id}/issue`).expect(200)).body).toEqual({ issued: 1 });
      await post('principal', `/v1/university/convocations/${c.id}/issue`).expect(409);
      const done = (await get('principal', `/v1/university/convocations/${c.id}`).expect(200)).body;
      expect(done.status).toBe('held');
      const issued = done.candidates.find((x: { status: string }) => x.status === 'degree_issued');
      expect(issued.certificateNo).toBe('DEG-2026-0001');

      const pdf = await get('principal', `/v1/university/convocations/${c.id}/candidates/${cand}/certificate.pdf`).expect(200);
      const text = Buffer.from(pdf.body).toString('latin1');
      expect(text.startsWith('%PDF-')).toBe(true);
      expect(text).toContain('Grad Asha');
      expect((text.match(/ re f/g) ?? []).length).toBeGreaterThan(100); // the QR modules
      await get('outsider', `/v1/university/convocations/${c.id}/candidates/${cand}/certificate.pdf`).expect(404);

      const code = degreeCode(env.JWT_SECRET, t.tenantId, 'DEG-2026-0001');
      const ok = (await http().get(`/v1/public/verify-degree/${t.slug}/${encodeURIComponent(code)}`).expect(200)).body;
      expect(ok).toEqual({ status: 'valid', institution: expect.any(String), name: 'Grad Asha', degree: 'BCom', certificateNo: 'DEG-2026-0001', conferredOn: '2026-12-10' });
      expect((await http().get(`/v1/public/verify-degree/${t.slug}/${encodeURIComponent(code.replace('0001', '0002'))}`).expect(200)).body).toEqual({ status: 'not_found' });
      expect((await http().get(`/v1/public/verify-degree/${other.slug}/${encodeURIComponent(code)}`).expect(200)).body).toEqual({ status: 'not_found' });
    });
  });
});
