import type { INestApplication } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('student leave', () => {
  const owner = ownerPool();
  drizzle(owner, { schema: s });
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(new FixedClock(new Date()));
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.parent = await login(t.slug, t.guardian.email!);
    tokens.parent2 = await login(t.slug, t.guardian2.email!);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('a guardian applies for their own child only, with dates in order', async () => {
    const body = { studentId: t.students[0].id, fromDate: day(1), toDate: day(2), reason: 'Fever and rest' };
    await http().post('/v1/student-leave').set(as('parent2')).send(body).expect(404); // not their child
    await http().post('/v1/student-leave').set(as('teacher')).send(body).expect(403); // staff do not apply for students
    await http().post('/v1/student-leave').set(as('parent')).send({ ...body, fromDate: day(3), toDate: day(2) }).expect(400);
    const row = (await http().post('/v1/student-leave').set(as('parent')).send(body).expect(201)).body;
    expect(row).toMatchObject({ status: 'pending', studentId: t.students[0].id, fromDate: day(1), toDate: day(2) });
  });

  it('the family sees their own applications; staff see everyone\'s and can filter', async () => {
    const mine = (await http().get('/v1/student-leave').set(as('parent')).expect(200)).body;
    expect(mine).toHaveLength(1);
    expect(mine[0].fullName).toBe(t.students[0].fullName);
    expect((await http().get('/v1/student-leave').set(as('parent2')).expect(200)).body).toEqual([]);
    await http().get(`/v1/student-leave?studentId=${t.students[0].id}`).set(as('parent2')).expect(404);
    expect((await http().get('/v1/student-leave?status=pending').set(as('teacher')).expect(200)).body).toHaveLength(1);
    expect((await http().get('/v1/student-leave?status=approved').set(as('teacher')).expect(200)).body).toHaveLength(0);
  });

  it('a teacher decides once; the family cannot decide; a decided request cannot be withdrawn', async () => {
    const id = (await http().get('/v1/student-leave').set(as('parent')).expect(200)).body[0].id;
    await http().post(`/v1/student-leave/${id}/decide`).set(as('parent')).send({ approve: true }).expect(403);
    const done = (await http().post(`/v1/student-leave/${id}/decide`).set(as('teacher')).send({ approve: true, note: 'Get well soon' }).expect(200)).body;
    expect(done).toMatchObject({ status: 'approved', decisionNote: 'Get well soon' });
    await http().post(`/v1/student-leave/${id}/decide`).set(as('principal')).send({ approve: false }).expect(409);
    await http().post(`/v1/student-leave/${id}/cancel`).set(as('parent')).expect(409);
  });

  it('the applicant can withdraw a pending request, nobody else can', async () => {
    const row = (await http().post('/v1/student-leave').set(as('parent')).send({ studentId: t.students[0].id, fromDate: day(5), toDate: day(5), reason: 'Family function' }).expect(201)).body;
    await http().post(`/v1/student-leave/${row.id}/cancel`).set(as('parent2')).expect(404);
    expect((await http().post(`/v1/student-leave/${row.id}/cancel`).set(as('parent')).expect(200)).body.status).toBe('cancelled');
    await http().post(`/v1/student-leave/${row.id}/decide`).set(as('teacher')).send({ approve: true }).expect(409);
  });
});
