import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('Profiles: student attendance and mentor, staff classes/attendance/pay/mentees', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  const tok: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(new FixedClock(new Date('2026-10-20T04:30:00Z')));
    tok.principal = await login(t.principal.email!);
    tok.teacher = await login(t.teacher.email!);
    tok.teacher2 = await login(t.teacher2.email!);
    tok.guardian = await login(t.guardian.email!);
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('returns a student attendance summary to staff and the family, not to strangers', async () => {
    const s = t.students[0].id;
    await owner.query(`insert into attendance_records (tenant_id, student_id, section_id, date, status, marked_by, occurred_at) values ($1,$2,$3,current_date,'present',$4,now()), ($1,$2,$3,current_date - 1,'absent',$4,now())`, [t.tenantId, s, t.section.id, t.teacher.id]);
    await owner.query(`insert into mentor_assignments (tenant_id, student_id, mentor_user_id, started_on, assigned_by) values ($1,$2,$3,current_date,$4)`, [t.tenantId, s, t.teacher.id, t.principal.id]);
    const r = await http().get(`/v1/profiles/students/${s}/attendance`).set({ authorization: `Bearer ${tok.principal}` }).expect(200);
    expect(r.body).toMatchObject({ present: 1, total: 2, percent: 50, mentor: { id: t.teacher.id } });
    await http().get(`/v1/profiles/students/${s}/attendance`).set({ authorization: `Bearer ${tok.guardian}` }).expect(200);
  });

  it('returns a staff overview to leaders and the person only', async () => {
    const r = await http().get(`/v1/profiles/staff/${t.teacher.id}`).set({ authorization: `Bearer ${tok.principal}` }).expect(200);
    expect(r.body.classes.length).toBeGreaterThan(0);
    expect(r.body.mentees.map((m: { studentId: string }) => m.studentId)).toContain(t.students[0].id);
    await http().get(`/v1/profiles/staff/${t.teacher.id}`).set({ authorization: `Bearer ${tok.teacher}` }).expect(200);
    await http().get(`/v1/profiles/staff/${t.teacher.id}`).set({ authorization: `Bearer ${tok.teacher2}` }).expect(403);
  });
});
