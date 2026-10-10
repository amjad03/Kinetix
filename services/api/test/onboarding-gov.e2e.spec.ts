import type { INestApplication } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createInstitution, parseArgs } from '../src/db/create-institution.js';
import * as s from '../src/db/schema.js';
import { IMPORT_KINDS, ONBOARDING_KINDS, TEMPLATES } from '../src/import/templates.js';
import { createApp, FixedClock, ownerPool } from './helpers.js';

interface Totals { rows: number; created: number; updated: number; skipped: number; error: number }

/** The seven onboarding data families import from CSV, and an affiliated college cannot publish exam results. */
describe('onboarding imports and affiliated exam publishing', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let token = '';
  let tenantId = '';
  const http = () => request(app.getHttpServer());
  const auth = () => ({ authorization: `Bearer ${token}` });
  const post = (kind: string, csv: string, query = '') => http().post(`/v1/admin/import/${kind}${query}`).set(auth()).set('content-type', 'text/csv; charset=utf-8').send(csv);
  const q = async <T = Record<string, unknown>>(sql: string) => (await owner.query(sql)).rows as T[];

  beforeAll(async () => {
    app = await createApp(new FixedClock(new Date()));
    const slug = `onb-${Math.random().toString(36).slice(2, 8)}`;
    const args = parseArgs(['--slug', slug, '--name', 'Onboarding College', '--kind', 'college', '--year-label', '2026-27', '--year-start', '2026-06-01', '--year-end', '2027-03-31', '--admin-name', 'Admin', '--admin-email', 'admin@onb.example.in']);
    const inst = await createInstitution(drizzle(owner, { schema: s }), args);
    const login = async (password: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: 'admin@onb.example.in', password }).expect(201)).body.accessToken as string;
    tenantId = inst.tenant.id;
    const temp = await login(inst.password!);
    token = (await http().post('/v1/me/password').set('authorization', `Bearer ${temp}`).send({ currentPassword: inst.password, newPassword: 'Onboard-office-2026' }).expect(200)).body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('serves a template for every family', async () => {
    for (const kind of ONBOARDING_KINDS) expect((await http().get(`/v1/admin/import/templates/${kind}`).set(auth()).expect(200)).text).toBe(TEMPLATES[kind]);
  });

  it('imports all eleven files in order, dry run first, and a second import changes nothing', async () => {
    for (const kind of IMPORT_KINDS) {
      const dry = (await post(kind, TEMPLATES[kind], '?dryRun=true').expect(200)).body as { committed: boolean; totals: Totals; rows: { message: string }[] };
      expect(dry.committed, `${kind} dry run: ${JSON.stringify(dry.rows.filter((r) => 'code' in r))}`).toBe(false);
      expect(dry.totals.error, kind).toBe(0);
      const real = (await post(kind, TEMPLATES[kind]).expect(200)).body as { committed: boolean; totals: Totals };
      expect(real.committed, kind).toBe(true);
      expect(real.totals.created, kind).toBeGreaterThan(0);
    }
    for (const kind of ONBOARDING_KINDS) {
      const again = (await post(kind, TEMPLATES[kind]).expect(200)).body as { totals: Totals };
      expect(again.totals, kind).toMatchObject({ created: 0, updated: 0, error: 0 });
    }
    expect((await q<{ n: number }>(`select count(*)::int n from co_outcome_map where tenant_id = '${tenantId}'`))[0]!.n).toBe(2);
    expect((await q<{ n: number }>(`select count(*)::int n from fee_structures where tenant_id = '${tenantId}' and jsonb_array_length(items) = 3`))[0]!.n).toBe(1);
    expect((await q<{ n: number }>(`select count(*)::int n from exam_sessions where tenant_id = '${tenantId}'`))[0]!.n).toBe(2);
    expect((await q<{ n: number }>(`select count(*)::int n from library_books where tenant_id = '${tenantId}'`))[0]!.n).toBe(2);
    expect((await q<{ n: number }>(`select count(*)::int n from placement_companies where tenant_id = '${tenantId}'`))[0]!.n).toBe(2);
    expect((await q<{ n: number }>(`select count(*)::int n from publications where tenant_id = '${tenantId}'`))[0]!.n).toBe(2);
    expect((await q<{ n: number }>(`select count(*)::int n from accreditation_criteria where tenant_id = '${tenantId}'`))[0]!.n).toBe(2);
  });

  it('names the row and the reason when a family file is wrong', async () => {
    const bad = 'program,term,name,kind,starts_on,ends_on\nNoSuchProgram,1,Mid term,regular,2026-12-01,2026-12-02\nBSc,1,Backwards,regular,2026-12-09,2026-12-02\n';
    const r = (await post('exams', bad, '?dryRun=true').expect(200)).body as { totals: Totals; rows: { row: number; status: string; message: string }[] };
    expect(r.totals.error).toBe(2);
    expect(r.rows.map((x) => x.status)).toEqual(['error', 'error']);
    expect((await post('library', 'title\n').expect(400)).body.message).toMatch(/no rows/i);
  });

  it('refuses to publish exam results in an affiliated college, with a clear message, and allows an autonomous one', async () => {
    const [session] = await q<{ id: string }>(`select id from exam_sessions where tenant_id = '${tenantId}' order by name limit 1`);
    await http().put('/v1/admin/institution/setup').set(auth()).send({ governanceModel: 'affiliated' }).expect(200);
    const refused = await http().post(`/v1/exam-sessions/${session!.id}/publish`).set(auth()).expect(403);
    expect(refused.body.message).toMatch(/affiliating university publishes exam results/);
    await http().put('/v1/admin/institution/setup').set(auth()).send({ governanceModel: 'autonomous' }).expect(200);
    const next = await http().post(`/v1/exam-sessions/${session!.id}/publish`).set(auth()).expect(409);
    expect(next.body.message).toMatch(/Process the results first/);
  });
});
