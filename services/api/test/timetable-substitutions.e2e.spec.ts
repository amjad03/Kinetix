import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/** The next Monday that is at least two days away, as YYYY-MM-DD. */
function nextMonday(): string {
  const d = new Date(Date.now() + 2 * 86400_000);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

describe('timetable: substitutes and room capacity', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let busyTeacher: string;
  let freeOther: string;
  const monday = nextMonday();
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;

  beforeAll(async () => {
    t = await createTenant(owner);
    const hash = await argon2.hash('pw');
    const mk = async (name: string) => {
      const u = (await owner.query(`insert into users (tenant_id, full_name, email, password_hash) values ($1, $2, $3, $4) returning id`, [t.tenantId, name, `${name}@${t.slug}.in`, hash])).rows[0].id as string;
      await owner.query(`insert into user_roles (tenant_id, user_id, role) values ($1, $2, 'teacher')`, [t.tenantId, u]);
      return u;
    };
    busyTeacher = await mk('busy');
    freeOther = await mk('unrelated');
    const year = (await owner.query(`select academic_year_id as id from sections where id = $1`, [t.section.id])).rows[0].id;
    // teacher2 teaches the same subject on Tuesday (free on Monday 10:00): a subject match.
    await owner.query(`insert into timetable_slots (tenant_id, academic_year_id, section_id, subject_id, teacher_id, day_of_week, starts_at, ends_at) values ($1, $2, $3, $4, $5, 2, '10:00', '10:55')`, [t.tenantId, year, t.section.id, t.subject.id, t.teacher2.id]);
    // busy teacher teaches the same subject to the other class on Monday at the same time.
    await owner.query(`insert into timetable_slots (tenant_id, academic_year_id, section_id, subject_id, teacher_id, day_of_week, starts_at, ends_at) values ($1, $2, $3, $4, $5, 1, '10:30', '11:20')`, [t.tenantId, year, t.otherSection.id, t.subject.id, busyTeacher]);
    app = await createApp(new FixedClock(new Date()));
    tokens = {
      principal: await login(t.slug, t.principal.email!),
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
    };
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('suggests free teachers of the same subject and refuses double booking', async () => {
    await http().get(`/v1/timetable/substitutes?slotId=${t.slot.id}&date=${monday}`).set(as('teacher')).expect(403);
    await http().get(`/v1/timetable/substitutes?slotId=${t.slot.id}&date=${monday.slice(0, 8)}09`).set(as('principal')).expect(400);
    const sug = (await http().get(`/v1/timetable/substitutes?slotId=${t.slot.id}&date=${monday}`).set(as('principal')).expect(200)).body;
    const ids = sug.candidates.map((c: { id: string }) => c.id);
    expect(ids).toContain(t.teacher2.id);
    expect(ids).not.toContain(busyTeacher); // teaching at 10:30 Monday
    expect(ids).not.toContain(freeOther); // not of this subject or department
    expect(ids).not.toContain(t.teacher.id);
    expect(sug.candidates.find((c: { id: string }) => c.id === t.teacher2.id).match).toBe('subject');

    // Tuesday is not the slot's day.
    await http().post('/v1/timetable/substitutions').set(as('principal')).send({ slotId: t.slot.id, date: new Date(Date.parse(monday) + 86400_000).toISOString().slice(0, 10), substituteTeacherId: t.teacher2.id, reason: 'Teacher away' }).expect(400);
    // No leave and no reason.
    await http().post('/v1/timetable/substitutions').set(as('principal')).send({ slotId: t.slot.id, date: monday, substituteTeacherId: t.teacher2.id }).expect(400);
    // The busy teacher cannot cover.
    const clash = await http().post('/v1/timetable/substitutions').set(as('principal')).send({ slotId: t.slot.id, date: monday, substituteTeacherId: busyTeacher, reason: 'Teacher away' }).expect(409);
    expect(clash.body.code).toBe('SUBSTITUTE_BUSY');
  });

  it('assigns a substitute for a teacher on approved leave, visible to the substitute', async () => {
    const lt = (await owner.query(`insert into leave_types (tenant_id, code, name) values ($1, 'CL', 'Casual') returning id`, [t.tenantId])).rows[0].id;
    await owner.query(`insert into leave_requests (tenant_id, user_id, leave_type_id, from_date, to_date, days, status) values ($1, $2, $3, $4, $4, 1, 'approved')`, [t.tenantId, t.teacher.id, lt, monday]);
    const needed = (await http().get(`/v1/timetable/substitutions/needed?date=${monday}`).set(as('principal')).expect(200)).body;
    expect(needed).toHaveLength(1);
    expect(needed[0]).toMatchObject({ slotId: t.slot.id, teacher: t.teacher.fullName });

    const made = await http().post('/v1/timetable/substitutions').set(as('principal')).send({ slotId: t.slot.id, date: monday, substituteTeacherId: t.teacher2.id }).expect(201);
    expect(made.body).toMatchObject({ date: monday, status: 'assigned', substituteTeacher: t.teacher2.fullName, originalTeacher: t.teacher.fullName });
    await http().post('/v1/timetable/substitutions').set(as('principal')).send({ slotId: t.slot.id, date: monday, substituteTeacherId: freeOther }).expect(409); // already covered
    expect((await http().get(`/v1/timetable/substitutions/needed?date=${monday}`).set(as('principal')).expect(200)).body).toHaveLength(0);
    expect((await http().get(`/v1/timetable/substitutes?slotId=${t.slot.id}&date=${monday}`).set(as('principal')).expect(200)).body.candidates.map((c: { id: string }) => c.id)).not.toContain(t.teacher.id);

    const mine = (await http().get(`/v1/timetable/me/substitutions?from=${monday}&to=${monday}`).set(as('teacher2')).expect(200)).body;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ slotId: t.slot.id, date: monday, section: { displayName: 'BCom Sem 3 A' }, originalTeacher: t.teacher.fullName });
    expect((await http().get(`/v1/timetable/me/substitutions?from=${monday}&to=${monday}`).set(as('teacher')).expect(200)).body).toHaveLength(0);
    // The substitute can now open that class's roster.
    await http().get(`/v1/sections/${t.section.id}/roster`).set(as('teacher2')).expect(200);

    // The substitute cannot be double booked on that time either.
    const other = (await owner.query(`select id from timetable_slots where teacher_id = $1 and day_of_week = 1`, [busyTeacher])).rows[0].id;
    await owner.query(`update timetable_slots set starts_at = '10:30', ends_at = '11:20' where id = $1`, [t.slot.id]); // overlap check is on the slot being covered
    await http().post('/v1/timetable/substitutions').set(as('principal')).send({ slotId: other, date: monday, substituteTeacherId: t.teacher2.id, reason: 'Covering for a colleague' }).expect(409);
    await owner.query(`update timetable_slots set starts_at = '10:00', ends_at = '10:55' where id = $1`, [t.slot.id]);

    await http().post(`/v1/timetable/substitutions/${made.body.id}/cancel`).set(as('principal')).expect(200);
    expect((await http().get(`/v1/timetable/me/substitutions?from=${monday}&to=${monday}`).set(as('teacher2')).expect(200)).body).toHaveLength(0);
    expect((await owner.query(`select count(*)::int as n from audit_log where action like 'timetable.substitution_%'`)).rows[0].n).toBeGreaterThanOrEqual(2);
  });

  it('checks room capacity when a period is created', async () => {
    await http().patch(`/v1/admin/rooms/${t.room.id}`).set(as('teacher')).send({ capacity: 2 }).expect(403);
    await http().patch(`/v1/admin/rooms/${t.room.id}`).set(as('principal')).send({ capacity: 2, kind: 'lab' }).expect(200);
    const body = { sectionId: t.section.id, subjectId: t.subject.id, teacherId: t.teacher.id, roomId: t.room.id, dayOfWeek: 3, startsAt: '09:00', endsAt: '09:55' };
    const refused = await http().post('/v1/admin/timetable/slots').set(as('principal')).send(body).expect(409);
    expect(refused.body.code).toBe('TIMETABLE_ROOM_CAPACITY');
    await http().post('/v1/admin/timetable/slots').set(as('principal')).send({ ...body, roomId: null }).expect(201); // no room, no check
    await http().patch(`/v1/admin/rooms/${t.room.id}`).set(as('principal')).send({ capacity: 3 }).expect(200);
    await http().post('/v1/admin/timetable/slots').set(as('principal')).send({ ...body, startsAt: '11:00', endsAt: '11:55' }).expect(201);
    expect((await http().get('/v1/admin/rooms').set(as('principal')).expect(200)).body[0]).toMatchObject({ capacity: 3, kind: 'lab' });
  });
});
