import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JobsService } from '../src/jobs/jobs.service.js';
import { PushSender, type PushMessage, type PushResult } from '../src/push/push-sender.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool, pairBoard } from './helpers.js';

class FakePush extends PushSender {
  readonly configured = true;
  sent: PushMessage[] = [];
  async send(messages: PushMessage[]): Promise<PushResult[]> {
    this.sent.push(...messages);
    return messages.map(() => 'sent');
  }
}

/**
 * Mobile apps pass: refresh tokens for app sign-ins (rotation, the race window, reuse ends the session), sign-out on
 * the phone, the forced-update gate, crash reports, personal notification settings, and the board's screensaver and
 * full-screen attendance code.
 */
describe('mobile apps pass', () => {
  const owner = ownerPool();
  // Monday 10:05 IST: five minutes into the teacher's 10:00–10:55 class in Room 1.
  const clock = new FixedClock(nextMondayIst('10:05'));
  const monday = nextMondayIst('12:00').toISOString().slice(0, 10);
  const push = new FakePush();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const mobileLogin = (slug: string, email: string) =>
    http().post('/v1/auth/login').set({ 'x-zynetix-client': 'mobile', 'x-device-name': 'Parent App on Pixel 8' }).send({ tenant: slug, login: email, password: 'pw' }).expect(201);
  const webLogin = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const refresh = (refreshToken: string) => http().post('/v1/auth/refresh').send({ refreshToken });
  const audited = async (action: string) => (await owner.query('select count(*)::int as n from audit_log where tenant_id = $1 and action = $2', [t.tenantId, action])).rows[0].n as number;
  const at = (minutesFromStart: number) => (clock.at = new Date(nextMondayIst('10:05').getTime() + minutesFromStart * 60_000));

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock, (b) => b.overrideProvider(PushSender).useValue(push));
    tokens.teacher = await webLogin(t.slug, t.teacher.email!);
    tokens.principal = await webLogin(t.slug, t.principal.email!);
    tokens.student = await webLogin(t.slug, t.studentUser.email!);
    tokens.parent = await webLogin(t.slug, t.guardian.email!);
    tokens.outsider = await webLogin(other.slug, other.principal.email!);
    // The principal of the second tenant is on the ZYNETIX platform team.
    await owner.query('insert into platform_admins (user_id) values ($1) on conflict do nothing', [other.principal.id]);
  });

  afterAll(async () => {
    await owner.query(`update app_releases set min_version = '0.0.0', latest_version = '0.0.0', message = '' where app = 'parent'`);
    await app.close();
    await owner.end();
  });

  describe('staying signed in on a phone', () => {
    it('gives an app sign-in a refresh token and the access token expiry; a browser sign-in gets neither refresh nor a mobile session', async () => {
      at(0);
      const r = (await mobileLogin(t.slug, t.guardian.email!)).body;
      expect(r.refreshToken).toMatch(new RegExp(`^${t.tenantId}\\.[0-9a-f-]{36}\\.[\\w-]{40,}$`));
      // 12 hours from the clock, to the second.
      expect(r.expiresAt).toBe(new Date(JSON.parse(Buffer.from(r.accessToken.split(".")[1], "base64url").toString()).exp * 1000).toISOString());
      const web = (await http().post('/v1/auth/login').send({ tenant: t.slug, login: t.guardian.email, password: 'pw' }).expect(201)).body;
      expect(web.refreshToken).toBeUndefined();
      const { rows } = await owner.query<{ client: string; label: string; has: boolean }>(
        `select client, label, refresh_hash is not null as has from user_sessions where user_id = $1 order by created_at`,
        [t.guardian.id],
      );
      expect(rows.filter((x) => x.client === 'mobile')).toEqual([{ client: 'mobile', label: 'Parent App on Pixel 8', has: true }]);
      // The secret itself is never stored, only its hash.
      const secret = (r.refreshToken as string).split('.')[2];
      const stored = await owner.query(`select count(*)::int as n from user_sessions where refresh_hash = $1`, [secret]);
      expect(stored.rows[0].n).toBe(0);
    });

    it('rotates the refresh token; two refreshes at once is a race, the same old token a minute later ends the session', async () => {
      at(0);
      const first = (await mobileLogin(t.slug, t.guardian.email!)).body;
      at(60); // an hour later
      const second = (await refresh(first.refreshToken).expect(200)).body;
      expect(second.refreshToken).not.toBe(first.refreshToken);
      expect(Date.parse(second.expiresAt)).toBeGreaterThan(Date.now() + 11 * 3600_000);
      await http().get('/v1/me').set(bearer(second.accessToken)).expect(200);

      // 20 seconds later the app's second request presents the old token again: told to retry, nothing revoked.
      clock.at = new Date(clock.at.getTime() + 20_000);
      expect((await refresh(first.refreshToken).expect(409)).body.code).toBe('REFRESH_RACE');
      await http().get('/v1/me').set(bearer(second.accessToken)).expect(200);

      // Two minutes on, the old token again: someone copied it. The session ends for everyone holding it.
      clock.at = new Date(clock.at.getTime() + 120_000);
      expect((await refresh(first.refreshToken).expect(401)).body.code).toBe('REFRESH_REUSED');
      await refresh(second.refreshToken).expect(401);
      await http().get('/v1/me').set(bearer(second.accessToken)).expect(401);
      expect(await audited('auth.refresh_reused')).toBe(1);
    });

    it('signs out on the phone: the access and refresh tokens stop at once', async () => {
      at(0);
      const s = (await mobileLogin(t.slug, t.guardian.email!)).body;
      await http().post('/v1/me/sign-out').set(bearer(s.accessToken)).expect(204);
      await http().get('/v1/me').set(bearer(s.accessToken)).expect(401);
      await refresh(s.refreshToken).expect(401);
      expect(await audited('auth.sign_out')).toBe(1);
    });

    it('refuses an expired, malformed or tampered refresh token and one moved to another institution', async () => {
      at(0);
      const s = (await mobileLogin(t.slug, t.guardian.email!)).body;
      const [, sessionId, secret] = (s.refreshToken as string).split('.');
      await refresh(`${other.tenantId}.${sessionId}.${secret}`).expect(401);
      await refresh(`${t.tenantId}.${sessionId}.${secret.slice(0, -2)}xx`).expect(401);
      await refresh('not-a-token-at-all-but-long-enough-to-pass-the-length-check').expect(401);
      await http().post('/v1/auth/refresh').send({}).expect(400);
      // 61 days without opening the app: sign in again.
      clock.at = new Date(clock.at.getTime() + 61 * 86_400_000);
      expect((await refresh(s.refreshToken).expect(401)).body.code).toBe('REFRESH_INVALID');
      at(0);
    });

    it('a disabled account cannot refresh', async () => {
      at(0);
      const s = (await mobileLogin(t.slug, t.guardian2.email!)).body;
      await owner.query(`update users set status = 'disabled' where id = $1`, [t.guardian2.id]);
      await refresh(s.refreshToken).expect(401);
      await owner.query(`update users set status = 'active' where id = $1`, [t.guardian2.id]);
    });
  });

  describe('forced and recommended updates', () => {
    it('answers ok for any version until the platform team sets one, then update_required below the minimum', async () => {
      const check = (version: string) => http().get(`/v1/public/app-versions/check?app=parent&platform=android&version=${encodeURIComponent(version)}`).expect(200);
      expect((await check('0.1.0')).body).toMatchObject({ status: 'ok', minVersion: '0.0.0', storeUrl: 'https://play.google.com/store/apps/details?id=in.zynetix.parent' });
      await http().get('/v1/public/app-versions/check?app=parent&platform=android&version=banana').expect(400);
      await http().get('/v1/public/app-versions/check?app=erp&platform=android&version=1.0.0').expect(400);

      const release = { app: 'parent', platform: 'android', minVersion: '1.2.0', latestVersion: '1.3.0', storeUrl: 'https://play.google.com/store/apps/details?id=in.zynetix.parent', message: 'Fee receipts need this version.' };
      await http().put('/v1/platform/app-releases').set(auth('principal')).send(release).expect(403);
      await http().put('/v1/platform/app-releases').set(auth('outsider')).send({ ...release, minVersion: '1.4.0' }).expect(400);
      await http().put('/v1/platform/app-releases').set(auth('outsider')).send({ ...release, storeUrl: 'http://evil.example' }).expect(400);
      await http().put('/v1/platform/app-releases').set(auth('outsider')).send(release).expect(200);

      expect((await check('1.1.9+40')).body).toMatchObject({ status: 'update_required', minVersion: '1.2.0', latestVersion: '1.3.0', message: 'Fee receipts need this version.' });
      expect((await check('1.2.0')).body.status).toBe('update_available');
      expect((await check('1.10.0')).body.status).toBe('ok'); // 1.10 is newer than 1.3, not older
      // iOS was not touched.
      expect((await http().get('/v1/public/app-versions/check?app=parent&platform=ios&version=1.0.0').expect(200)).body.status).toBe('ok');
      const rows = (await http().get('/v1/platform/app-releases').set(auth('outsider')).expect(200)).body as { app: string }[];
      expect(rows).toHaveLength(8);
    });
  });

  describe('crash reports', () => {
    it('groups the same crash, scrubs personal data, and lets the platform team close it', async () => {
      const crash = {
        app: 'teacher',
        platform: 'android',
        appVersion: '0.4.0+12',
        osVersion: 'Android 14',
        kind: 'flutter',
        message: 'Null check operator used on a null value while saving marks for priya@school.in (+91 98450 12345) token=eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl',
        stack: '#0      MarksController.save (package:zynetix_teacher/features/marks/marks_controller.dart:120:7)\n#1      _rootRun (dart:async/zone.dart:1525:13)',
        tenant: t.slug,
      };
      await http().post('/v1/public/client-errors').send(crash).expect(202);
      await http().post('/v1/public/client-errors').send({ ...crash, message: crash.message.replace('priya', 'ravi'), fatal: true }).expect(202);
      await http().post('/v1/public/client-errors').send({ ...crash, kind: 'nonsense' }).expect(400);
      const list = (await http().get('/v1/platform/client-errors?app=teacher').set(auth('outsider')).expect(200)).body as { id: string; occurrences: number; message: string; fatal: boolean }[];
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ occurrences: 2, fatal: true });
      expect(list[0].message).not.toMatch(/priya|ravi|98450|eyJ/);
      expect(list[0].message).toContain('<email>');
      await http().get('/v1/platform/client-errors').set(auth('principal')).expect(403);
      await http().post(`/v1/platform/client-errors/${list[0].id}/resolve`).set(auth('outsider')).expect(204);
      expect((await http().get('/v1/platform/client-errors?app=teacher').set(auth('outsider')).expect(200)).body).toHaveLength(0);
      // It comes back: the group opens again.
      await http().post('/v1/public/client-errors').send(crash).expect(202);
      expect((await http().get('/v1/platform/client-errors?app=teacher').set(auth('outsider')).expect(200)).body[0].occurrences).toBe(3);
    });
  });

  describe('personal notification settings', () => {
    const markAbsent = async () => {
      await http().post('/v1/attendance').set(auth('teacher')).send({ slotId: t.slot.id, date: monday, records: [{ studentId: t.students[0].id, status: 'present' }] }).expect(201);
      await http().post('/v1/attendance').set(auth('teacher')).send({ slotId: t.slot.id, date: monday, records: [{ studentId: t.students[0].id, status: 'absent' }] }).expect(201);
    };

    beforeAll(async () => {
      await http().post('/v1/push/devices').set(auth('parent')).send({ token: 'phone-of-parent-mobile-pass', platform: 'android', app: 'parent' }).expect(204);
    });

    it('validates and saves them per person', async () => {
      const empty = (await http().get('/v1/me/notification-preferences').set(auth('parent')).expect(200)).body;
      expect(empty).toMatchObject({ pushOff: [], quietStart: null, quietEnd: null });
      expect(empty.kinds).toContain('absence');
      await http().put('/v1/me/notification-preferences').set(auth('parent')).send({ pushOff: ['nonsense'], quietStart: null, quietEnd: null }).expect(400);
      await http().put('/v1/me/notification-preferences').set(auth('parent')).send({ pushOff: [], quietStart: '22:00', quietEnd: null }).expect(400);
      await http().put('/v1/me/notification-preferences').set(auth('parent')).send({ pushOff: [], quietStart: '25:00', quietEnd: '06:00' }).expect(400);
      await http().put('/v1/me/notification-preferences').set(auth('parent')).send({ pushOff: [], quietStart: '06:00', quietEnd: '06:00' }).expect(400);
      // Another person's settings are their own.
      expect((await http().get('/v1/me/notification-preferences').set(auth('student')).expect(200)).body.pushOff).toEqual([]);
    });

    it('a kind turned off still reaches the inbox but sends no push', async () => {
      at(0);
      await http().put('/v1/me/notification-preferences').set(auth('parent')).send({ pushOff: ['absence', 'absence'], quietStart: null, quietEnd: null }).expect(200);
      push.sent = [];
      await markAbsent();
      await app.get(JobsService).drain();
      expect(push.sent).toEqual([]);
      const inbox = (await http().get('/v1/notifications').set(auth('parent')).expect(200)).body;
      expect(inbox.items[0]).toMatchObject({ kind: 'absence', readAt: null });
      expect(await audited('notifications.preferences_set')).toBe(1);
    });

    it('quiet hours hold the push until they end (10:05 inside 09:00–11:30 IST: queued for 11:30)', async () => {
      at(0);
      await http().put('/v1/me/notification-preferences').set(auth('parent')).send({ pushOff: [], quietStart: '09:00', quietEnd: '11:30' }).expect(200);
      push.sent = [];
      await markAbsent();
      await app.get(JobsService).drain();
      expect(push.sent).toEqual([]);
      const { rows } = await owner.query<{ run_after: Date }>(`select run_after from jobs where tenant_id = $1 and kind = 'push.send' and run_after > now() order by run_after desc limit 1`, [t.tenantId]);
      expect(rows[0].run_after.toISOString()).toBe(nextMondayIst('11:30').toISOString());
      await http().put('/v1/me/notification-preferences').set(auth('parent')).send({ pushOff: [], quietStart: null, quietEnd: null }).expect(200);
    });
  });

  describe('the board between classes and in class', () => {
    let deviceToken = '';
    let boardToken = '';

    beforeAll(async () => {
      at(0);
      const paired = await pairBoard(app, t, tokens.teacher);
      deviceToken = paired.deviceToken;
      boardToken = paired.boardToken;
      paired.socket.close();
      await owner.query(
        `insert into announcements (tenant_id, sender_id, title, body, priority, channels, audience, status, sent_at)
         values ($1, $2, 'Sports day on Friday', 'All classes end at 12:30.', 'normal', '{boards}', '{"scope":"all"}', 'sent', $3),
                ($1, $2, 'Fire drill at 11:00', 'Leave by the east stairs.', 'emergency', '{boards}', '{"scope":"all"}', 'sent', $3),
                ($1, $2, 'Parents only: fee reminder', 'Pay by the 10th.', 'normal', '{parent}', '{"scope":"all"}', 'sent', $3),
                ($1, $2, 'Old notice', 'Last month.', 'normal', '{boards}', '{"scope":"all"}', 'sent', $4)`,
        [t.tenantId, t.principal.id, clock.at, new Date(clock.at.getTime() - 30 * 86_400_000)],
      );
    });

    it('shows the room, the period on now and the notices sent to boards on the screensaver (device token only)', async () => {
      const idle = (await http().get('/v1/devices/me/idle').set(bearer(deviceToken)).expect(200)).body;
      expect(idle).toMatchObject({ institution: expect.stringMatching(/^Tenant /), room: 'Room 1', time: '10:05', holiday: null });
      expect(idle.current).toMatchObject({ subject: 'Corporate Accounting', section: 'BCom Sem 3 A', startsAt: '10:00', endsAt: '10:55' });
      expect(idle.next).toBeNull();
      // Emergency first, boards only, nothing older than two weeks.
      expect(idle.notices.map((n: { title: string }) => n.title)).toEqual(['Fire drill at 11:00', 'Sports day on Friday']);
      await http().get('/v1/devices/me/idle').set(auth('teacher')).expect(403);
      await http().get('/v1/devices/me/idle').expect(401);
    });

    it('shows the class its self-mark code full screen; a student who scans it is present', async () => {
      const q = (await http().post('/v1/classroom/attendance-qr').set(bearer(boardToken)).expect(200)).body;
      expect(q).toMatchObject({ slotId: t.slot.id, section: 'BCom Sem 3 A', subject: 'Corporate Accounting', ttlSeconds: 30 });
      expect(q.code).toMatch(/^\d{8}$/);
      await http().post('/v1/classroom/attendance-qr').set(auth('teacher')).expect(403);
      const scan = (await http().post('/v1/student/attendance/scan').set(auth('student')).send({ code: q.code, deviceId: 'install-student-c-mobile' }).expect(200)).body;
      expect(scan).toMatchObject({ status: 'present', outcome: 'accepted' });
      // After the class there is no code to show.
      at(60);
      await http().post('/v1/classroom/attendance-qr').set(bearer(boardToken)).expect((r) => expect([401, 404]).toContain(r.status));
      at(0);
    });
  });
});
