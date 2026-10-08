import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('course files', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body);

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@cf.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
    return u;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const hod = await addUser('Hari Hod', 'hod');
    const otherHod = await addUser('Omkar Hod', 'hod');
    const [dept] = await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Commerce', headUserId: hod.id }).returning();
    await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Languages', headUserId: otherHod.id });

    // A syllabus with two topics; the class has covered one.
    const code = `cf-${randomUUID().slice(0, 8)}`;
    await db.insert(s.curricula).values({ code, name: 'Test curriculum', level: 'ug' });
    const [course] = await db.insert(s.courses).values({ curriculumCode: code, code: 'ca', title: 'Corporate Accounting', term: 3, source: 'test' }).returning();
    const [chapter] = await db.insert(s.chapters).values({ courseId: course.id, position: 1, title: 'Share capital' }).returning();
    const [t1, t2] = await db.insert(s.topics).values([{ chapterId: chapter.id, position: 1, title: 'Issue of shares' }, { chapterId: chapter.id, position: 2, title: 'Forfeiture of shares' }]).returning();
    await db.update(s.subjects).set({ courseId: course.id, departmentId: dept.id }).where(eq(s.subjects.id, t.subject.id));
    await db.insert(s.topicCoverage).values({ tenantId: t.tenantId, sectionId: t.section.id, topicId: t1.id, coveredOn: '2026-10-12', coveredBy: t.teacher.id });

    await db.insert(s.lessonPlans).values({ tenantId: t.tenantId, sectionId: t.section.id, subjectId: t.subject.id, timetableSlotId: t.slot.id, date: '2026-10-12', teacherId: t.teacher.id, topicIds: [t1.id], content: { objectives: ['Understand share issue'], steps: [], materials: [], assessment: '', homework: '' } });
    for (let d = 1; d <= 6; d++) {
      for (const [i, st] of (['present', 'present', d <= 2 ? 'absent' : 'present'] as const).entries()) {
        await db.insert(s.attendanceRecords).values({ tenantId: t.tenantId, studentId: t.students[i].id, sectionId: t.section.id, date: `2026-10-0${d}`, timetableSlotId: t.slot.id, status: st, markedBy: t.teacher.id, occurredAt: new Date('2026-10-10T05:00:00Z') });
      }
    }
    const [test1] = await db.insert(s.assessments).values({ tenantId: t.tenantId, sectionId: t.section.id, subjectId: t.subject.id, title: 'Unit Test 1', kind: 'test', maxMarks: 50, heldOn: '2026-10-05', publishedAt: new Date('2026-10-06T00:00:00Z'), createdBy: t.teacher.id }).returning();
    await db.insert(s.marks).values(t.students.map((st, i) => ({ tenantId: t.tenantId, assessmentId: test1.id, studentId: st.id, marks: [40, 30, 10][i] })));
    await db.insert(s.assessments).values({ tenantId: t.tenantId, sectionId: t.section.id, subjectId: t.subject.id, title: 'Unpublished draft test', kind: 'test', maxMarks: 50, heldOn: '2026-10-09', createdBy: t.teacher.id });
    const [set] = await db.insert(s.coSets).values({ tenantId: t.tenantId, subjectId: t.subject.id, version: 1, status: 'active', createdBy: t.principal.id }).returning();
    await db.insert(s.attainmentSnapshots).values({ tenantId: t.tenantId, programId: t.program.id, academicYearId: (await db.select().from(s.academicYears).where(eq(s.academicYears.tenantId, t.tenantId)))[0].id, scope: 'co', targetId: set.id, code: 'CO1', subjectId: t.subject.id, direct: 72, combined: 72, target: 60, met: true, computedBy: t.principal.id });
    await db.insert(s.whiteboards).values({ id: randomUUID(), tenantId: t.tenantId, ownerId: t.teacher.id, sectionId: t.section.id, subjectId: t.subject.id, title: 'Journal entries', pageCount: 1, content: {} as never, sizeBytes: 10, sharedAt: new Date('2026-10-13T00:00:00Z') });
    await db.insert(s.recordings).values({ id: randomUUID(), tenantId: t.tenantId, ownerId: t.teacher.id, sectionId: t.section.id, subjectId: t.subject.id, title: 'Lecture on share issue', startedAt: new Date('2026-10-12T05:00:00Z'), durationMs: 45 * 60_000 });

    app = await createApp(clock);
    tokens = {
      hod: await login(t.slug, hod.email!),
      otherHod: await login(t.slug, otherHod.email!),
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      student: await login(t.slug, t.studentUser.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
    Object.assign(ids, { section: t.section.id, subject: t.subject.id });
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('lists only the classes and subjects each person may build a file for', async () => {
    const mine = (await get('teacher', '/v1/course-files/options').expect(200)).body;
    expect(mine).toEqual([{ sectionId: ids.section, section: 'BCom Sem 3 A', subjectId: ids.subject, subject: 'Corporate Accounting', code: 'BCOM-3.1' }]);
    expect((await get('teacher2', '/v1/course-files/options').expect(200)).body).toEqual([]);
    expect((await get('hod', '/v1/course-files/options').expect(200)).body).toHaveLength(1);
    expect((await get('otherHod', '/v1/course-files/options').expect(200)).body).toEqual([]);
    expect((await get('principal', '/v1/course-files/options').expect(200)).body).toHaveLength(1);
    await get('student', '/v1/course-files/options').expect(403);
  });

  it('assembles a course file PDF from existing records and keeps each generation as a version', async () => {
    await post('teacher2', '/v1/course-files', { sectionId: ids.section, subjectId: ids.subject }).expect(403);
    await post('teacher', '/v1/course-files', { sectionId: randomUUID(), subjectId: ids.subject }).expect(404);
    const v1 = (await post('teacher', '/v1/course-files', { sectionId: ids.section, subjectId: ids.subject }).expect(201)).body;
    expect(v1).toMatchObject({ version: 1, section: 'BCom Sem 3 A', subject: 'Corporate Accounting', reviewedAt: null });
    expect(v1.storageKey).toBeUndefined();
    expect(v1.summary).toMatchObject({ topics: 2, topicsCovered: 1, lessonPlans: 1, periods: 1, attendanceSessions: 6, assessments: 1, outcomes: 1, whiteboards: 1, recordings: 1 });
    const pdf = await get('teacher', `/v1/course-files/${v1.id}/download`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.headers['content-disposition']).toContain('course-file-BCOM-3.1-BCom-Sem-3-A-v1.pdf');
    const text = (pdf.body as Buffer).toString('latin1');
    expect(text.startsWith('%PDF')).toBe(true);
    for (const needle of ['Corporate Accounting', 'Forfeiture of shares', 'Unit Test 1', 'CO1', 'Journal entries', 'Lecture on share issue']) expect(text).toContain(needle);
    expect(text).not.toContain('Unpublished draft test');
    const v2 = (await post('hod', '/v1/course-files', { sectionId: ids.section, subjectId: ids.subject }).expect(201)).body;
    expect(v2.version).toBe(2);
    expect(new Date(v2.generatedAt).toISOString()).toBe('2026-10-20T04:30:00.000Z');
    const list = (await get('teacher', '/v1/course-files').expect(200)).body;
    expect(list.map((x: { version: number }) => x.version).sort()).toEqual([1, 2]);
    expect(list[0].generatedByName).toBeTruthy();
    ids.v1 = v1.id;
    ids.v2 = v2.id;
  });

  it('lets only the subject’s head of department or a school leader review, and hides files from others', async () => {
    await post('teacher', `/v1/course-files/${ids.v1}/review`, { remark: 'ok' }).expect(403);
    await post('otherHod', `/v1/course-files/${ids.v1}/review`, {}).expect(404);
    const r = (await post('hod', `/v1/course-files/${ids.v1}/review`, { remark: 'Complete and well kept.' }).expect(200)).body;
    expect(r.reviewedAt).toBeTruthy();
    const list = (await get('hod', '/v1/course-files').expect(200)).body;
    expect(list.find((x: { id: string }) => x.id === ids.v1)).toMatchObject({ reviewedByName: 'Hari Hod', reviewRemark: 'Complete and well kept.' });
    expect(list.find((x: { id: string }) => x.id === ids.v2).reviewedAt).toBeNull();
    expect((await get('teacher2', '/v1/course-files').expect(200)).body).toEqual([]);
    expect((await get('otherHod', '/v1/course-files').expect(200)).body).toEqual([]);
    await get('teacher2', `/v1/course-files/${ids.v1}/download`).expect(404);
    await get('outsider', `/v1/course-files/${ids.v1}/download`).expect(404);
    expect((await get('outsider', '/v1/course-files').expect(200)).body).toEqual([]);
    const { rows } = await owner.query("select action from audit_log where tenant_id = $1 and action like 'course_file.%' order by action", [t.tenantId]);
    expect([...new Set(rows.map((x: { action: string }) => x.action))]).toEqual(['course_file.downloaded', 'course_file.generated', 'course_file.reviewed']);
  });
});
