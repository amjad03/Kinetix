import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ENV, loadEnv, productionProblems } from '../src/config/env.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/** Production security controls from docs/security/SECURITY_AUDIT.md: sessions, lockout, rate limits, headers, config. */
describe('security controls', () => {
  const owner = ownerPool();
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  const http = () => request(app.getHttpServer());
  const login = (email: string, password = 'pw') => http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password });

  beforeAll(async () => {
    t = await createTenant(owner);
    // Small per-IP budgets so the limits can be reached; the metrics token is set.
    app = await createApp(clock, (b) => b.overrideProvider(ENV).useValue({ ...loadEnv(), LOGIN_PER_IP_PER_MINUTE: 25, PUBLIC_PER_IP_PER_MINUTE: 5, METRICS_TOKEN: 'metrics-token-metrics-token' }));
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('a role taken away stops working at once, though the token still lists it', async () => {
    const token = (await login(t.principal.email!).expect(201)).body.accessToken as string;
    await http().get('/v1/dpdp/requests').set({ authorization: `Bearer ${token}` }).expect(200);
    await owner.query(`delete from user_roles where user_id = $1`, [t.principal.id]);
    await http().get('/v1/dpdp/requests').set({ authorization: `Bearer ${token}` }).expect(403);
    await owner.query(`insert into user_roles (id, tenant_id, user_id, role) values ($1, $2, $3, 'principal')`, [randomUUID(), t.tenantId, t.principal.id]);
    await http().get('/v1/dpdp/requests').set({ authorization: `Bearer ${token}` }).expect(200);
  });

  it('locks an account after 10 wrong passwords: even the right one is refused until the window ends', async () => {
    const email = t.teacher2.email!;
    for (let i = 0; i < 10; i++) await login(email, `wrong-${i}`).expect(401);
    const locked = await login(email);
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('RATE_LIMITED');
  });

  it('sets security headers on API answers and leaves framed pages alone', async () => {
    const res = await http().get('/health').expect(200);
    expect(res.headers['strict-transport-security']).toMatch(/max-age=31536000/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-powered-by']).toBeUndefined();
    const notes = await http().get('/v1/class-notes/not-a-token');
    expect(notes.headers['x-frame-options']).toBeUndefined();
  });

  it('photos are stored without their EXIF (camera location), and a fake image is refused', async () => {
    const token = (await login(t.teacher.email!).expect(201)).body.accessToken as string;
    const withGps = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#336699' } }).withExif({ IFD0: { Make: 'PhoneCo', Model: 'X1' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '12/1 58/1 0/1' } }).jpeg().toBuffer();
    expect((await sharp(withGps).metadata()).exif).toBeDefined();
    const me = (await http().post('/v1/me/photo').set({ authorization: `Bearer ${token}` }).attach('photo', withGps, { filename: 'me.jpg', contentType: 'image/jpeg' }).expect(200)).body;
    const stored = (await http().get(me.photoUrl).set({ authorization: `Bearer ${token}` }).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200)).body as Buffer;
    const meta = await sharp(stored).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.exif).toBeUndefined();
    await http().post('/v1/me/photo').set({ authorization: `Bearer ${token}` }).attach('photo', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('<script>')]), { filename: 'x.jpg', contentType: 'image/jpeg' }).expect(400);
  });

  it('signed-in answers are not cached by default', async () => {
    const token = (await login(t.teacher.email!).expect(201)).body.accessToken as string;
    const res = await http().get('/v1/me').set({ authorization: `Bearer ${token}` }).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('rate limits the public pages per IP', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await http().get(`/v1/public/branding/${t.slug}`)).status);
    expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it('/metrics needs the token (compared in constant time)', async () => {
    await http().get('/metrics').expect(401);
    await http().get('/metrics').set({ authorization: 'Bearer wrong' }).expect(401);
    await http().get('/metrics').set({ authorization: 'Bearer metrics-token-metrics-token' }).expect(200);
  });

  it('refuses to start in production with test-only or missing settings', () => {
    const dev = loadEnv();
    expect(productionProblems(dev)).toEqual([]);
    const prod = { ...dev, DEPLOYMENT: 'production' as const, SMS_PROVIDER: 'console' as const, PAYMENTS_PROVIDER: 'demo' as const, RAZORPAY_FAKE: true, METRICS_TOKEN: undefined, CORS_ORIGINS: [], MFA_ENFORCED_ROLES: [] };
    expect(productionProblems(prod).join('\n')).toMatch(/JWT_SECRET[\s\S]*FAKE[\s\S]*demo[\s\S]*console[\s\S]*METRICS_TOKEN[\s\S]*CORS_ORIGINS[\s\S]*MFA_ENFORCED_ROLES/);
    expect(() => loadEnv({ ...process.env, DEPLOYMENT: 'production' })).toThrow(/DEPLOYMENT=production/);
    const ok = { ...dev, DEPLOYMENT: 'production' as const, JWT_SECRET: 'x'.repeat(40), SMS_PROVIDER: 'msg91' as const, PAYMENTS_PROVIDER: 'razorpay' as const, METRICS_TOKEN: 'm'.repeat(30), CORS_ORIGINS: ['https://erp.example.in'], MFA_ENFORCED_ROLES: ['tenant_admin', 'principal'] };
    expect(productionProblems(ok)).toEqual([]);
  });

  it('requires two-factor for the enforced roles whatever the institution chose', async () => {
    const strict = await createApp(clock, (b) => b.overrideProvider(ENV).useValue({ ...loadEnv(), MFA_ENFORCED_ROLES: ['principal'] }));
    try {
      const res = await request(strict.getHttpServer()).post('/v1/auth/login').send({ tenant: t.slug, login: t.principal.email!, password: 'pw' }).expect(201);
      await request(strict.getHttpServer()).get('/v1/dpdp/requests').set({ authorization: `Bearer ${res.body.accessToken}` }).expect(403);
    } finally {
      await strict.close();
    }
  });
  it('limits password sign-ins per IP across accounts (credential stuffing)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) statuses.push((await login(`nobody${i}@x.in`)).status);
    expect(statuses).toContain(429);
  });
});
