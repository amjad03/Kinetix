import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('institution capability engine: setup, presets, boards, module gate, programme attendance, campus fees, trusted devices', () => {
  const owner = ownerPool();
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string, headers: Record<string, string> = {}) => (await http().post('/v1/auth/login').set(headers).send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(auth(who)).send(body);
  const q = async (sql: string, args: unknown[] = []) => (await owner.query(sql, args)).rows;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    tokens = { principal: await login(t.slug, t.principal.email!), teacher: await login(t.slug, t.teacher.email!), outsider: await login(other.slug, other.principal.email!) };
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('saves the institution type, structure model, languages, AI policy and terminology, and shows them in the capabilities', async () => {
    await put('principal', '/v1/admin/institution/setup', {
      institutionType: 'autonomous_college',
      structureModel: 'PROGRAM_SEMESTER_COURSE',
      governanceModel: 'autonomous',
      feeModel: 'semester_fees',
      qualityFramework: 'NAAC',
      languages: ['en', 'kn'],
      aiPolicy: { enabled: true, allowStudentFacing: false, requireTeacherReview: true },
      privacySettings: { parentSeesMarks: true },
      commsChannels: { sms: true, email: true, push: true },
      terminology: { 'nav.classes': 'Sections' },
    }).expect(200);
    const caps = (await get('teacher', '/v1/institution/capabilities').expect(200)).body;
    expect(caps).toMatchObject({ institutionType: 'autonomous_college', structureModel: 'PROGRAM_SEMESTER_COURSE', languages: ['en', 'kn'], terminology: { 'nav.classes': 'Sections' }, aiPolicy: { enabled: true } });
    const setup = (await get('principal', '/v1/admin/institution/setup').expect(200)).body;
    expect(setup.governanceRules).toMatchObject({ ownExams: true, ownDegree: false });
    await put('principal', '/v1/admin/institution/setup', { structureModel: 'NOT_A_MODEL' }).expect(400);
    await put('teacher', '/v1/admin/institution/setup', { feeModel: 'x' }).expect(403);
  });

  it('lists the five sample configurations and loads one, which switches modules off in the API too', async () => {
    const presets = (await get('principal', '/v1/admin/institution/presets').expect(200)).body as { key: string }[];
    expect(presets.map((p) => p.key)).toEqual(['nursery', 'cbse_1_10', 'karnataka_puc', 'soundarya', 'university']);
    const before = await get('principal', '/v1/research/proposals');
    expect(before.status).toBe(200);
    const applied = (await post('principal', '/v1/admin/institution/presets/karnataka_puc/apply').expect(200)).body;
    expect(applied.disabledModules).toContain('research');
    const caps = (await get('principal', '/v1/institution/capabilities').expect(200)).body;
    expect(caps).toMatchObject({ structureModel: 'STREAM_COMBINATION', institutionType: 'puc_college', academicModel: 'puc' });
    const blocked = await get('principal', '/v1/research/proposals');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('MODULE_DISABLED');
    // Another institution is not affected.
    expect((await get('outsider', '/v1/research/proposals')).status).toBe(200);
    // The preset made the state board the primary board.
    const boards = (await get('principal', '/v1/admin/institution/boards').expect(200)).body as { code: string; isPrimary: boolean }[];
    expect(boards.find((b) => b.code === 'KSEAB-PUC')?.isPrimary).toBe(true);
    await post('principal', '/v1/admin/institution/presets/nope/apply').expect(404);
    // Switching the module back on through the profile reopens the endpoint.
    await put('principal', '/v1/admin/institution/profile', { disabledModules: [] }).expect(200);
    expect((await get('principal', '/v1/research/proposals')).status).toBe(200);
  });

  it('keeps school boards with pass rules and one primary', async () => {
    const b = (await post('principal', '/v1/admin/institution/boards', { code: 'ICSE', name: 'Council for the Indian School Certificate Examinations', kind: 'central', passRules: { subjectPassPct: 33, graceMarks: 3, maxCompartmentSubjects: 1 } }).expect(201)).body;
    await post('principal', '/v1/admin/institution/boards', { code: 'ICSE', name: 'Duplicate' }).expect(409);
    await post('principal', `/v1/admin/institution/boards/${b.id}/primary`).expect(200);
    const boards = (await get('principal', '/v1/admin/institution/boards').expect(200)).body as { code: string; isPrimary: boolean }[];
    expect(boards.filter((x) => x.isPrimary).map((x) => x.code)).toEqual(['ICSE']);
    await put('principal', `/v1/admin/institution/boards/${b.id}`, { medium: 'Kannada' }).expect(200);
  });

  it('applies a programme attendance override to the eligibility view', async () => {
    await owner.query("update tenants set settings = settings || '{\"attendanceThresholdPct\": 75}'::jsonb where id = $1", [t.tenantId]);
    const eligibility = async () => (await get('principal', `/v1/attendance/eligibility?sectionId=${t.section.id}`).expect(200)).body as { thresholdPct: number };
    expect((await eligibility()).thresholdPct).toBe(75);
    await put('principal', `/v1/admin/institution/attendance-overrides/${t.program.id}`, { thresholdPct: 85, note: 'Professional programme' }).expect(200);
    expect((await eligibility()).thresholdPct).toBe(85);
    const list = (await get('principal', '/v1/admin/institution/attendance-overrides').expect(200)).body as { programId: string; thresholdPct: number | null }[];
    expect(list.find((x) => x.programId === t.program.id)?.thresholdPct).toBe(85);
    await put('principal', `/v1/admin/institution/attendance-overrides/${t.program.id}`, { thresholdPct: 0 }).expect(400);
    await http().delete(`/v1/admin/institution/attendance-overrides/${t.program.id}`).set(auth('principal')).expect(200);
    expect((await eligibility()).thresholdPct).toBe(75);
  });

  it('keeps campus settings and campus fee plans, and issues a plan once per student', async () => {
    await put('principal', `/v1/admin/institution/campus-settings/${t.campus.id}`, { feeModel: 'semester_fees', gradingPolicy: 'cgpa', settings: { lateFeePct: 2 } }).expect(200);
    const rows = (await get('principal', '/v1/admin/institution/campus-settings').expect(200)).body as { campusId: string; feeModel: string }[];
    expect(rows.find((r) => r.campusId === t.campus.id)?.feeModel).toBe('semester_fees');
    const fs = (await post('principal', '/v1/admin/institution/fee-structures', { name: 'BCom main campus 2026', campusId: t.campus.id, programId: t.program.id, items: [{ head: 'Tuition', amountPaise: 4_000_000 }, { head: 'Lab', amountPaise: 500_000 }] }).expect(201)).body;
    const first = (await post('principal', `/v1/admin/institution/fee-structures/${fs.id}/issue`).expect(200)).body;
    expect(first.amountPaise).toBe(4_500_000);
    expect(first.issued).toBe(3);
    const again = (await post('principal', `/v1/admin/institution/fee-structures/${fs.id}/issue`).expect(200)).body;
    expect(again.issued).toBe(0);
    expect(await q("select count(*)::int as n from fee_invoices where tenant_id = $1 and title = 'BCom main campus 2026'", [t.tenantId])).toEqual([{ n: 3 }]);
    const list = (await get('principal', '/v1/admin/institution/fee-structures').expect(200)).body as { totalPaise: number; campusName: string }[];
    expect(list[0]).toMatchObject({ totalPaise: 4_500_000, campusName: 'Main' });
    await post('principal', '/v1/admin/institution/fee-structures', { name: 'Empty', items: [] }).expect(400);
  });

  it('trusts, lists and revokes devices, and notes a sign-in from an unknown device', async () => {
    const trust = (await post('teacher', '/v1/me/devices/trust', { deviceId: 'install-abc-12345', label: 'Staff room tablet', platform: 'android' }).expect(200)).body;
    expect(trust.state).toBe('trusted');
    expect((await get('teacher', '/v1/me/devices/status?deviceId=install-abc-12345').expect(200)).body.state).toBe('trusted');
    expect((await get('teacher', '/v1/me/devices/status?deviceId=someone-elses-device').expect(200)).body.state).toBe('new');
    await login(t.slug, t.teacher.email!, { 'x-device-id': 'brand-new-device-1' });
    expect(await q("select count(*)::int as n from audit_log where tenant_id = $1 and action = 'auth.new_device'", [t.tenantId])).toEqual([{ n: 1 }]);
    await login(t.slug, t.teacher.email!, { 'x-device-id': 'install-abc-12345' });
    expect(await q("select count(*)::int as n from audit_log where tenant_id = $1 and action = 'auth.new_device'", [t.tenantId])).toEqual([{ n: 1 }]);
    const mine = (await get('teacher', '/v1/me/devices').expect(200)).body as { id: string }[];
    expect(mine).toHaveLength(1);
    const admin = (await get('principal', `/v1/admin/trusted-devices?userId=${t.teacher.id}`).expect(200)).body as { id: string; userName: string }[];
    expect(admin).toHaveLength(1);
    await post('principal', `/v1/admin/trusted-devices/${admin[0].id}/revoke`).expect(200);
    expect((await get('teacher', '/v1/me/devices/status?deviceId=install-abc-12345').expect(200)).body.state).toBe('new');
    await get('teacher', '/v1/admin/trusted-devices').expect(403);
  });

  it('accepts the four new identity roles', async () => {
    const hash = await argon2.hash('pw');
    for (const role of ['external_examiner', 'mentor', 'accreditation_reviewer', 'university_admin']) {
      const email = `${role}@x.in`;
      const [u] = await q('insert into users (tenant_id, full_name, email, password_hash) values ($1,$2,$3,$4) returning id', [t.tenantId, role, email, hash]);
      await owner.query(`insert into user_roles (tenant_id, user_id, role) values ($1,$2,'${role}')`, [t.tenantId, u.id]);
      const token = await login(t.slug, email);
      const me = (await http().get('/v1/me').set({ authorization: `Bearer ${token}` }).expect(200)).body;
      expect(me.roles).toContain(role);
    }
  });
});
