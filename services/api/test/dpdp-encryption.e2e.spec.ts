import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SecretBox } from '../src/common/secret-box.js';
import { rotateAll } from '../src/db/rotate-secrets.js';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, env, FixedClock, ownerPool } from './helpers.js';

/** DPDP special-category data (health, counselling) is encrypted at rest, readable through the API, and rotates with the key. */
describe('column encryption of health and counselling records', () => {
  const owner = ownerPool();
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (w: string) => ({ authorization: `Bearer ${tokens[w]}` });
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  let counsellorId = '';

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(clock);
    const email = `counsellor${Date.now()}@x.in`;
    const [u] = (await owner.query(`insert into users (id, tenant_id, full_name, email, password_hash) values ($1, $2, 'Counsellor', $3, $4) returning id`, [randomUUID(), t.tenantId, email, await argon2.hash('pw')])).rows;
    counsellorId = u.id;
    await owner.query(`insert into user_roles (id, tenant_id, user_id, role) values ($1, $2, $3, 'counsellor')`, [randomUUID(), t.tenantId, u.id]);
    tokens.principal = await login(t.principal.email!);
    tokens.parent = await login(t.guardian.email!);
    tokens.counsellor = await login(email);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  const sealed = (v: string) => /^v\d+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\./.test(v);

  it('stores conditions, medications, allergies, notes and nurse visits encrypted; staff and the family read them in clear', async () => {
    const kid = t.students[0].id;
    const saved = (await http().put(`/v1/student-health/students/${kid}/profile`).set(as('principal')).send({ bloodGroup: 'O+', allergies: ['Peanuts'], conditions: ['Asthma'], medications: ['Salbutamol inhaler'], notes: 'Inhaler with the class mentor' }).expect(200)).body;
    expect(saved).toMatchObject({ allergies: ['Peanuts'], conditions: ['Asthma'], notes: 'Inhaler with the class mentor' });
    await http().post(`/v1/student-health/students/${kid}/visits`).set(as('principal')).send({ complaint: 'Wheezing after PE', action: 'Inhaler, rested 20 minutes' }).expect(201);

    const [row] = (await owner.query('select allergies, conditions, medications, notes, blood_group from health_profiles where student_id = $1', [kid])).rows;
    for (const v of [...row.allergies, ...row.conditions, ...row.medications, row.notes]) expect(sealed(v), v).toBe(true);
    expect(JSON.stringify(row)).not.toMatch(/Asthma|Peanuts|Salbutamol|Inhaler/);
    expect(row.blood_group).toBe('O+'); // printed on ID cards: not encrypted
    const [visit] = (await owner.query('select complaint, action from health_visits where student_id = $1', [kid])).rows;
    expect(sealed(visit.complaint) && sealed(visit.action)).toBe(true);

    const staff = (await http().get(`/v1/student-health/students/${kid}`).set(as('principal')).expect(200)).body;
    expect(staff.profile).toMatchObject({ conditions: ['Asthma'], medications: ['Salbutamol inhaler'] });
    expect(staff.visits[0]).toMatchObject({ complaint: 'Wheezing after PE', action: 'Inhaler, rested 20 minutes' });
    const listed = (await http().get('/v1/student-health/visits').set(as('principal')).expect(200)).body;
    expect(listed[0].complaint).toBe('Wheezing after PE');
    const family = (await http().get(`/v1/parent/children/${kid}/health`).set(as('parent')).expect(200)).body;
    expect(family.profile.allergies).toEqual(['Peanuts']);
  });

  it('a ciphertext moved to another student does not decrypt', async () => {
    const [a] = (await owner.query('select notes from health_profiles where student_id = $1', [t.students[0].id])).rows;
    await owner.query(`insert into health_profiles (id, tenant_id, student_id, notes) values ($1, $2, $3, $4)`, [randomUUID(), t.tenantId, t.students[1].id, a.notes]);
    const other = (await http().get(`/v1/student-health/students/${t.students[1].id}`).set(as('principal')).expect(200)).body;
    expect(other.profile.notes).toBe('[cannot be decrypted]');
  });

  it('encrypts counselling notes; only the counsellor holding the session reads them', async () => {
    const id = randomUUID();
    await owner.query(`insert into counselling_sessions (id, tenant_id, student_id, counsellor_user_id, requested_by, reason, scheduled_at, status) values ($1, $2, $3, $4, $4, 'Exam anxiety', now(), 'scheduled')`, [id, t.tenantId, t.students[0].id, counsellorId]);
    await http().put(`/v1/counselling/sessions/${id}/notes`).set(as('counsellor')).send({ notes: 'Agreed on a study routine' }).expect(200);
    const [r] = (await owner.query('select confidential_notes from counselling_sessions where id = $1', [id])).rows;
    expect(sealed(r.confidential_notes)).toBe(true);
    const mine = (await http().get(`/v1/counselling/sessions/${id}?notes=true`).set(as('counsellor')).expect(200)).body;
    expect(mine.confidentialNotes).toBe('Agreed on a study routine');
  });

  it('key rotation re-encrypts every sealed value and seals rows written before encryption', async () => {
    const legacy = randomUUID();
    await owner.query(`insert into health_visits (id, tenant_id, student_id, visited_at, complaint, action, recorded_by) values ($1, $2, $3, now(), 'Headache', 'Rest', $4)`, [legacy, t.tenantId, t.students[2].id, t.principal.id]);
    // Plain rows from before this change stay readable.
    const before = (await http().get(`/v1/student-health/students/${t.students[2].id}`).set(as('principal')).expect(200)).body;
    expect(before.visits[0].complaint).toBe('Headache');

    const k1 = Buffer.from(env.SECRETS_ENCRYPTION_KEY, 'base64');
    const k2 = Buffer.alloc(32, 9);
    const box2 = new SecretBox({ 1: k1, 2: k2 }, 2);
    const out = await rotateAll(drizzle(owner, { schema: s }), box2);
    expect(out.health_visits.rotated).toBeGreaterThanOrEqual(2);
    expect(out.counselling_sessions.rotated).toBeGreaterThanOrEqual(1);
    expect(out.health_profiles.failed).toBe(1); // the ciphertext moved to another student above
    const [v] = (await owner.query('select complaint from health_visits where id = $1', [legacy])).rows;
    expect(v.complaint).toMatch(/^v2\./);

    // The API on the new key (old key kept for the move) reads everything.
    const saved = { v: process.env.SECRETS_ENCRYPTION_KEY_VERSION, old: process.env.SECRETS_ENCRYPTION_OLD_KEYS, key: process.env.SECRETS_ENCRYPTION_KEY };
    Object.assign(process.env, { SECRETS_ENCRYPTION_KEY: k2.toString('base64'), SECRETS_ENCRYPTION_KEY_VERSION: '2', SECRETS_ENCRYPTION_OLD_KEYS: `1:${k1.toString('base64')}` });
    try {
      const after = (await http().get(`/v1/student-health/students/${t.students[2].id}`).set(as('principal')).expect(200)).body;
      expect(after.visits[0].complaint).toBe('Headache');
      const kid = (await http().get(`/v1/student-health/students/${t.students[0].id}`).set(as('principal')).expect(200)).body;
      expect(kid.profile.conditions).toEqual(['Asthma']);
      // Running it again changes nothing.
      expect((await rotateAll(drizzle(owner, { schema: s }), box2)).health_visits.rotated).toBe(0);
    } finally {
      Object.assign(process.env, { SECRETS_ENCRYPTION_KEY: saved.key });
      if (saved.v === undefined) delete process.env.SECRETS_ENCRYPTION_KEY_VERSION;
      if (saved.old === undefined) delete process.env.SECRETS_ENCRYPTION_OLD_KEYS;
    }
  });
});
