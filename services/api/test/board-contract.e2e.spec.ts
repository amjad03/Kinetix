import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool, pairBoard } from './helpers.js';

const BOARD_LIB = resolve(__dirname, '../../../apps/board/lib');

function dartFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'gen' || n === 'demo' ? [] : dartFiles(p);
    return p.endsWith('.dart') ? [p] : [];
  });
}

/** Every `METHOD /path` the board app calls, read from its Dart source, with `$var` parts as `:p`. */
export function boardEndpoints(): { method: string; path: string }[] {
  const out = new Map<string, { method: string; path: string }>();
  const norm = (p: string) => p.split('?')[0].replace(/\$\{[^}]+\}|\$[A-Za-z_]+/g, ':p');
  for (const f of dartFiles(BOARD_LIB)) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:_send|_sendRaw|_sendOrDefer)\(\s*'(GET|POST|PUT|PATCH|DELETE)',\s*'(\/[^']*)'/g)) out.set(`${m[1]} ${norm(m[2])}`, { method: m[1], path: norm(m[2]) });
    // AI calls go through `_ai('task', ...)`, which posts to /v1/ai/task.
    for (const m of src.matchAll(/\b_ai(?:<[^>]*>)?\(\s*'([a-z-]+)'/g)) out.set(`POST /v1/ai/${m[1]}`, { method: 'POST', path: `/v1/ai/${m[1]}` });
    for (const m of src.matchAll(/(?:MultipartRequest|http\.Request)\(\s*'(GET|POST|PUT|PATCH|DELETE)',\s*Uri\.parse\('\$baseUrl(\/[^']*)'/g)) out.set(`${m[1]} ${norm(m[2])}`, { method: m[1], path: norm(m[2]) });
  }
  out.delete('POST /v1/ai/:p'); // the generic helper inside `_ai`, expanded per task above
  return [...out.values()].sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
}

describe('board contract: every endpoint the board calls exists on the API; room sync', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let teacherToken: string;
  let boardToken: string;
  let deviceToken: string;
  let socket: Socket;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(new FixedClock(new Date()));
    teacherToken = (await http().post('/v1/auth/login').send({ tenant: t.slug, login: t.teacher.email, password: 'pw' }).expect(201)).body.accessToken;
    const paired = await pairBoard(app, t, teacherToken);
    boardToken = paired.boardToken;
    deviceToken = paired.deviceToken;
    socket = paired.socket;
  });

  afterAll(async () => {
    socket.disconnect();
    await app.close();
    await owner.end();
  });

  it('finds the board endpoints in the Dart source (guards the scan itself)', () => {
    const eps = boardEndpoints();
    expect(eps.length).toBeGreaterThan(50);
    for (const need of ['POST /v1/sync/push', 'POST /v1/homework/from-board', 'GET /v1/classroom/now', 'GET /v1/devices/me/exam-room', 'PUT /v1/polls/:p', 'POST /v1/coverage']) {
      expect(eps.map((e) => `${e.method} ${e.path}`), need).toContain(need);
    }
  });

  it('has a route on the API for every endpoint the board calls', () => {
    const server = app.getHttpAdapter().getInstance() as { router?: { stack: unknown[] }; _router?: { stack: unknown[] } };
    const stack = (server.router ?? server._router)!.stack as { route?: { path: string; methods: Record<string, boolean> } }[];
    const routes = stack.filter((l) => l.route).map((l) => ({ re: new RegExp(`^${l.route!.path.replace(/:[A-Za-z]+/g, '[^/]+')}$`), methods: l.route!.methods }));
    const missing = boardEndpoints().filter((e) => e.path !== '/health' && !routes.some((r) => r.methods[e.method.toLowerCase()] && r.re.test(e.path.replace(/:p/g, 'x'))));
    expect(missing).toEqual([]);
  });

  it('GET /v1/classroom/now: nothing on between periods; the board session stays as it is', async () => {
    const res = await http().get('/v1/classroom/now').set('authorization', `Bearer ${boardToken}`).expect(200);
    expect(res.body).toHaveProperty('slot');
    await http().post('/v1/classroom/now/open').set('authorization', `Bearer ${boardToken}`).expect(res.body.slot ? 200 : 404);
    await http().get('/v1/classroom/now').expect(401);
  });

  it('GET /v1/devices/me/exam-room: inactive when no paper is being sat in the room, and device-only', async () => {
    const res = await http().get('/v1/devices/me/exam-room').set('authorization', `Bearer ${deviceToken}`).expect(200);
    expect(res.body).toEqual({ active: false });
    await http().get('/v1/devices/me/exam-room').expect(401);
  });
});
