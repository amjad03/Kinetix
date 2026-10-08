import type { INestApplication } from '@nestjs/common';
import { RealtimeEvents, type DeviceActionEvent } from '@kinetix/shared';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

const next = <T>(s: Socket, event: string, ms = 2000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event}`)), ms);
    s.once(event, (v: T) => {
      clearTimeout(timer);
      resolve(v);
    });
  });

// The IT device console: boards report health, admins see the fleet and send audited remote actions.
describe('device fleet', () => {
  const owner = ownerPool();
  const clock = new FixedClock(new Date());
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let admin: string;
  let teacher: string;
  let device: string;
  let socket: Socket;
  const http = () => request(app.getHttpServer());
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const fleet = async (hours = 4) => (await http().get(`/v1/devices/fleet?hours=${hours}`).set('authorization', `Bearer ${admin}`).expect(200)).body;
  const act = (body: object) => http().post(`/v1/devices/${t.device.id}/actions`).set('authorization', `Bearer ${admin}`).send(body);
  const audits = async (action: string) => (await owner.query(`select actor_id from audit_log where tenant_id = $1 and action = $2`, [t.tenantId, action])).rows;

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(clock);
    admin = await login(t.principal.email!);
    teacher = await login(t.teacher.email!);
    device = (await http().post('/v1/devices/enroll').send({ code: t.enrollmentCode, platform: 'android', appVersion: '1.0.0' }).expect(201)).body.deviceToken;
  });

  afterAll(async () => {
    socket?.disconnect();
    await app.close();
    await owner.end();
  });

  it('is for admins only', async () => {
    await http().get('/v1/devices/fleet').set('authorization', `Bearer ${teacher}`).expect(403);
    await act({ type: 'lock' }).set('authorization', `Bearer ${teacher}`).expect(403);
    await http().post('/v1/devices/me/health').set('authorization', `Bearer ${admin}`).send({ os: 'x', kiosk: 'on' }).expect(403);
  });

  it('stores the health a board reports and shows it in the fleet', async () => {
    await http().post('/v1/devices/me/health').set('authorization', `Bearer ${device}`).send({ os: 'Android', osVersion: '13', appVersion: '1.2.3', kiosk: 'on', storageFreeMb: 4096, storageTotalMb: 32768, battery: { percent: 80, charging: true }, currentClass: 'BCom · Accounting' }).expect(204);
    await http().post('/v1/devices/me/health').set('authorization', `Bearer ${device}`).send({ os: 'Android', kiosk: 'maybe' }).expect(400);
    const b = (await fleet()).boards[0];
    expect(b).toMatchObject({ name: 'Room 1 Board', appVersion: '1.2.3', online: true, locked: false, alert: false, health: { os: 'Android', kiosk: 'on', storageFreeMb: 4096, battery: { percent: 80, charging: true } } });
  });

  it('flags a board offline longer than N hours', async () => {
    clock.at = new Date(clock.at.getTime() + 6 * 3600_000);
    const f = await fleet(4);
    expect(f.alerts).toBe(1);
    expect(f.boards[0]).toMatchObject({ online: false, alert: true });
    expect(f.boards[0].offlineHours).toBeGreaterThanOrEqual(5.9);
    expect((await fleet(12)).alerts).toBe(0);
    clock.at = new Date(clock.at.getTime() - 6 * 3600_000);
  });

  it('queues actions for an offline board, who pulls them when it connects, and acknowledges', async () => {
    const res = await act({ type: 'message', text: 'Assembly at 11', seconds: 20 }).expect(202);
    expect(res.body).toMatchObject({ status: 'queued', online: false });
    await act({ type: 'restart_app' }).expect(202);

    const url = (await app.getUrl()).replace('[::1]', 'localhost');
    socket = io(`${url}/realtime`, { auth: { token: device }, transports: ['websocket'] });
    await next(socket, 'ready');
    const pulled = (await socket.emitWithAck(RealtimeEvents.DeviceActionsPull)) as DeviceActionEvent[];
    expect(pulled.map((a) => a.type)).toEqual(['message', 'restart_app']);
    expect(pulled[0].params).toEqual({ text: 'Assembly at 11', seconds: 20 });
    for (const a of pulled) expect(await socket.emitWithAck(RealtimeEvents.DeviceActionAck, { id: a.id, ok: true })).toEqual({ ok: true });
    expect(await socket.emitWithAck(RealtimeEvents.DeviceActionsPull)).toEqual([]);

    const history = (await http().get(`/v1/devices/${t.device.id}/actions`).set('authorization', `Bearer ${admin}`).expect(200)).body;
    expect(history.map((h: { type: string; status: string }) => [h.type, h.status]).sort()).toEqual([['message', 'done'], ['restart_app', 'done']]);
    expect((await audits('device.action.message')).length).toBe(1);
  });

  it('sends live actions to a connected board, and lock/kiosk state survives in its config', async () => {
    const live = next<DeviceActionEvent>(socket, RealtimeEvents.DeviceAction);
    expect((await act({ type: 'lock' }).expect(202)).body.status).toBe('sent');
    expect(await live).toMatchObject({ type: 'lock' });
    const cfg = async () => (await http().get('/v1/devices/me/config').set('authorization', `Bearer ${device}`).expect(200)).body;
    expect(await cfg()).toMatchObject({ locked: true, kiosk: { enabled: true } });
    await act({ type: 'unlock' }).expect(202);
    await act({ type: 'kiosk_policy', enabled: false }).expect(202);
    expect(await cfg()).toMatchObject({ locked: false, kiosk: { enabled: false } });
    await act({ type: 'kiosk_policy', enabled: null }).expect(202);
    expect((await cfg()).kiosk.enabled).toBe(true);
    expect((await audits('device.action.lock')).length).toBe(1);
  });

  it('renames and moves a board, validating the room', async () => {
    await act({ type: 'rename_move', name: 'Lab Board' }).expect(202);
    await act({ type: 'rename_move', roomId: '00000000-0000-4000-8000-000000000000' }).expect(404);
    await act({ type: 'message', text: '' }).expect(400);
    expect((await fleet()).boards[0].name).toBe('Lab Board');
  });

  it('unpairs: the board is told, then its token stops working', async () => {
    const live = next<DeviceActionEvent>(socket, RealtimeEvents.DeviceAction);
    await act({ type: 'unpair' }).expect(202);
    expect(await live).toMatchObject({ type: 'unpair' });
    await http().get('/v1/devices/me/config').set('authorization', `Bearer ${device}`).expect(401);
    expect((await fleet()).boards[0]).toMatchObject({ enrolled: false });
    await act({ type: 'lock' }).expect(400);
    expect((await audits('device.unpaired')).length).toBe(1);
  });
});
