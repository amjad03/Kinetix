import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool } from './helpers.js';

describe('attendance governance, QR attendance, institution profile', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const start = nextMondayIst('10:30');
  const clock = new FixedClock(start);
  const monday = new Date(start.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(auth(who)).send(body);
  const audited = async (action: string) => (await owner.query('select count(*)::int as n from audit_log where tenant_id = $1 and action = $2', [t.tenantId, action])).rows[0].n as number;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const [hod] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Hari Hod', email: 'hod@ag.in', passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: hod.id, role: 'hod' });
    app = await createApp(clock);
    tokens = {
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      hod: await login(t.slug, 'hod@ag.in'),
      student: await login(t.slug, t.studentUser.email!),
      parent: await login(t.slug, t.guardian.email!),
      otherPrincipal: await login(other.slug, other.principal.email!),
    };
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('QR attendance: signed 30 s codes, student scans, teacher marks stand, tampering and expiry are refused', async () => {
    const q = (await post('teacher', '/v1/attendance/qr', { slotId: t.slot.id }).expect(200)).body;
    expect(q.ttlSeconds).toBe(30);
    expect(q.code).toMatch(/^\d{8}$/);
    await post('teacher2', '/v1/attendance/qr', { slotId: t.slot.id }).expect(403);
    await post('student', '/v1/attendance/qr', { slotId: t.slot.id }).expect(403);

    // The student (C) scans and is marked present.
    const first = (await post('student', '/v1/student/attendance/scan', { code: q.code }).expect(200)).body;
    expect(first).toEqual({ status: 'present', alreadyMarked: false });
    expect((await post('student', '/v1/student/attendance/scan', { code: q.code }).expect(200)).body.alreadyMarked).toBe(true);
    expect(await audited('attendance.qr_scan')).toBe(1);

    await post('student', '/v1/student/attendance/scan', { code: q.code.slice(0, -1) + (q.code.endsWith('0') ? '1' : '0') }).expect(400);
    // Another institution's student cannot use this institution's code.
    const otherStudent = await login(other.slug, other.studentUser.email!);
    await http().post('/v1/student/attendance/scan').set({ authorization: `Bearer ${otherStudent}` }).send({ code: q.code }).expect(400);

    clock.at = new Date(start.getTime() + 90_000);
    const late = await post('student', '/v1/student/attendance/scan', { code: q.code }).expect(400);
    expect(late.body.message).toMatch(/expired/);
    await post('student', '/v1/student/attendance/scan', { code: 'abc' }).expect(400);
    clock.at = start;
  });

  it('lock after N hours, correction request, HoD approval applies and audits it', async () => {
    await put('principal', '/v1/admin/settings', { attendanceLockHours: 2, attendanceThresholdPct: 75 }).expect(200);
    const marks = [{ studentId: t.students[0].id, status: 'present' }, { studentId: t.students[1].id, status: 'absent' }];
    await post('teacher', '/v1/attendance', { slotId: t.slot.id, date: monday, records: marks }).expect(201);

    // Three hours after the day ended (Tuesday 03:00 IST) the register is locked.
    clock.at = new Date(start.getTime() + (16.5 + 3) * 3600_000);
    const locked = await post('teacher', '/v1/attendance', { slotId: t.slot.id, date: monday, records: marks }).expect(409);
    expect(locked.body.message).toMatch(/locked/);

    const body = { slotId: t.slot.id, date: monday, studentId: t.students[1].id, toStatus: 'late', reason: 'Arrived after roll call' };
    await post('teacher2', '/v1/attendance/corrections', body).expect(403);
    await post('teacher', '/v1/attendance/corrections', { ...body, reason: 'x' }).expect(400);
    const c = (await post('teacher', '/v1/attendance/corrections', body).expect(201)).body;
    expect(c).toMatchObject({ status: 'pending', fromStatus: 'absent', toStatus: 'late' });
    await post('teacher', '/v1/attendance/corrections', body).expect(409);
    await post('teacher', `/v1/attendance/corrections/${c.id}/decision`, { decision: 'approved', note: 'ok ok' }).expect(403);

    const decided = (await post('hod', `/v1/attendance/corrections/${c.id}/decision`, { decision: 'approved', note: 'Verified with the teacher' }).expect(200)).body;
    expect(decided.status).toBe('approved');
    await post('principal', `/v1/attendance/corrections/${c.id}/decision`, { decision: 'rejected', note: 'again' }).expect(409);
    const row = (await owner.query('select status from attendance_records where student_id = $1 and timetable_slot_id = $2 and date = $3', [t.students[1].id, t.slot.id, monday])).rows[0];
    expect(row.status).toBe('late');
    expect(await audited('attendance.correction.requested')).toBe(1);
    expect(await audited('attendance.correction.approved')).toBe(1);
    const mine = (await get('teacher', '/v1/attendance/corrections').expect(200)).body;
    expect(mine).toHaveLength(1);
    expect((await get('teacher2', '/v1/attendance/corrections').expect(200)).body).toHaveLength(0);
    clock.at = start;
  });

  it('shortage list, condonation with a document and eligibility after approval', async () => {
    // Student A: 10 earlier days, 5 present and 5 absent in the same period => 50%+.
    const rows = Array.from({ length: 10 }, (_, i) => ({
      tenantId: t.tenantId, studentId: t.students[0].id, sectionId: t.section.id, date: new Date(new Date(`${monday}T00:00:00Z`).getTime() - (i + 1) * 7 * 86400_000).toISOString().slice(0, 10),
      timetableSlotId: t.slot.id, status: (i < 5 ? 'present' : 'absent') as 'present' | 'absent', markedBy: t.teacher.id, occurredAt: start,
    }));
    await db.insert(s.attendanceRecords).values(rows);

    const short = (await get('teacher', `/v1/attendance/shortage?sectionId=${t.section.id}`).expect(200)).body;
    expect(short.thresholdPct).toBe(75);
    expect(short.rows.map((r: { studentId: string }) => r.studentId)).toContain(t.students[0].id);
    expect(short.rows.find((r: { studentId: string }) => r.studentId === t.students[0].id).effectivePct).toBeLessThan(75);
    await get('teacher2', `/v1/attendance/shortage?sectionId=${t.section.id}`).expect(403);
    const strict = (await get('principal', `/v1/attendance/shortage?sectionId=${t.section.id}&threshold=10`).expect(200)).body;
    expect(strict.rows.some((r: { studentId: string }) => r.studentId === t.students[0].id)).toBe(false);

    const elig = (await get('principal', `/v1/attendance/eligibility?sectionId=${t.section.id}`).expect(200)).body;
    expect(elig.students.find((x: { studentId: string }) => x.studentId === t.students[0].id).eligible).toBe(false);

    // The parent asks for medical condonation with a (PDF) certificate.
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
    const sent = await http().post('/v1/attendance/condonations').set(auth('parent')).field('studentId', t.students[0].id).field('kind', 'medical').field('reason', 'Typhoid, two weeks of rest').attach('document', pdf, 'cert.pdf').expect(201);
    expect(sent.body).toMatchObject({ status: 'pending', hasDocument: true });
    expect(sent.body.documentKey).toBeUndefined();
    await post('hod', `/v1/attendance/condonations/${sent.body.id}/decision`, { decision: 'approved', points: 25, note: 'fine' }).expect(403);
    expect((await get('parent', '/v1/attendance/condonations').expect(200)).body).toHaveLength(1);
    expect((await get('otherPrincipal', '/v1/attendance/condonations').expect(200)).body).toHaveLength(0);
    await post('principal', `/v1/attendance/condonations/${sent.body.id}/decision`, { decision: 'approved', points: 0, note: 'no points' }).expect(400);
    await post('principal', `/v1/attendance/condonations/${sent.body.id}/decision`, { decision: 'approved', points: 25, note: 'Certificate verified' }).expect(200);
    expect(await audited('attendance.condonation.approved')).toBe(1);

    const after = (await get('principal', `/v1/attendance/eligibility?sectionId=${t.section.id}`).expect(200)).body;
    const a = after.students.find((x: { studentId: string }) => x.studentId === t.students[0].id);
    expect(a.condonedPoints).toBe(25);
    expect(a.eligible).toBe(true);
  });

  it('institution profile, capability toggles and buildings with rooms', async () => {
    expect((await get('student', '/v1/institution/capabilities').expect(200)).body).toMatchObject({ academicModel: 'school', disabledModules: [] });
    await put('teacher', '/v1/admin/institution/profile', { naacGrade: 'A' }).expect(403);
    await put('principal', '/v1/admin/institution/profile', { aisheCode: 'bad code' }).expect(400);
    const saved = (await put('principal', '/v1/admin/institution/profile', { legalName: 'Soundarya Trust', aisheCode: 'C-12345', naacGrade: 'A+', establishedYear: 1998, pincode: '560090', academicModel: 'ug', boardOrUniversity: 'Bangalore University', disabledModules: ['hostel', 'transport'] }).expect(200)).body;
    expect(saved).toMatchObject({ naacGrade: 'A+', academicModel: 'ug' });
    expect((await get('teacher', '/v1/institution/capabilities').expect(200)).body).toMatchObject({ academicModel: 'ug', disabledModules: ['hostel', 'transport'] });
    expect(await audited('institution.profile.updated')).toBe(1);
    await put('principal', '/v1/admin/institution/profile', { disabledModules: ['nonsense'] }).expect(400);

    const bld = (await post('principal', '/v1/admin/institution/buildings', { campusId: t.campus.id, name: 'Main Block', code: 'MB' }).expect(201)).body;
    const floor = (await post('principal', `/v1/admin/institution/buildings/${bld.id}/floors`, { level: 1, label: 'First floor' }).expect(201)).body;
    await post('principal', `/v1/admin/institution/buildings/${bld.id}/floors`, { level: 1, label: 'Again' }).expect(409);
    await put('principal', `/v1/admin/institution/rooms/${t.room.id}/floor`, { floorId: floor.id }).expect(200);
    const tree = (await get('principal', '/v1/admin/institution/buildings').expect(200)).body;
    expect(tree.buildings[0].floors[0].rooms.map((r: { id: string }) => r.id)).toEqual([t.room.id]);
    expect(tree.unplacedRooms).toHaveLength(0);

    // Another institution sees none of it.
    const theirs = (await get('otherPrincipal', '/v1/admin/institution/buildings').expect(200)).body;
    expect(theirs.buildings).toHaveLength(0);
    expect((await get('otherPrincipal', '/v1/institution/capabilities').expect(200)).body.academicModel).toBe('school');
  });
});
