import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type OtpSms, SmsSender } from '../src/auth/sms-sender.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/** Records what would have been texted, so tests can read the code. */
class FakeSms extends SmsSender {
  sent: OtpSms[] = [];
  async sendOtp(sms: OtpSms): Promise<void> {
    this.sent.push(sms);
  }
  last(to: string): string {
    const m = this.sent.filter((s) => s.to === to).at(-1);
    if (!m) throw new Error(`no SMS to ${to}`);
    return m.code;
  }
}

describe('phone sign-in (OTP)', () => {
  const owner = ownerPool();
  const sms = new FakeSms();
  const clock = new FixedClock(new Date());
  let app: INestApplication;
  let a: Awaited<ReturnType<typeof createTenant>>;
  let b: Awaited<ReturnType<typeof createTenant>>;
  const http = () => request(app.getHttpServer());
  const ask = (tenant: string, phone: string) => http().post('/v1/auth/otp/request').send({ tenant, phone });
  const verify = (tenant: string, phone: string, code: string) => http().post('/v1/auth/otp/verify').send({ tenant, phone, code });
  const wrong = (code: string) => (code === '000000' ? '111111' : '000000');
  const setPhone = (userId: string, phone: string) => owner.query('update users set phone = $2 where id = $1', [userId, phone]);

  beforeAll(async () => {
    a = await createTenant(owner);
    b = await createTenant(owner);
    await setPhone(a.teacher.id, '+919800000101');
    await setPhone(a.guardian.id, '+919800000102');
    await setPhone(a.studentUser.id, '+919800000103');
    await setPhone(a.teacher2.id, '+919800000104');
    await setPhone(a.principal.id, '+919800000105');
    // The same number at another institution belongs to someone else there.
    await setPhone(b.guardian.id, '+919800000102');
    await setPhone(b.teacher.id, '+919800000106');
    app = await createApp(clock, (m) => m.overrideProvider(SmsSender).useValue(sms));
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('request → verify signs in with the same body as password login, once', async () => {
    const res = await ask(a.slug, '98000 00101').expect(202);
    expect(res.body).toEqual({ retryAfterSeconds: 30, expiresInSeconds: 300 });
    expect(sms.sent.at(-1)).toMatchObject({ to: '+919800000101', appName: 'KINETIX', language: 'en' });
    const code = sms.last('+919800000101');
    expect(code).toMatch(/^\d{6}$/);

    const signedIn = await verify(a.slug, '+91 98000 00101', code).expect(201);
    const password = await http().post('/v1/auth/login').send({ tenant: a.slug, login: a.teacher.email, password: 'pw' }).expect(201);
    expect(Object.keys(signedIn.body).sort()).toEqual(Object.keys(password.body).sort());
    expect(signedIn.body.user).toEqual(password.body.user);
    expect(signedIn.body.user).toMatchObject({ id: a.teacher.id, roles: ['teacher'] });
    await http().get('/v1/me').set('authorization', `Bearer ${signedIn.body.accessToken}`).expect(200);

    // Used codes do not work again.
    const again = await verify(a.slug, '+919800000101', code).expect(401);
    expect(again.body).toMatchObject({ code: 'OTP_INVALID', message: 'Wrong or expired code' });

    const { rows } = await owner.query(`select data from audit_log where tenant_id = $1 and action = 'auth.sign_in' and actor_id = $2`, [a.tenantId, a.teacher.id]);
    expect(rows.map((r) => r.data.method).sort()).toEqual(['otp', 'password']);
    // Only the HMAC of the code is stored.
    const stored = await owner.query(`select code_hash from otp_codes where tenant_id = $1 and phone = '+919800000101'`, [a.tenantId]);
    expect(stored.rows.every((r) => r.code_hash !== code && r.code_hash.length > 20)).toBe(true);
  });

  it('answers 202 for unknown phones and institutions without sending anything', async () => {
    const before = sms.sent.length;
    expect((await ask(a.slug, '+919899999999').expect(202)).body).toEqual({ retryAfterSeconds: 30, expiresInSeconds: 300 });
    expect((await ask('no-such-school', '+919800000101').expect(202)).body).toEqual({ retryAfterSeconds: 30, expiresInSeconds: 300 });
    // A number registered only at another institution.
    await ask(b.slug, '+919800000103').expect(202);
    expect(sms.sent.length).toBe(before);
    expect((await verify(a.slug, '+919899999999', '123456').expect(401)).body.code).toBe('OTP_INVALID');
  });

  it('does not send codes to inactive users', async () => {
    await owner.query(`update users set status = 'disabled' where id = $1`, [a.principal.id]);
    const before = sms.sent.length;
    await ask(a.slug, '+919800000105').expect(202);
    expect(sms.sent.length).toBe(before);
  });

  it('rejects a wrong code with OTP_INVALID and burns the code after five tries', async () => {
    await ask(a.slug, '+919800000103').expect(202);
    const code = sms.last('+919800000103');
    const first = await verify(a.slug, '+919800000103', wrong(code)).expect(401);
    expect(first.body).toMatchObject({ statusCode: 401, code: 'OTP_INVALID', message: 'Wrong or expired code' });
    for (let i = 0; i < 4; i++) await verify(a.slug, '+919800000103', wrong(code)).expect(401);
    // Five wrong tries: even the right code no longer works.
    expect((await verify(a.slug, '+919800000103', code).expect(401)).body.code).toBe('OTP_INVALID');
    const { rows } = await owner.query(`select attempts, used_at from otp_codes where tenant_id = $1 and phone = '+919800000103'`, [a.tenantId]);
    expect(rows).toEqual([{ attempts: 5, used_at: expect.any(Date) }]);
  });

  it('enforces the 30 s resend gap with 429 RATE_LIMITED, and a new code replaces the old one', async () => {
    await ask(a.slug, '+919800000104').expect(202);
    const first = sms.last('+919800000104');
    const res = await ask(a.slug, '98000 00104').expect(429);
    expect(res.body).toMatchObject({ statusCode: 429, code: 'RATE_LIMITED', retryAfterSeconds: expect.any(Number) });
    expect(res.body.retryAfterSeconds).toBeLessThanOrEqual(30);
    expect(sms.sent.filter((s) => s.to === '+919800000104')).toHaveLength(1);
    expect(first).toMatch(/^\d{6}$/);
  });

  it('codes expire after five minutes', async () => {
    await ask(b.slug, '+919800000106').expect(202);
    const code = sms.last('+919800000106');
    const realNow = clock.at;
    clock.at = new Date(realNow.getTime() + 301_000);
    try {
      expect((await verify(b.slug, '+919800000106', code).expect(401)).body.code).toBe('OTP_INVALID');
    } finally {
      clock.at = realNow;
    }
  });

  it("keeps institutions apart: one tenant's code does not sign in to another with the same phone", async () => {
    await ask(a.slug, '+919800000102').expect(202);
    const codeA = sms.last('+919800000102');
    // Tenant B has no code for this phone yet, and A's code is bound to A.
    expect((await verify(b.slug, '+919800000102', codeA).expect(401)).body.code).toBe('OTP_INVALID');

    await ask(b.slug, '+919800000102').expect(202);
    const codeB = sms.last('+919800000102');
    if (codeB !== codeA) expect((await verify(b.slug, '+919800000102', codeA).expect(401)).body.code).toBe('OTP_INVALID');
    const inB = await verify(b.slug, '+919800000102', codeB).expect(201);
    expect(inB.body.user.id).toBe(b.guardian.id);
    const inA = await verify(a.slug, '+919800000102', codeA).expect(201);
    expect(inA.body.user).toMatchObject({ id: a.guardian.id, roles: ['guardian'] });
  });

  it('rejects malformed phone numbers', async () => {
    expect((await ask(a.slug, '12345-abcde').expect(400)).body.code).toBe('PHONE_INVALID');
  });

  it('limits code requests per phone (3 per 10 minutes)', async () => {
    const realNow = Date.now;
    let offset = 0;
    Date.now = () => realNow() + offset;
    try {
      for (let i = 0; i < 3; i++) {
        await ask(a.slug, '+919811111111').expect(202);
        offset += 31_000;
      }
      expect((await ask(a.slug, '+919811111111').expect(429)).body.code).toBe('RATE_LIMITED');
    } finally {
      Date.now = realNow;
    }
  });
});

describe('health', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp(new FixedClock(new Date()));
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /health is liveness, without auth', async () => {
    expect((await request(app.getHttpServer()).get('/health').expect(200)).body).toEqual({ status: 'ok' });
  });

  it('GET /ready checks the database, migrations and (when configured) Redis', async () => {
    const res = await request(app.getHttpServer()).get('/ready').expect(200);
    expect(res.body).toEqual({ status: 'ready', checks: { database: 'ok', migrations: 'ok', redis: 'not_configured' } });
  });
});
