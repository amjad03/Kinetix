import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('parent gaps: child hostel complaints, per-child meal rating, combined instalments', () => {
  const owner = ownerPool();
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (w: string) => ({ authorization: `Bearer ${tokens[w]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(clock);
    const email = `warden${Date.now()}@pg.in`;
    const [u] = (await owner.query(`insert into users (id, tenant_id, full_name, email, password_hash) values ($1, $2, 'Warden', $3, $4) returning id`, [randomUUID(), t.tenantId, email, await argon2.hash('pw')])).rows;
    await owner.query(`insert into user_roles (id, tenant_id, user_id, role) values ($1, $2, $3, 'hostel_warden')`, [randomUUID(), t.tenantId, u.id]);
    tokens.warden = await login(t.slug, email);
    tokens.parent = await login(t.slug, t.guardian.email!);
    tokens.parent2 = await login(t.slug, t.guardian2.email!);
    // The first guardian gets a second child.
    await owner.query(`insert into guardians (id, tenant_id, user_id, student_id, relation) values ($1, $2, $3, $4, 'father')`, [randomUUID(), t.tenantId, t.guardian.id, t.students[2].id]);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('a guardian reads every complaint about their child, not other children', async () => {
    const [a, b] = [t.students[0].id, t.students[1].id];
    await http().post('/v1/hostel/complaints').set(as('warden')).send({ studentId: a, category: 'maintenance', description: 'Tap leaking' }).expect(201);
    await http().post('/v1/hostel/complaints').set(as('warden')).send({ studentId: b, category: 'maintenance', description: 'Window stuck' }).expect(201);
    expect((await http().get(`/v1/hostel/complaints?studentId=${a}`).set(as('parent')).expect(200)).body).toHaveLength(1);
    await http().get(`/v1/hostel/complaints?studentId=${b}`).set(as('parent')).expect(404);
    expect((await http().get(`/v1/hostel/complaints?studentId=${b}`).set(as('parent2')).expect(200)).body).toHaveLength(1);
  });

  it('a parent rates a meal once per child', async () => {
    const [a, c] = [t.students[0].id, t.students[2].id];
    const base = { mealDate: '2026-10-19', meal: 'lunch', comment: '' };
    await http().post('/v1/canteen/ops/feedback').set(as('parent')).send({ ...base, studentId: a, rating: 4 }).expect(201);
    await http().post('/v1/canteen/ops/feedback').set(as('parent')).send({ ...base, studentId: c, rating: 2 }).expect(201);
    await http().post('/v1/canteen/ops/feedback').set(as('parent')).send({ ...base, studentId: a, rating: 5 }).expect(201);
    await http().post('/v1/canteen/ops/feedback').set(as('parent')).send({ ...base, studentId: t.students[1].id, rating: 5 }).expect(404);
    const { rows } = await owner.query('select student_id, rating from canteen_feedback where tenant_id = $1 order by rating', [t.tenantId]);
    expect(rows.map((r: { student_id: string; rating: number }) => [r.student_id, r.rating])).toEqual([[c, 2], [a, 5]]);
  });

  it('lists all of a child\'s instalment plans together', async () => {
    const a = t.students[0].id;
    for (const [title, amt] of [['Tuition', 100000], ['Lab', 50000]] as const) {
      const id = randomUUID();
      await owner.query(`insert into fee_invoices (id, tenant_id, student_id, section_id, batch_id, title, amount_paise, due_on, created_by) values ($1,$2,$3,$4,$5,$6,$7,'2026-11-01',$8)`, [id, t.tenantId, a, t.section.id, randomUUID(), title, amt, t.principal.id]);
      await owner.query(`insert into fee_instalments (id, tenant_id, invoice_id, seq, due_on, amount_paise) values ($1,$2,$3,1,'2026-11-01',$4), ($5,$2,$3,2,'2026-12-01',$4)`, [randomUUID(), t.tenantId, id, amt / 2, randomUUID()]);
    }
    const list = (await http().get(`/v1/fees/students/${a}/instalments`).set(as('parent')).expect(200)).body;
    expect(list.map((p: { title: string }) => p.title).sort()).toEqual(['Lab', 'Tuition']);
    expect(list[0].instalments).toHaveLength(2);
    await http().get(`/v1/fees/students/${a}/instalments`).set(as('parent2')).expect(404);
  });
});
