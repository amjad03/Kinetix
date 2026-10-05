import type { INestApplication } from '@nestjs/common';
import { pbkdf2Sync } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { KIOSK_PIN_ITERATIONS, verifyKioskPin } from '../src/common/kiosk-pin.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

// Kiosk mode on boards (docs/hardware/kiosk-mode.md): the ERP sets it and the IT PIN, boards read it.
describe('board kiosk setting', () => {
  const owner = ownerPool();
  const clock = new FixedClock(new Date('2026-10-05T05:00:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let principal: string;
  let teacher: string;
  let device: string;
  const http = () => request(app.getHttpServer());
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const put = (body: object, token = principal) => http().put('/v1/admin/settings').set('authorization', `Bearer ${token}`).send(body);
  const stored = async () => (await owner.query(`select settings from tenants where id = $1`, [t.tenantId])).rows[0].settings;
  const audits = async () => (await owner.query(`select data from audit_log where tenant_id = $1 and action = 'settings.updated' order by id`, [t.tenantId])).rows.map((r) => r.data);
  const config = async (token = device) => (await http().get('/v1/devices/me/config').set('authorization', `Bearer ${token}`).expect(200)).body;

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(clock);
    principal = await login(t.principal.email!);
    teacher = await login(t.teacher.email!);
    device = (await http().post('/v1/devices/enroll').send({ code: t.enrollmentCode, platform: 'android' }).expect(201)).body.deviceToken;
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('is on by default with no PIN, for the ERP and for boards', async () => {
    const res = await http().get('/v1/admin/settings').set('authorization', `Bearer ${principal}`).expect(200);
    expect(res.body.boardKiosk).toEqual({ enabled: true, pinSet: false, pinSetAt: null });
    expect(await config()).toEqual({ kiosk: { enabled: true, algo: null, iterations: null, pinSalt: null, pinHash: null } });
  });

  it('stores only a salted hash of the PIN, returns neither, and audits without it', async () => {
    const res = await put({ boardKiosk: { pin: '482915' } }).expect(200);
    expect(res.body.boardKiosk).toEqual({ enabled: true, pinSet: true, pinSetAt: '2026-10-05T05:00:00.000Z' });
    expect(JSON.stringify(res.body)).not.toContain('482915');
    expect(JSON.stringify(res.body)).not.toContain('pbkdf2');

    const s = await stored();
    expect(JSON.stringify(s)).not.toContain('482915');
    expect(s.boardKiosk.pinHash).toMatch(new RegExp(`^pbkdf2-sha256\\$${KIOSK_PIN_ITERATIONS}\\$[A-Za-z0-9+/=]+\\$[A-Za-z0-9+/=]+$`));
    expect(verifyKioskPin('482915', s.boardKiosk.pinHash)).toBe(true);
    expect(verifyKioskPin('482916', s.boardKiosk.pinHash)).toBe(false);

    // A new salt every time the PIN is set.
    await put({ boardKiosk: { pin: '482915' } }).expect(200);
    expect((await stored()).boardKiosk.pinHash).not.toBe(s.boardKiosk.pinHash);

    const rows = await audits();
    expect(rows.at(-1)).toEqual({ boardKiosk: { pin: 'set' } });
    expect(JSON.stringify(rows)).not.toContain('482915');
    expect(JSON.stringify(rows)).not.toContain((await stored()).boardKiosk.pinHash.split('$')[3]);
  });

  it('gives boards the salt, hash and parameters to check the PIN offline', async () => {
    const k = (await config()).kiosk;
    expect(k).toMatchObject({ enabled: true, algo: 'pbkdf2-sha256', iterations: KIOSK_PIN_ITERATIONS });
    // What the board computes (apps/board/lib/core/kiosk/kiosk_pin.dart).
    const derived = pbkdf2Sync('482915', Buffer.from(k.pinSalt, 'base64'), k.iterations, 32, 'sha256').toString('base64');
    expect(derived).toBe(k.pinHash);
    expect(JSON.stringify(k)).not.toContain('482915');
  });

  it('a board signed in to a class can read it too; users cannot', async () => {
    await http().get('/v1/devices/me/config').set('authorization', `Bearer ${principal}`).expect(403);
    await http().get('/v1/devices/me/config').expect(401);
  });

  it('turns kiosk mode off and on, keeping the PIN, and audits the change', async () => {
    const res = await put({ boardKiosk: { enabled: false } }).expect(200);
    expect(res.body.boardKiosk).toMatchObject({ enabled: false, pinSet: true });
    expect((await config()).kiosk).toMatchObject({ enabled: false, algo: 'pbkdf2-sha256' });
    expect((await audits()).at(-1)).toEqual({ boardKiosk: { enabled: false } });
    await put({ boardKiosk: { enabled: true } }).expect(200);
    expect((await config()).kiosk.enabled).toBe(true);
  });

  it('removes the PIN', async () => {
    const res = await put({ boardKiosk: { pin: null } }).expect(200);
    expect(res.body.boardKiosk).toEqual({ enabled: true, pinSet: false, pinSetAt: null });
    expect((await stored()).boardKiosk.pinHash).toBeNull();
    expect((await config()).kiosk).toEqual({ enabled: true, algo: null, iterations: null, pinSalt: null, pinHash: null });
    expect((await audits()).at(-1)).toEqual({ boardKiosk: { pin: 'removed' } });
  });

  it('validates the PIN and the body, and only leaders may change it', async () => {
    for (const pin of ['123', '123456789', '12a4', ' 1234', 1234]) {
      const res = await put({ boardKiosk: { pin } }).expect(400);
      expect(JSON.stringify(res.body)).not.toContain('pbkdf2');
    }
    await put({ boardKiosk: {} }).expect(400);
    await put({ boardKiosk: { enabled: 'yes' } }).expect(400);
    await put({ boardKiosk: { pinHash: 'pbkdf2-sha256$1$AA==$AA==' } }).expect(400);
    await put({ boardKiosk: { pin: '1234' } }, teacher).expect(403);
    expect((await stored()).boardKiosk.pinHash).toBeNull();
  });

  it('other settings saved later leave the kiosk setting alone', async () => {
    await put({ boardKiosk: { pin: '1234' } }).expect(200);
    const hash = (await stored()).boardKiosk.pinHash;
    await put({ pinFallbackEnabled: true }).expect(200);
    expect((await stored()).boardKiosk.pinHash).toBe(hash);
    expect((await audits()).at(-1)).toEqual({ pinFallbackEnabled: true });
  });
});
