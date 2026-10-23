import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addPlatformAdmin } from '../src/db/platform-admin.js';
import * as s from '../src/db/schema.js';
import { compareVersions } from '../src/devices/panel.service.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

// Zynetix panel platform (W4): OTA releases rolled out to boards, and the panel home's apps.
describe('panel updates and home', () => {
  const owner = ownerPool();
  const clock = new FixedClock(new Date());
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let admin: string;
  let teacher: string;
  let device: string;
  let second: { id: string; token: string };
  const http = () => request(app.getHttpServer());
  const as = (tok: string) => ({ authorization: `Bearer ${tok}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const health = (tok: string, appVersion: string) => http().post('/v1/devices/me/health').set(as(tok)).send({ os: 'android', appVersion, kiosk: 'on' }).expect(200);
  const apk = Buffer.from('PK fake apk bytes for the test');

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(clock);
    admin = await login(t.slug, t.principal.email!);
    teacher = await login(t.slug, t.teacher.email!);
    device = (await http().post('/v1/devices/enroll').send({ code: t.enrollmentCode, platform: 'android', appVersion: '1.0.0' }).expect(201)).body.deviceToken;
    const made = (await http().post('/v1/devices').set(as(admin)).send({ name: 'Room 2 Board', campusId: t.campus.id }).expect(201)).body;
    const code = made.enrollmentCode ?? made.code;
    second = { id: made.id ?? made.device?.id, token: (await http().post('/v1/devices/enroll').send({ code, platform: 'android', appVersion: '1.0.0' }).expect(201)).body.deviceToken };
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('orders versions with build numbers', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.2.0+5', '1.2.0+12')).toBeLessThan(0);
    expect(compareVersions('v2', '2.0.0')).toBe(0);
  });

  it('is for admins only', async () => {
    await http().get('/v1/panel/releases').set(as(teacher)).expect(403);
    await http().put('/v1/panel/launcher').set(as(teacher)).send({ deviceId: null, apps: [] }).expect(403);
    await http().get('/v1/platform/panel-releases').set(as(admin)).expect(403);
  });

  let releaseId: string;
  it('uploads a release and rolls it out; boards on an older version are offered it in their health answer', async () => {
    await http().post('/v1/panel/releases').set(as(admin)).send({ platform: 'android', version: 'one' }).expect(400);
    const r = (await http().post('/v1/panel/releases').set(as(admin)).send({ platform: 'android', version: '1.1.0+7', channel: 'stable', notes: 'Pen overlay' }).expect(201)).body;
    releaseId = r.id;
    // No file yet: cannot be rolled out.
    await http().post('/v1/panel/rollouts').set(as(admin)).send({ releaseId, target: 'all' }).expect(400);
    await http().put(`/v1/panel/releases/${releaseId}/file`).set(as(admin)).set('content-type', 'text/html').send('x').expect(400);
    const up = (await http().put(`/v1/panel/releases/${releaseId}/file`).set(as(admin)).set('content-type', 'application/vnd.android.package-archive').set('x-file-name', 'zynetix board.apk').send(apk).expect(200)).body;
    expect(up).toMatchObject({ fileName: 'zynetix_board.apk', fileBytes: apk.length, sha256: createHash('sha256').update(apk).digest('hex') });

    expect((await health(device, '1.0.0')).body.update).toBeNull();
    const ro = (await http().post('/v1/panel/rollouts').set(as(admin)).send({ releaseId, target: 'all' }).expect(201)).body;
    expect(ro.boards).toHaveLength(2);
    expect(ro.counts).toEqual({ pending: 2 });

    const offer = (await health(device, '1.0.0')).body.update;
    expect(offer).toMatchObject({ releaseId, version: '1.1.0+7', notes: 'Pen overlay', bytes: apk.length, url: `/v1/devices/me/releases/${releaseId}/file` });
    const file = await http().get(offer.url).set(as(device)).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(Buffer.compare(file.body as Buffer, apk)).toBe(0);
    expect(file.headers['x-sha256']).toBe(offer.sha256);

    await http().post(`/v1/devices/me/releases/${releaseId}/status`).set(as(device)).send({ state: 'installing' }).expect(204);
    await http().post(`/v1/devices/me/releases/${releaseId}/status`).set(as(second.token)).send({ state: 'failed', error: 'Install blocked' }).expect(204);
    let view = (await http().get(`/v1/panel/rollouts/${ro.id}`).set(as(admin)).expect(200)).body;
    expect(view.counts).toEqual({ installing: 1, failed: 1 });
    expect(view.boards.find((b: { state: string }) => b.state === 'failed').error).toBe('Install blocked');

    // The board comes back on the new version: installed, and nothing more is offered.
    expect((await health(device, '1.1.0+7')).body.update).toBeNull();
    view = (await http().get(`/v1/panel/rollouts/${ro.id}`).set(as(admin)).expect(200)).body;
    expect(view.counts).toEqual({ installed: 1, failed: 1 });

    await http().post(`/v1/panel/rollouts/${ro.id}/stop`).set(as(admin)).expect(200);
    expect((await health(second.token, '1.0.0')).body.update).toBeNull();
    await http().get(offer.url).set(as(second.token)).expect(404);
  });

  it('offers beta releases only to beta boards, and selected rollouts only to the chosen boards', async () => {
    const beta = (await http().post('/v1/panel/releases').set(as(admin)).send({ platform: 'android', version: '1.2.0-beta.1', channel: 'beta' }).expect(201)).body;
    await http().put(`/v1/panel/releases/${beta.id}/file`).set(as(admin)).set('content-type', 'application/octet-stream').send(apk).expect(200);
    await http().post('/v1/panel/rollouts').set(as(admin)).send({ releaseId: beta.id, target: 'all' }).expect(201);
    expect((await health(second.token, '1.0.0')).body.update).toBeNull();
    await http().put(`/v1/panel/devices/${second.id}/channel`).set(as(admin)).send({ channel: 'beta' }).expect(200);
    const h = (await health(second.token, '1.0.0')).body;
    expect(h.updateChannel).toBe('beta');
    expect(h.update.releaseId).toBe(beta.id);

    const win = (await http().post('/v1/panel/releases').set(as(admin)).send({ platform: 'windows', version: '9.0.0' }).expect(201)).body;
    await http().put(`/v1/panel/releases/${win.id}/file`).set(as(admin)).set('content-type', 'application/zip').send(apk).expect(200);
    await http().post('/v1/panel/rollouts').set(as(admin)).send({ releaseId: win.id, target: 'selected', deviceIds: [t.device.id] }).expect(400);
    await http().post('/v1/panel/rollouts').set(as(admin)).send({ releaseId, target: 'selected', deviceIds: [] }).expect(400);
    const sel = (await http().post('/v1/panel/rollouts').set(as(admin)).send({ releaseId, target: 'selected', deviceIds: [t.device.id] }).expect(201)).body;
    expect(sel.boards.map((b: { deviceId: string }) => b.deviceId)).toEqual([t.device.id]);
    expect((await health(device, '1.0.5')).body.update.releaseId).toBe(releaseId);
    expect((await http().get('/v1/panel/rollouts').set(as(admin)).expect(200)).body.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps the panel home apps per institution and per board', async () => {
    await http().put('/v1/panel/launcher').set(as(admin)).send({ deviceId: null, apps: [{ package: 'not a package', label: 'X' }] }).expect(400);
    await http()
      .put('/v1/panel/launcher')
      .set(as(admin))
      .send({ deviceId: null, apps: [{ package: 'com.android.chrome', label: 'Chrome' }, { package: 'com.google.android.apps.meetings', label: 'Meet' }, { package: 'com.android.chrome', label: 'Dup' }] })
      .expect(200);
    expect((await health(device, '1.1.0+7')).body.launcher.apps.map((a: { package: string }) => a.package)).toEqual(['com.android.chrome', 'com.google.android.apps.meetings']);
    await http().put('/v1/panel/launcher').set(as(admin)).send({ deviceId: second.id, apps: [{ package: 'cn.wps.moffice_eng', label: 'WPS Office', iconUrl: 'https://example.org/wps.png' }] }).expect(200);
    expect((await health(second.token, '1.0.0')).body.launcher.apps).toEqual([{ package: 'cn.wps.moffice_eng', label: 'WPS Office', iconUrl: 'https://example.org/wps.png' }]);
    expect((await http().get('/v1/devices/me/config').set(as(device)).expect(200)).body.launcher.apps).toHaveLength(2);
    expect((await http().get(`/v1/panel/launcher?deviceId=${second.id}`).set(as(admin)).expect(200)).body.apps).toHaveLength(1);
    expect((await http().get('/v1/devices/me/panel').set(as(second.token)).expect(200)).body.launcher.apps).toHaveLength(1);
  });

  it('lets the platform team publish a release every institution can roll out', async () => {
    const team = await createTenant(owner);
    await addPlatformAdmin(drizzle(owner, { schema: s }), team.slug, team.principal.email!, 'Release team');
    const platform = await login(team.slug, team.principal.email!);
    const r = (await http().post('/v1/platform/panel-releases').set(as(platform)).send({ platform: 'android', version: '2.0.0' }).expect(201)).body;
    await http().put(`/v1/platform/panel-releases/${r.id}/file`).set(as(platform)).set('content-type', 'application/vnd.android.package-archive').send(apk).expect(200);
    const mine = (await http().get('/v1/panel/releases').set(as(admin)).expect(200)).body;
    expect(mine.find((x: { id: string }) => x.id === r.id)).toMatchObject({ scope: 'platform', version: '2.0.0' });
    await http().delete(`/v1/panel/releases/${r.id}`).set(as(admin)).expect(400);
    await http().post('/v1/panel/rollouts').set(as(admin)).send({ releaseId: r.id, target: 'all' }).expect(201);
    expect((await health(device, '1.1.0+7')).body.update).toMatchObject({ releaseId: r.id, version: '2.0.0' });
    await http().get(`/v1/devices/me/releases/${r.id}/file`).set(as(device)).expect(200);
  });
});
