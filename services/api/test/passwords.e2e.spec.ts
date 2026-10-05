import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type OtpSms, SmsSender } from '../src/auth/sms-sender.js';
import { passwordProblem } from '../src/auth/password-policy.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

class FakeSms extends SmsSender {
  sent: OtpSms[] = [];
  async sendOtp(sms: OtpSms): Promise<void> {
    this.sent.push(sms);
  }
}

describe('passwords: change, forced change of temporary passwords, admin reset', () => {
  const owner = ownerPool();
  const sms = new FakeSms();
  let app: INestApplication;
  let a: Awaited<ReturnType<typeof createTenant>>;
  let b: Awaited<ReturnType<typeof createTenant>>;
  let principalToken: string;
  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const login = (tenant: string, email: string, password: string) => http().post('/v1/auth/login').send({ tenant, login: email, password });
  const change = (token: string, body: object) => http().post('/v1/me/password').set(bearer(token)).send(body);
  const audits = async (action: string, subjectId: string) =>
    (await owner.query('select actor_id, subject_id, data from audit_log where action = $1 and subject_id = $2', [action, subjectId])).rows;

  beforeAll(async () => {
    a = await createTenant(owner);
    b = await createTenant(owner);
    app = await createApp(new FixedClock(new Date()), (m) => m.overrideProvider(SmsSender).useValue(sms));
    principalToken = (await login(a.slug, a.principal.email!, 'pw').expect(201)).body.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('the policy: length, not the current one, not common, not the email name', () => {
    const ctx = { email: 'ravi.kumar@x.in', current: 'Old-password-1' };
    expect(passwordProblem('short', ctx)).toBe('Use at least 10 characters');
    expect(passwordProblem('Old-password-1', ctx)).toBe('Choose a password different from the current one');
    expect(passwordProblem('Password@123', ctx)).toBe('This password is too easy to guess');
    expect(passwordProblem('1234567890', ctx)).toBe('This password is too easy to guess');
    expect(passwordProblem('my-Ravi.Kumar-pass', ctx)).toBe('The password must not contain your email name');
    expect(passwordProblem('Blue-mango-tree-42', ctx)).toBeNull();
    expect(passwordProblem('Blue-mango-tree-42', { email: null })).toBeNull();
  });

  it('a normal password sign-in does not ask for a change', async () => {
    const res = await login(a.slug, a.teacher2.email!, 'pw').expect(201);
    expect(res.body.mustChangePassword).toBe(false);
    const me = await http().get('/v1/me').set(bearer(res.body.accessToken)).expect(200);
    expect(me.body).toMatchObject({ mustChangePassword: false, hasPassword: true });
  });

  it('admin reset: only principal/admin, not oneself, not the administrator by a principal, only in the tenant', async () => {
    const teacherToken = (await login(a.slug, a.teacher2.email!, 'pw').expect(201)).body.accessToken;
    await http().post(`/v1/admin/users/${a.teacher.id}/reset-password`).set(bearer(teacherToken)).expect(403);
    const self = await http().post(`/v1/admin/users/${a.principal.id}/reset-password`).set(bearer(principalToken)).expect(400);
    expect(self.body.code).toBe('PASSWORD_RESET_SELF');
    await http().post(`/v1/admin/users/${b.teacher.id}/reset-password`).set(bearer(principalToken)).expect(404);
    await http().post('/v1/admin/users/not-a-uuid/reset-password').set(bearer(principalToken)).expect(400);

    const { rows } = await owner.query(`insert into users (tenant_id, full_name, email, password_hash) values ($1, 'Admin', $2, $3) returning id`, [a.tenantId, `admin-${a.slug}@x.in`, await argon2.hash('pw')]);
    await owner.query(`insert into user_roles (tenant_id, user_id, role) values ($1, $2, 'tenant_admin')`, [a.tenantId, rows[0].id]);
    const refused = await http().post(`/v1/admin/users/${rows[0].id}/reset-password`).set(bearer(principalToken)).expect(403);
    expect(refused.body.code).toBe('PASSWORD_RESET_NOT_ALLOWED');
    // The administrator may reset the principal.
    const adminToken = (await login(a.slug, `admin-${a.slug}@x.in`, 'pw').expect(201)).body.accessToken;
    const ok = await http().post(`/v1/admin/users/${a.principal.id}/reset-password`).set(bearer(adminToken)).expect(200);
    expect(ok.body).toMatchObject({ userId: a.principal.id, mustChangePassword: true });
    // Put the principal back for the other tests.
    await owner.query('update users set password_hash = $2, password_must_change = false where id = $1', [a.principal.id, await argon2.hash('pw')]);
  });

  it('reset → sign in with the temporary password → only /v1/me, the change and sign-out work → change → everything works', async () => {
    const reset = await http().post(`/v1/admin/users/${a.teacher.id}/reset-password`).set(bearer(principalToken)).expect(200);
    const temp = reset.body.temporaryPassword as string;
    expect(temp).toMatch(/^[A-Za-z2-9]{14}$/);
    expect(await audits('auth.password_reset', a.teacher.id)).toEqual([expect.objectContaining({ actor_id: a.principal.id })]);
    const { rows: stored } = await owner.query('select password_hash, password_must_change from users where id = $1', [a.teacher.id]);
    expect(stored[0]).toMatchObject({ password_must_change: true });
    expect(stored[0].password_hash).toMatch(/^\$argon2/);

    await login(a.slug, a.teacher.email!, 'pw').expect(401);
    const signedIn = await login(a.slug, a.teacher.email!, temp).expect(201);
    expect(signedIn.body.mustChangePassword).toBe(true);
    const flagged = signedIn.body.accessToken as string;

    const me = await http().get('/v1/me').set(bearer(flagged)).expect(200);
    expect(me.body).toMatchObject({ id: a.teacher.id, mustChangePassword: true });
    for (const r of [http().get('/v1/teacher/timetable'), http().patch('/v1/me').send({ preferredLanguage: 'hi' }), http().get('/v1/calendar')]) {
      const res = await r.set(bearer(flagged)).expect(403);
      expect(res.body).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password first' });
    }
    await http().delete('/v1/push/devices').set(bearer(flagged)).send({ token: 'push-token-123' }).expect(204);

    // Errors, by code.
    expect((await change(flagged, { currentPassword: 'wrong-one', newPassword: 'Blue-mango-tree-42' }).expect(403)).body.code).toBe('WRONG_PASSWORD');
    expect((await change(flagged, { newPassword: 'Blue-mango-tree-42' }).expect(400)).body.code).toBe('CURRENT_PASSWORD_REQUIRED');
    expect((await change(flagged, { currentPassword: temp, newPassword: 'short' }).expect(400)).body.code).toBe('PASSWORD_TOO_SHORT');
    expect((await change(flagged, { currentPassword: temp, newPassword: temp }).expect(400)).body.code).toBe('PASSWORD_UNCHANGED');
    expect((await change(flagged, { currentPassword: temp, newPassword: 'qwertyuiop' }).expect(400)).body.code).toBe('PASSWORD_TOO_WEAK');
    const local = a.teacher.email!.split('@')[0];
    expect((await change(flagged, { currentPassword: temp, newPassword: `My-${local}-pass` }).expect(400)).body.code).toBe('PASSWORD_CONTAINS_LOGIN');
    expect((await change(flagged, { currentPassword: temp }).expect(400)).body.code).toBe('VALIDATION');
    expect((await owner.query('select password_must_change from users where id = $1', [a.teacher.id])).rows[0].password_must_change).toBe(true);

    const done = await change(flagged, { currentPassword: temp, newPassword: 'Blue-mango-tree-42' }).expect(200);
    expect(done.body).toEqual({ accessToken: expect.any(String), mustChangePassword: false });
    const fresh = done.body.accessToken as string;
    await http().get('/v1/teacher/timetable').set(bearer(fresh)).expect(200);
    expect((await http().get('/v1/me').set(bearer(fresh)).expect(200)).body.mustChangePassword).toBe(false);
    // The old token stays restricted until it expires.
    await http().get('/v1/teacher/timetable').set(bearer(flagged)).expect(403);

    expect((await owner.query('select password_must_change from users where id = $1', [a.teacher.id])).rows[0].password_must_change).toBe(false);
    expect(await audits('auth.password_changed', a.teacher.id)).toEqual([expect.objectContaining({ actor_id: a.teacher.id, data: { wasTemporary: true, firstPassword: false } })]);
    await login(a.slug, a.teacher.email!, temp).expect(401);
    expect((await login(a.slug, a.teacher.email!, 'Blue-mango-tree-42').expect(201)).body.mustChangePassword).toBe(false);

    // Changing again any time, from the account menu.
    await change(fresh, { currentPassword: 'Blue-mango-tree-42', newPassword: 'Green-mango-tree-43' }).expect(200);
  });

  it('a temporary-password token cannot open the realtime socket', async () => {
    const { io } = await import('socket.io-client');
    const reset = await http().post(`/v1/admin/users/${a.teacher2.id}/reset-password`).set(bearer(principalToken)).expect(200);
    const flagged = (await login(a.slug, a.teacher2.email!, reset.body.temporaryPassword).expect(201)).body.accessToken;
    const url = (await app.getUrl()).replace('[::1]', 'localhost');
    const socket = io(`${url}/realtime`, { auth: { token: flagged }, transports: ['websocket'], reconnection: false });
    const outcome = await new Promise<string>((r) => {
      socket.once('ready', () => r('ready'));
      socket.once('disconnect', () => r('disconnected'));
    });
    socket.close();
    expect(outcome).toBe('disconnected');
  });

  it('is rate-limited like sign-in', async () => {
    const token = (await login(a.slug, a.guardian2.email!, 'pw').expect(201)).body.accessToken;
    for (let i = 0; i < 10; i++) await change(token, { currentPassword: `wrong-${i}`, newPassword: 'Blue-mango-tree-42' }).expect(403);
    const limited = await change(token, { currentPassword: 'pw', newPassword: 'Blue-mango-tree-42' }).expect(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
  });

  it('phone sign-in never asks for a change; a phone-only account may set a first password without a current one', async () => {
    await owner.query(`update users set phone = '+919800000201', password_hash = null, password_must_change = true where id = $1`, [a.guardian.id]);
    await http().post('/v1/auth/otp/request').send({ tenant: a.slug, phone: '+919800000201' }).expect(202);
    const code = sms.sent.filter((s) => s.to === '+919800000201').at(-1)!.code;
    const signedIn = await http().post('/v1/auth/otp/verify').send({ tenant: a.slug, phone: '+919800000201', code }).expect(201);
    expect(signedIn.body.mustChangePassword).toBe(false);
    const token = signedIn.body.accessToken as string;
    expect((await http().get('/v1/me').set(bearer(token)).expect(200)).body).toMatchObject({ mustChangePassword: false, hasPassword: false });

    await change(token, { newPassword: 'Blue-mango-tree-42' }).expect(200);
    expect(await audits('auth.password_changed', a.guardian.id)).toEqual([expect.objectContaining({ data: { wasTemporary: true, firstPassword: true } })]);
    // Now that there is a password, the current one is needed.
    expect((await change(token, { newPassword: 'Green-mango-tree-43' }).expect(400)).body.code).toBe('CURRENT_PASSWORD_REQUIRED');
    expect((await login(a.slug, a.guardian.email!, 'Blue-mango-tree-42').expect(201)).body.mustChangePassword).toBe(false);
  });
});
