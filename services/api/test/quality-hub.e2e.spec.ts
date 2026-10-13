import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { stepStates } from '../src/quality-hub/records.catalogue.js';
import { settingsProblems, effectiveSettings } from '../src/quality-hub/settings.catalogue.js';
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

  it('serves defaults, saves overrides with an audit row, and rejects unknown keys and out-of-range values', async () => {
    const d = (await get('principal', '/v1/quality-hub/settings/grievances').expect(200)).body;
    expect(d.settings.rules.slaHours).toBe(72);
    expect(d.settings.numbering.ticket.prefix).toBe('GRV/{FY}/');
    expect(d.canEdit).toBe(true);
    const body = { ...d.settings, rules: { ...d.settings.rules, slaHours: 48 }, numbering: { ticket: { prefix: 'GR/{FY}/', next: 41, pad: 5 } } };
    await put('principal', '/v1/quality-hub/settings/grievances', body).expect(200);
    const again = (await get('gro', '/v1/quality-hub/settings/grievances').expect(200)).body;
    expect(again.settings.rules.slaHours).toBe(48);
    expect(again.settings.numbering.ticket.next).toBe(41);
    expect(again.updatedBy).toBeTruthy();
    expect(again.canEdit).toBe(false);
    const n = (await owner.query("select count(*)::int as n from audit_log where tenant_id = $1 and action = 'module_settings.updated'", [t.tenantId])).rows[0].n;
    expect(n).toBe(1);
    await put('principal', '/v1/quality-hub/settings/grievances', { ...body, rules: { slaHours: 1 } }).expect(400);
    await put('principal', '/v1/quality-hub/settings/grievances', { ...body, rules: { colour: 3 } }).expect(400);
    await put('gro', '/v1/quality-hub/settings/grievances', body).expect(403);
    await get('teacher', '/v1/quality-hub/settings/grievances').expect(403);
    await get('principal', '/v1/quality-hub/settings/nope').expect(404);
    // Another institution still sees the defaults.
    expect((await get('other', '/v1/quality-hub/settings/grievances').expect(200)).body.settings.rules.slaHours).toBe(72);
  });

  it('builds a drive record page with facts, related lists, workflow position and its audit history', async () => {
    const company = (await post('principal', '/v1/placements/companies', { name: 'Infosys', sector: 'IT' }).expect(201)).body;
    const drive = (await post('principal', '/v1/placements/drives', { companyId: company.id, title: 'Campus hiring 2026', roleTitle: 'Systems engineer', ctcLpa: 4.5, driveDate: '2026-11-02' }).expect(201)).body;
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
    expect(sum.rows.find((r: { metric: string }) => r.metric === 'grievances_received').value).toBe(2);
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
    expect(settingsProblems('obe', effectiveSettings('obe', null))).toEqual([]);
    expect(settingsProblems('obe', { ...effectiveSettings('obe', null), templates: { other: 'x' } })).toEqual(['Unknown template other']);
  });
});
