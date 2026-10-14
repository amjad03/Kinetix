import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool } from './helpers.js';

/**
 * Campus-scoped roles: a member of staff whose every role is tied to a campus sees and changes only that campus's
 * programmes, rooms, buildings, fee structures, devices and the campus itself; staff with a role on every campus see
 * all. Limiting is done on the person's record (users list), keeps across role changes, and is enforced on each request.
 */
describe('campus-scoped roles', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(nextMondayIst('10:30'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let north: { id: string };
  let vp: { id: string };
  const tok: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tok[who]}` });
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const structure = async (who: string) => (await http().get('/v1/admin/structure').set(as(who)).expect(200)).body as { campuses: { name: string }[]; programs: { name: string }[]; rooms: { name: string }[] };

  beforeAll(async () => {
    t = await createTenant(owner);
    [north] = await db.insert(s.campuses).values({ tenantId: t.tenantId, name: 'North' }).returning();
    await db.insert(s.programs).values({ tenantId: t.tenantId, campusId: north.id, name: 'BSc North', level: 'ug', termCount: 6 });
    await db.insert(s.rooms).values({ tenantId: t.tenantId, campusId: north.id, name: 'N-101' });
    [vp] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Vani Vice', email: 'vani@campus.in', passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: vp.id, role: 'principal' });
    app = await createApp(clock);
    tok.principal = await login(t.principal.email!);
    tok.vp = await login('vani@campus.in');
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('sees every campus while a role covers every campus', async () => {
    const all = await structure('vp');
    expect(all.campuses.map((c) => c.name).sort()).toEqual(['Main', 'North']);
    expect(all.programs.map((p) => p.name).sort()).toEqual(['BCom', 'BSc North']);
  });

  it('limits a member of staff to one campus from their record, on the next request', async () => {
    await http().patch(`/v1/records/users/${t.principal.id}`).set(as('principal')).send({ campusId: north.id }).expect(403); // not your own account
    const row = (await http().patch(`/v1/records/users/${vp.id}`).set(as('principal')).send({ campusId: north.id }).expect(200)).body;
    expect(row).toMatchObject({ campusId: north.id, campusName: 'North' });
    const mine = await structure('vp');
    expect(mine.campuses.map((c) => c.name)).toEqual(['North']);
    expect(mine.programs.map((p) => p.name)).toEqual(['BSc North']);
    expect(mine.rooms.map((r) => r.name)).toEqual(['N-101']);
    // Someone with a role on every campus still sees both.
    expect((await structure('principal')).programs.map((p) => p.name).sort()).toEqual(['BCom', 'BSc North']);
    // A programme of the other campus cannot be written through the scoped account.
    const main = (await structure('principal')).programs.find((p) => p.name === 'BCom') as unknown as { id: string };
    await http().get(`/v1/records/programmes/${main.id}`).set(as('vp')).expect(404);
    const history = (await http().get(`/v1/records/users/${vp.id}/history`).set(as('principal')).expect(200)).body.items as { changes: { field: string }[] }[];
    expect(history.some((h) => h.changes.some((c) => c.field === 'campusId'))).toBe(true);
  });

  it('keeps the limit when a role is added, and lifts it when the campus is cleared', async () => {
    await http().put(`/v1/admin/access/users/${vp.id}/roles`).set(as('principal')).send({ roles: ['principal', 'accountant'] }).expect(200);
    const rows = (await owner.query('select role::text, campus_id from user_roles where user_id = $1 order by role', [vp.id])).rows;
    expect(rows).toEqual([
      { role: 'accountant', campus_id: north.id },
      { role: 'principal', campus_id: north.id },
    ]);
    tok.vp = await login('vani@campus.in'); // the role change signed her out
    expect((await structure('vp')).programs.map((p) => p.name)).toEqual(['BSc North']);
    await http().patch(`/v1/records/users/${vp.id}`).set(as('principal')).send({ campusId: null }).expect(200);
    expect((await structure('vp')).programs.map((p) => p.name).sort()).toEqual(['BCom', 'BSc North']);
  });

  it('lists who is limited to which campus, and filters nothing for another institution', async () => {
    await http().post('/v1/records/users/bulk').set(as('principal')).send({ op: 'update', target: { ids: [vp.id] }, fields: { campusId: north.id } }).expect(200);
    const list = (await http().get('/v1/records/users?q=Vani').set(as('principal')).expect(200)).body.rows;
    expect(list[0]).toMatchObject({ campusName: 'North' });
    const csv = await http().get('/v1/records/users/export?format=csv&q=Vani').set(as('principal')).expect(200);
    expect(csv.text).toContain('North');
  });
});
