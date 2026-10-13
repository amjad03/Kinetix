import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { stepStates } from '../src/quality-hub/records.catalogue.js';
import { effectiveSettings, inQuietHours, settingsProblems } from '../src/quality-hub/settings.catalogue.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('quality hub: module settings, record pages and reports', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tok: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set({ authorization: `Bearer ${tok[who]}` });
  const put = (who: string, url: string, body: object) => http().put(url).set({ authorization: `Bearer ${tok[who]}` }).send(body);
  const post = (who: string, url: string, body: object = {}) => http().post(url).set({ authorization: `Bearer ${tok[who]}` }).send(body);

  async function addUser(tenantId: string, name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@qh.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId, userId: u.id, role });
    return u;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const gro = await addUser(t.tenantId, 'Gopal Grievance', 'grievance_officer');
    const po = await addUser(t.tenantId, 'Pooja Placement', 'placement_officer');
    app = await createApp(new FixedClock(new Date('2026-10-20T04:30:00Z')));
    tok.principal = await login(t.slug, t.principal.email!);
    tok.teacher = await login(t.slug, t.teacher.email!);
    tok.gro = await login(t.slug, gro.email!);
    tok.po = await login(t.slug, po.email!);
    tok.other = await login(other.slug, other.principal.email!);
    ids.po = po.id;
  }, 180_000);
  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  it('serves defaults, saves overrides with an audit row, rejects bad values, and the grievance desk applies them', async () => {
    const d = (await get('principal', '/v1/quality-hub/settings/grievances').expect(200)).body;
    expect(d.settings.rules.slaHighHours).toBe(48);
    expect(d.settings.numbering.GRV).toMatchObject({ prefix: 'GRV-', pad: 4, next: 1 });
    expect(d.canEdit).toBe(true);
    const body = { ...d.settings, rules: { ...d.settings.rules, slaHighHours: 10, allowAnonymous: false }, templates: { resolved: 'Done: {ticketNo}' }, numbering: { GRV: { prefix: 'GR/', next: 41, pad: 5 } } };
    await put('principal', '/v1/quality-hub/settings/grievances', body).expect(200);
    const again = (await get('gro', '/v1/quality-hub/settings/grievances').expect(200)).body;
    expect(again.settings.rules.slaHighHours).toBe(10);
    expect(again.settings.numbering.GRV.next).toBe(41);
    expect(again.updatedBy).toBeTruthy();
    expect(again.canEdit).toBe(false);
    const n = (await owner.query("select count(*)::int as n from audit_log where tenant_id = $1 and action = 'module_settings.updated'", [t.tenantId])).rows[0].n;
    expect(n).toBe(1);
    // Enforced: the ticket number, the deadline for its severity and the anonymity rule.
    const raised = (await post('teacher', '/v1/grievances', { category: 'academic', severity: 'high', subject: 'Projector broken', description: 'The projector in room 1 has not worked for a week' }).expect(201)).body;
    expect(raised.ticketNo).toBe('GR/00041');
    expect(raised.slaDueAt).toBe('2026-10-20T14:30:00.000Z');
    await post('teacher', '/v1/grievances', { category: 'academic', subject: 'Anonymous', description: 'Something I would rather not sign', anonymous: true }).expect(400);
    // Numbers already used cannot be reissued; unknown keys and out-of-range values are refused.
    await put('principal', '/v1/quality-hub/settings/grievances', { ...body, numbering: { GRV: { prefix: 'GR/', next: 5, pad: 5 } } }).expect(409);
    await put('principal', '/v1/quality-hub/settings/grievances', { ...body, rules: { slaHighHours: 0 } }).expect(400);
    await put('principal', '/v1/quality-hub/settings/grievances', { ...body, rules: { colour: 3 } }).expect(400);
    await put('gro', '/v1/quality-hub/settings/grievances', body).expect(403);
    await get('teacher', '/v1/quality-hub/settings/grievances').expect(403);
    await get('principal', '/v1/quality-hub/settings/accreditation').expect(404);
    // Another institution still has the defaults.
    expect((await get('other', '/v1/quality-hub/settings/grievances').expect(200)).body.settings.rules.slaHighHours).toBe(48);
  });

  it('applies event, skills and placement settings in those modules', async () => {
    const s = (await get('principal', '/v1/quality-hub/settings/events').expect(200)).body.settings;
    await put('principal', '/v1/quality-hub/settings/events', { ...s, defaults: { defaultCapacity: 42 } }).expect(200);
    const ev = (await post('principal', '/v1/campus-life/events', { title: 'Science fair', startsAt: '2026-11-10T04:30:00Z', endsAt: '2026-11-10T08:30:00Z' }).expect(201)).body;
    expect(ev.capacity).toBe(42);
    const k = (await get('principal', '/v1/quality-hub/settings/skills').expect(200)).body.settings;
    await put('principal', '/v1/quality-hub/settings/skills', { ...k, rules: { maxLevel: 11 } }).expect(400);
    const pl = (await get('principal', '/v1/quality-hub/settings/placements').expect(200)).body.settings;
    await put('principal', '/v1/quality-hub/settings/placements', { ...pl, defaults: { minCgpa: 6.5, maxBacklogs: 2 } }).expect(200);
  });

  it('builds a drive record page with facts, related lists, workflow position and its audit history', async () => {
    const company = (await post('principal', '/v1/placements/companies', { name: 'Infosys', sector: 'IT' }).expect(201)).body;
    const drive = (await post('principal', '/v1/placements/drives', { companyId: company.id, title: 'Campus hiring 2026', roleTitle: 'Systems engineer', ctcLpa: 4.5, driveDate: '2026-11-02' }).expect(201)).body;
    // The placement settings' defaults filled the eligibility the form left out.
    expect(drive).toMatchObject({ minCgpa: 6.5, maxBacklogs: 2 });
    await post('principal', `/v1/placements/drives/${drive.id}/status`, { status: 'open' }).expect(200);
    const r = (await get('po', `/v1/quality-hub/records/drive/${drive.id}`).expect(200)).body;
    expect(r.title).toBe('Infosys · Campus hiring 2026');
    expect(r.status).toBe('open');
    expect(r.facts.find((f: { key: string }) => f.key === 'ctc').value).toBe(4.5);
    expect(r.facts.find((f: { key: string }) => f.key === 'driveDate').value).toBe('2026-11-02');
    expect(r.steps.map((x: { state: string }) => x.state)).toEqual(['done', 'current', 'upcoming', 'upcoming']);
    expect(r.related.map((x: { key: string }) => x.key)).toEqual(['registrations', 'offers']);
    expect(r.activity.length).toBeGreaterThan(0);
    // Roles outside placements, other tenants and unknown types get nothing.
    await get('gro', `/v1/quality-hub/records/drive/${drive.id}`).expect(404);
    await get('teacher', `/v1/quality-hub/records/drive/${drive.id}`).expect(403);
    await get('other', `/v1/quality-hub/records/drive/${drive.id}`).expect(404);
    await get('po', `/v1/quality-hub/records/nope/${drive.id}`).expect(404);
    ids.drive = drive.id;
  });

  it('hides committee grievances from the grievance officer but shows ordinary ones', async () => {
    const [plain] = await db.insert(s.grievanceTickets).values({ tenantId: t.tenantId, ticketNo: 'GRV-1', category: 'academic', subject: 'Marks not updated', description: 'My internal marks are missing', raisedBy: t.studentUser.id, slaDueAt: new Date('2026-10-23T00:00:00Z') }).returning();
    const [icc] = await db.insert(s.grievanceTickets).values({ tenantId: t.tenantId, ticketNo: 'GRV-2', category: 'harassment', subject: 'Private', description: 'Committee only', committee: 'icc', raisedBy: t.studentUser.id, slaDueAt: new Date('2026-10-23T00:00:00Z') }).returning();
    const r = (await get('gro', `/v1/quality-hub/records/grievance/${plain.id}`).expect(200)).body;
    expect(r.title).toBe('GRV-1 · Marks not updated');
    expect(r.body[0]).toEqual({ key: 'description', value: 'My internal marks are missing' });
    await get('gro', `/v1/quality-hub/records/grievance/${icc.id}`).expect(404);
    await get('principal', `/v1/quality-hub/records/grievance/${icc.id}`).expect(200);
  });

  it('lists reports by role and serves them as filtered JSON, XLSX and PDF', async () => {
    const list = (await get('po', '/v1/quality-hub/reports').expect(200)).body.map((r: { id: string }) => r.id);
    expect(list).toContain('placements.drives');
    expect(list).not.toContain('grievances.register');
    const j = (await get('po', '/v1/quality-hub/reports/placements.drives?status=open').expect(200)).body;
    expect(j.rows).toHaveLength(1);
    expect(j.rows[0]).toMatchObject({ id: ids.drive, company: 'Infosys', status: 'open', registered: 0 });
    expect((await get('po', '/v1/quality-hub/reports/placements.drives?status=closed').expect(200)).body.rows).toHaveLength(0);
    expect((await get('po', '/v1/quality-hub/reports/placements.drives?from=2026-12-01').expect(200)).body.rows).toHaveLength(0);
    const x = await get('po', '/v1/quality-hub/reports/placements.drives?format=xlsx').expect(200);
    expect(x.headers['content-type']).toContain('spreadsheetml');
    const pdf = await get('principal', '/v1/quality-hub/reports/grievances.register?format=pdf').buffer(true).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    const sum = (await get('principal', '/v1/quality-hub/reports/accreditation.summary?from=2026-04-01&to=2027-03-31').expect(200)).body;
    expect(sum.rows.find((r: { metric: string }) => r.metric === 'grievances_received').value).toBe(3);
    await get('po', '/v1/quality-hub/reports/grievances.register').expect(404);
    await get('po', '/v1/quality-hub/reports/placements.drives?from=2026-13-40').expect(400);
    await get('po', '/v1/quality-hub/reports/placements.drives?format=doc').expect(400);
    // Another tenant's report does not see this tenant's drive.
    expect((await get('other', '/v1/quality-hub/reports/placements.drives').expect(200)).body.rows).toHaveLength(0);
  });

  it('places statuses on the workflow and validates settings offline', () => {
    expect(stepStates({ steps: ['a', 'b', 'c'], off: ['x'] }, 'c').map((s) => s.state)).toEqual(['done', 'done', 'done']);
    expect(stepStates({ steps: ['a', 'b', 'c'], off: ['x'] }, 'x').map((s) => s.state)).toEqual(['done', 'rejected']);
    expect(stepStates({ steps: ['a', 'b', 'c'], off: [], aliases: { e: 'b' } }, 'e').map((s) => s.state)).toEqual(['done', 'current', 'upcoming']);
    const obe = effectiveSettings('obe', null);
    expect(settingsProblems('obe', { ...obe, numbering: {} })).toEqual([]);
    expect(settingsProblems('obe', { ...obe, numbering: {}, templates: { other: 'x' } })).toEqual(['Unknown template other']);
    expect(effectiveSettings('grievances', { rules: { slaLowHours: -4 } }).rules.slaLowHours).toBe(240);
    expect([inQuietHours(22, 21, 7), inQuietHours(6, 21, 7), inQuietHours(12, 21, 7), inQuietHours(13, 12, 14), inQuietHours(9, 9, 9)]).toEqual([true, true, false, true, false]);
  });
});
