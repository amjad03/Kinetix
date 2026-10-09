import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { p95, PERF_BUDGETS } from '../src/observability/perf-budgets.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('performance budgets', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let token = '';

  beforeAll(async () => {
    const t = await createTenant(owner);
    app = await createApp(new FixedClock(new Date('2026-10-20T04:30:00Z')));
    token = (await request(app.getHttpServer()).post('/v1/auth/login').send({ tenant: t.slug, login: t.principal.email, password: 'pw' }).expect(201)).body.accessToken;
  });
  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  it('computes the 95th percentile by nearest rank', () => {
    expect(p95([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])).toBe(100);
    expect(p95([5])).toBe(5);
    expect(p95([])).toBe(0);
  });

  it('lists the boards that can be cast to', async () => {
    const res = await request(app.getHttpServer()).get('/v1/cast/boards').set('authorization', `Bearer ${token}`).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('every module answers its sample read within its budget', async () => {
    const slow: string[] = [];
    for (const b of PERF_BUDGETS) {
      const samples: number[] = [];
      for (let i = 0; i < 6; i++) {
        const t0 = performance.now();
        const res = await request(app.getHttpServer()).get(b.path).set('authorization', `Bearer ${token}`);
        samples.push(performance.now() - t0);
        expect(res.status, `${b.path} answered ${res.status}`).toBe(200);
      }
      // The first call warms the connection and the query plan; the budget is for the calls after it.
      const warm = p95(samples.slice(1));
      if (warm > b.p95Ms) slow.push(`${b.module} ${b.path}: ${Math.round(warm)} ms against ${b.p95Ms} ms`);
    }
    expect(slow).toEqual([]);
  });
});
