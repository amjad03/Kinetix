import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DOMAIN, PASSWORD, SLUG, seedSdmcet, type SeedSummary } from '../src/db/seed-sdmcet.js';
import { wipeTenant } from '../src/db/soundarya/kit.js';
import { createApp, FixedClock, ownerPool } from './helpers.js';

// The Zynetix SDMCET demo (docs/zynetix/DEMO.md) loads, can be loaded again, and serves the board edition.
describe('SDMCET demo seed', () => {
  const owner = ownerPool();
  const now = new Date('2026-10-21T08:30:00Z'); // a Wednesday, 2 pm in Dharwad
  let app: INestApplication;
  let first: SeedSummary;
  let second: SeedSummary;
  const http = () => request(app.getHttpServer());
  const count = async (sql: string, params: unknown[] = []) => Number((await owner.query(sql, params)).rows[0].n);

  beforeAll(async () => {
    first = await seedSdmcet(owner, { now });
    second = await seedSdmcet(owner, { now });
    app = await createApp(new FixedClock(now));
  }, 180_000);

  afterAll(async () => {
    await app.close();
    // Leave the shared test database as it was: the tenant and its VTU courses go.
    await wipeTenant(owner, SLUG);
    await owner.query("delete from courses where curriculum_code in ('vtu-be-2022', 'vtu-mba-2022', 'vtu-mtech-2022')");
    await owner.query("delete from curricula where code in ('vtu-be-2022', 'vtu-mba-2022', 'vtu-mtech-2022')");
    await owner.end();
  });

  it('loads programmes, people, boards, timetable, resources, telemetry and AI history, and again without duplicates', async () => {
    const { tenantId: _a, classes: _c, ...a } = first;
    const { tenantId, classes: _d, ...b } = second;
    expect(b).toEqual(a);
    expect(b).toMatchObject({ sections: 15, subjects: 66, teachers: 22, students: 90, guardians: 90, devices: 16 });
    expect(b.topics).toBeGreaterThan(1000);
    expect(b.videos).toBeGreaterThan(20);
    expect(b.animations).toBeGreaterThan(20);
    expect(b.telemetry).toBeGreaterThan(1000);
    expect(b.aiUsage).toBeGreaterThan(500);
    expect(await count('select count(*)::int as n from tenants where slug = $1', [SLUG])).toBe(1);
    expect(await count("select count(*)::int as n from courses where curriculum_code like 'vtu-%-2022'")).toBe(66);
    expect(await count("select count(*)::int as n from chapters c join courses co on co.id = c.course_id where co.curriculum_code like 'vtu-%-2022'")).toBe(330);
    expect(await count('select count(*)::int as n from timetable_slots where tenant_id = $1', [tenantId])).toBe(b.slots);
    expect(await count('select count(distinct section_id)::int as n from timetable_slots where tenant_id = $1', [tenantId])).toBe(15);
    expect(await count('select count(*)::int as n from devices where tenant_id = $1 and enrolled_at is not null', [tenantId])).toBe(16);
    for (const outcome of ['ok', 'throttled', 'blocked', 'unavailable']) expect(await count('select count(*)::int as n from ai_usage where tenant_id = $1 and outcome = $2', [tenantId, outcome])).toBeGreaterThan(0);
    // Throttling happens at the 10-11 peak only.
    expect(await count("select count(*)::int as n from ai_usage where tenant_id = $1 and outcome = 'throttled' and extract(hour from created_at at time zone 'Asia/Kolkata') <> 10", [tenantId])).toBe(0);
  });

  it('signs a teacher in to the board edition with a timetable and topic resources', async () => {
    const token = (await http().post('/v1/auth/login').send({ tenant: SLUG, login: `shweta.ece@${DOMAIN}`, password: PASSWORD }).expect(201)).body.accessToken as string;
    const auth = { authorization: `Bearer ${token}` };
    expect((await http().get('/v1/me').set(auth).expect(200)).body.tenant.edition).toBe('board');
    const day = (await http().get('/v1/teacher/timetable?date=2026-10-22').set(auth).expect(200)).body;
    expect(day.periods.length).toBeGreaterThan(0);
    const topicId = (
      await owner.query("select t.id from topics t join chapters c on c.id = t.chapter_id join courses co on co.id = c.course_id where co.code = 'bec304' and t.title = 'Kirchhoff''s laws'")
    ).rows[0].id as string;
    const res = (await http().get(`/v1/topics/${topicId}/resources`).set(auth).expect(200)).body;
    expect(res.videos.length).toBeGreaterThan(0);
    expect(res.animations.map((x: { id: string }) => x.id)).toContain('electric-circuit');
    expect(res.materials.some((m: { kind: string; pageFrom: number | null }) => m.kind === 'book' && m.pageFrom)).toBe(true);
  });
});
