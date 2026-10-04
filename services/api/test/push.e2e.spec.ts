import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JobsService } from '../src/jobs/jobs.service.js';
import { PushSender, type PushMessage, type PushResult } from '../src/push/push-sender.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool } from './helpers.js';

class FakePush extends PushSender {
  readonly configured = true;
  sent: PushMessage[] = [];
  invalid = new Set<string>();
  async send(messages: PushMessage[]): Promise<PushResult[]> {
    this.sent.push(...messages);
    return messages.map((m) => (this.invalid.has(m.token) ? 'invalid-token' : 'sent'));
  }
}

describe('push notifications', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  const monday = nextMondayIst('12:00').toISOString().slice(0, 10);
  const push = new FakePush();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const drain = () => app.get(JobsService).drain();
  const mark = (status: string) =>
    http().post('/v1/attendance').set(auth('teacher')).send({ slotId: t.slot.id, date: monday, records: [{ studentId: t.students[0].id, status }] }).expect(201);

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(clock, (b) => b.overrideProvider(PushSender).useValue(push));
    tokens = { teacher: await login(t.teacher.email!), parent: await login(t.guardian.email!), parent2: await login(t.guardian2.email!) };
    await http().post('/v1/push/devices').set(auth('parent')).send({ token: 'phone-of-parent-0001', platform: 'android', app: 'parent' }).expect(204);
    await http().post('/v1/push/devices').set(auth('parent')).send({ token: 'old-tablet-token-0002', platform: 'android', app: 'parent' }).expect(204);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it("pushes an absence to the guardian's phones without personal details", async () => {
    push.invalid.add('old-tablet-token-0002');
    await mark('absent');
    await drain();
    expect(push.sent.map((m) => m.token).sort()).toEqual(['old-tablet-token-0002', 'phone-of-parent-0001']);
    const m = push.sent[0];
    expect(m).toMatchObject({ title: 'Attendance update', body: 'Open KINETIX to see the details.', data: { kind: 'absence' } });
    expect(JSON.stringify(push.sent)).not.toContain('Student A');
    const inbox = await http().get('/v1/notifications').set(auth('parent')).expect(200);
    expect(m.data.notificationId).toBe(inbox.body.items[0].id);

    // The dead token was dropped: the next push goes to the live phone only.
    push.sent = [];
    await mark('present');
    await mark('absent'); // revived alert
    await drain();
    expect(push.sent.map((m) => m.token)).toEqual(['phone-of-parent-0001']);
  });

  it('skips notifications read or withdrawn before the push went out', async () => {
    push.sent = [];
    await mark('present');
    await mark('absent');
    await mark('present'); // withdrawn before the runner got to it
    await drain();
    expect(push.sent).toEqual([]);
  });

  it('moves a phone to whoever signs in on it, and forgets it on sign-out', async () => {
    await http().post('/v1/push/devices').set(auth('parent2')).send({ token: 'phone-of-parent-0001', platform: 'android', app: 'parent' }).expect(204);
    push.sent = [];
    await mark('absent');
    await drain();
    expect(push.sent).toEqual([]); // parent 1 has no phone now; parent 2's child was not marked

    await http().delete('/v1/push/devices').set(auth('parent2')).send({ token: 'phone-of-parent-0001' }).expect(204);
    const { rows } = await owner.query(`select count(*)::int as n from push_devices where tenant_id = $1`, [t.tenantId]);
    expect(rows[0].n).toBe(0);
  });
});
