import type { INestApplication } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

// Boards download 3D models from their own API server (/assets/models) before GitHub, or from
// the school server the institution sets (packages/zynetix_3d/lib/src/viewer/remote_models.dart).
describe('3D model downloads', () => {
  const owner = ownerPool();
  const clock = new FixedClock(new Date('2026-10-13T05:00:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let principal: string;
  let device: string;
  const http = () => request(app.getHttpServer());
  const config = async () => (await http().get('/v1/devices/me/config').set('authorization', `Bearer ${device}`).expect(200)).body;

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(clock);
    principal = (await http().post('/v1/auth/login').send({ tenant: t.slug, login: t.principal.email!, password: 'pw' }).expect(201)).body.accessToken;
    device = (await http().post('/v1/devices/enroll').send({ code: t.enrollmentCode, platform: 'android' }).expect(201)).body.deviceToken;
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('serves the model files under the names GitHub has, with no sign-in', async () => {
    const json = await http().get('/assets/models/bacteria.json').expect(200);
    expect(json.headers['content-type']).toMatch(/application\/json/);
    expect(json.body.id).toBe('bacteria');
    const glb = await http().get('/assets/models/bacteria.glb').buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(glb.headers['content-type']).toBe('model/gltf-binary');
    expect(glb.headers['access-control-allow-origin']).toBe('*');
    const body = glb.body as Buffer;
    expect(body.readUInt32LE(0)).toBe(0x46546c67); // "glTF"
    expect(body.equals(readFileSync('../../packages/zynetix_3d/remote_models/bacteria.glb'))).toBe(true);
  });

  it('serves nothing outside the models folder and says when a model is missing', async () => {
    await http().get('/assets/models/no_such_model.glb').expect(404);
    await http().get('/assets/models/..%2F..%2Fpubspec.yaml').expect(404);
    await http().get('/assets/models/').expect(404);
  });

  it("tells boards the institution's model server, which the ERP sets and clears", async () => {
    expect((await config()).modelsBase).toBeNull();
    const put = (body: object) => http().put('/v1/admin/settings').set('authorization', `Bearer ${principal}`).send(body);
    const res = await put({ boardModelsBase: 'http://10.0.0.5:8080/models' }).expect(200);
    expect(res.body.boardModelsBase).toBe('http://10.0.0.5:8080/models');
    expect((await config()).modelsBase).toBe('http://10.0.0.5:8080/models');
    await put({ boardModelsBase: 'ftp://10.0.0.5/models' }).expect(400);
    await put({ boardModelsBase: 'not a url' }).expect(400);
    await put({ boardModelsBase: null }).expect(200);
    expect((await config()).modelsBase).toBeNull();
  });
});
