import type { INestApplication } from '@nestjs/common';
import { pbkdf2Sync } from 'node:crypto';
import type { Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool, pairBoard } from './helpers.js';

// Shared-board profiles (docs/architecture/board-profiles.md): teachers who signed in on a board
// switch to their profile there with a PIN.
describe('shared-board profiles', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let principal: string;
  let teacherBoard: string;
  let deviceToken: string;
  let socket: Socket;
  const http = () => request(app.getHttpServer());
  const login = async (slug: string, email: string) =>
    (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const profiles = async (token = deviceToken) => (await http().get('/v1/devices/me/profiles').set(bearer(token)).expect(200)).body;
  const unlock = (userId: string, pin: string, token = deviceToken) => http().post(`/v1/devices/me/profiles/${userId}/unlock`).set(bearer(token)).send({ pin });
  const row = async (userId: string) =>
    (await owner.query(`select * from device_profiles where device_id = $1 and user_id = $2`, [t.device.id, userId])).rows[0];

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    principal = await login(t.slug, t.principal.email!);
    const paired = await pairBoard(app, t, await login(t.slug, t.teacher.email!));
    teacherBoard = paired.boardToken;
    deviceToken = paired.deviceToken;
    socket = paired.socket;
  });

  afterAll(async () => {
    socket.disconnect();
    await app.close();
    await owner.end();
  });

  it('a full sign-in puts the teacher on the board, without a PIN yet', async () => {
    const list = await profiles();
    expect(list).toEqual([expect.objectContaining({ userId: t.teacher.id, name: t.teacher.fullName, pinSet: false, locked: false, pin: null })]);
    await unlock(t.teacher.id, '4829').expect(404);
  });

  it('the signed-in teacher sets a PIN; only a salted hash is stored', async () => {
    await http().put('/v1/devices/me/profiles/me/pin').set(bearer(teacherBoard)).send({ pin: '12' }).expect(400);
    const weak = await http().put('/v1/devices/me/profiles/me/pin').set(bearer(teacherBoard)).send({ pin: '1234' }).expect(400);
    expect(weak.body.code).toBe('PROFILE_PIN_WEAK');
    // Only a board with the teacher signed in can set it, not the bare device.
    await http().put('/v1/devices/me/profiles/me/pin').set(bearer(deviceToken)).send({ pin: '482917' }).expect(403);

    const res = await http().put('/v1/devices/me/profiles/me/pin').set(bearer(teacherBoard)).send({ pin: '482917' }).expect(200);
    expect(res.body).toMatchObject({ userId: t.teacher.id, pinSet: true });
    const stored = await row(t.teacher.id);
    expect(stored.pin_hash).toMatch(/^pbkdf2-sha256\$/);
    expect(stored.pin_hash).not.toContain('482917');
    expect(JSON.stringify(res.body)).not.toContain('482917');

    // The board gets what it needs to check the PIN offline, and it checks out.
    const [p] = await profiles();
    expect(p.pinSet).toBe(true);
    const derived = pbkdf2Sync('482917', Buffer.from(p.pin.salt, 'base64'), p.pin.iterations, 32, 'sha256').toString('base64');
    expect(derived).toBe(p.pin.hash);
  });

  it('the PIN opens a class session for that teacher, like pairing', async () => {
    const res = await unlock(t.teacher.id, '482917').expect(200);
    expect(res.body.session).toMatchObject({ teacher: { id: t.teacher.id }, section: { displayName: 'BCom Sem 3 A' }, period: { slotId: t.slot.id } });
    const current = await http().get('/v1/sessions/current').set(bearer(res.body.sessionToken)).expect(200);
    expect(current.body.roster).toHaveLength(3);
    // The earlier session on the board was replaced.
    await http().get('/v1/sessions/current').set(bearer(teacherBoard)).expect(401);
    teacherBoard = res.body.sessionToken;
  });

  it('counts wrong PINs and locks the profile on the fifth', async () => {
    for (let left = 4; left >= 1; left--) {
      const res = await unlock(t.teacher.id, '111111').expect(401);
      expect(res.body).toMatchObject({ code: 'PROFILE_PIN_WRONG', attemptsLeft: left });
    }
    const locked = await unlock(t.teacher.id, '111111').expect(403);
    expect(locked.body.code).toBe('PROFILE_LOCKED');
    // Locked: even the right PIN is refused, and the board no longer gets the hash to check offline.
    await unlock(t.teacher.id, '482917').expect(403);
    const [p] = await profiles();
    expect(p).toMatchObject({ locked: true, pin: null });
    const audit = await owner.query(`select action from audit_log where tenant_id = $1 and action in ('board.profile_pin_wrong', 'board.profile_locked') order by id`, [t.tenantId]);
    expect(audit.rows.map((r) => r.action)).toEqual([...Array(4).fill('board.profile_pin_wrong'), 'board.profile_locked']);
  });

  it('a right PIN resets the count', async () => {
    await owner.query(`update device_profiles set failed_attempts = 3, locked_at = null where device_id = $1`, [t.device.id]);
    await unlock(t.teacher.id, '482917').expect(200);
    expect((await row(t.teacher.id)).failed_attempts).toBe(0);
    await owner.query(`update device_profiles set failed_attempts = 5, locked_at = now() where device_id = $1`, [t.device.id]);
  });

  it('admins see the lockout in the ERP and reset the PIN', async () => {
    const list = (await http().get(`/v1/devices/${t.device.id}/profiles`).set(bearer(principal)).expect(200)).body;
    expect(list).toEqual([expect.objectContaining({ userId: t.teacher.id, pinSet: true, locked: true, failedAttempts: 5 })]);
    expect(JSON.stringify(list)).not.toContain('pbkdf2');

    const teacher = await login(t.slug, t.teacher.email!);
    await http().post(`/v1/devices/${t.device.id}/profiles/${t.teacher.id}/reset-pin`).set(bearer(teacher)).expect(403);
    const res = await http().post(`/v1/devices/${t.device.id}/profiles/${t.teacher.id}/reset-pin`).set(bearer(principal)).expect(200);
    expect(res.body).toEqual({ userId: t.teacher.id, pinSet: false, locked: false });
    expect(await row(t.teacher.id)).toMatchObject({ pin_hash: null, failed_attempts: 0, locked_at: null });
    await unlock(t.teacher.id, '482917').expect(404);
  });

  it('a full sign-in lifts a lockout; the teacher then sets a new PIN', async () => {
    await owner.query(`update device_profiles set pin_hash = 'x', failed_attempts = 5, locked_at = now() where device_id = $1`, [t.device.id]);
    const { boardToken, socket: s2 } = await pairAgain();
    s2.disconnect();
    expect(await row(t.teacher.id)).toMatchObject({ failed_attempts: 0, locked_at: null });
    await http().put('/v1/devices/me/profiles/me/pin').set(bearer(boardToken)).send({ pin: '7351' }).expect(200);
    await unlock(t.teacher.id, '7351').expect(200);
  });

  it('keeps every teacher who signed in, most recent first', async () => {
    clock.at = new Date(clock.at.getTime() + 60_000);
    const { socket: s3 } = await pairAgain(t.teacher2.email!);
    s3.disconnect();
    const list = await profiles();
    expect(list.map((p: { userId: string }) => p.userId)).toEqual([t.teacher2.id, t.teacher.id]);
  });

  it("another institution's admin and boards cannot see or touch the profiles", async () => {
    const otherAdmin = await login(other.slug, other.principal.email!);
    expect((await http().get(`/v1/devices/${t.device.id}/profiles`).set(bearer(otherAdmin)).expect(200)).body).toEqual([]);
    await http().post(`/v1/devices/${t.device.id}/profiles/${t.teacher.id}/reset-pin`).set(bearer(otherAdmin)).expect(404);
    const otherDevice = (await http().post('/v1/devices/enroll').send({ code: other.enrollmentCode, platform: 'android' }).expect(201)).body.deviceToken;
    expect(await profiles(otherDevice)).toEqual([]);
    await unlock(t.teacher.id, '7351', otherDevice).expect(404);
    await http().get('/v1/devices/me/profiles').set(bearer(otherAdmin)).expect(403);
  });

  it('a teacher can take their profile off the board; admins can remove one', async () => {
    const res = await unlock(t.teacher.id, '7351').expect(200);
    await http().delete('/v1/devices/me/profiles/me').set(bearer(res.body.sessionToken)).expect(204);
    expect((await profiles()).map((p: { userId: string }) => p.userId)).toEqual([t.teacher2.id]);
    await http().delete(`/v1/devices/${t.device.id}/profiles/${t.teacher2.id}`).set(bearer(principal)).expect(204);
    expect(await profiles()).toEqual([]);
  });

  /** A full sign-in with the Teacher app on the already-enrolled board. */
  async function pairAgain(email = t.teacher.email!) {
    const teacher = await login(t.slug, email);
    const { code } = (await http().post('/v1/devices/me/pairing-codes').set(bearer(deviceToken)).expect(201)).body;
    const { io } = await import('socket.io-client');
    const url = (await app.getUrl()).replace('[::1]', 'localhost');
    const s = io(`${url}/realtime`, { auth: { token: deviceToken }, transports: ['websocket'] });
    await new Promise((r) => s.once('ready', r));
    const claimed = new Promise<{ sessionToken: string }>((r) => s.once('pairing.claimed', r));
    await http().post('/v1/pairing/claim').set(bearer(teacher)).send({ code }).expect(200);
    return { boardToken: (await claimed).sessionToken, socket: s };
  }
});
