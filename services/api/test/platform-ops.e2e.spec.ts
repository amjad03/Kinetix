import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { amountInWords, financialYear } from '../src/placements/alumni-giving.logic.js';
import { ReportsService } from '../src/analytics/reports.service.js';
import { ConnectorsService, assertSafeUrl, signWebhook, verifyWebhook } from '../src/connectors/connectors.service.js';
import { EventBus } from '../src/events/events.js';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

interface Hit {
  headers: IncomingMessage['headers'];
  body: string;
}

describe('audit viewer, custom reports, connectors and alumni giving', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(auth(who)).send(body);
  const patch = (who: string, url: string, body: object = {}) => http().patch(url).set(auth(who)).send(body);

  // A local receiver for the webhook tests.
  let server: Server;
  let hits: Hit[] = [];
  let answer = 200;
  let hookUrl = '';

  async function addUser(tenantId: string, name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@ops.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId, userId: u.id, role });
    return u;
  }

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        hits.push({ headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
        res.statusCode = answer;
        res.end('ok');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    hookUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;

    t = await createTenant(owner);
    other = await createTenant(owner);
    const admin = await addUser(t.tenantId, 'Ada Admin', 'tenant_admin');
    const accountant = await addUser(t.tenantId, 'Asha Accounts', 'accountant');
    const hr = await addUser(t.tenantId, 'Hema HR', 'hr_manager');
    const placement = await addUser(t.tenantId, 'Pia Placement', 'placement_officer');
    await addUser(other.tenantId, 'Otto Admin', 'tenant_admin');
    app = await createApp(clock);
    tokens = {
      admin: await login(t.slug, admin.email!),
      accountant: await login(t.slug, accountant.email!),
      hr: await login(t.slug, hr.email!),
      placement: await login(t.slug, placement.email!),
      principal: await login(t.slug, t.principal.email!),
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      student: await login(t.slug, t.studentUser.email!),
      outsider: await login(other.slug, other.principal.email!),
      outsiderAdmin: await login(other.slug, 'ottoadmin@ops.in'),
    };
  });
  afterAll(async () => {
    await app.close();
    await new Promise((r) => server.close(r));
    await owner.end();
  });

  // ---------------------------------------------------------------------------------------------
  describe('audit-log viewer', () => {
    it('is for the administrator and the principal only', async () => {
      await get('teacher', '/v1/audit').expect(403);
      await get('student', '/v1/audit').expect(403);
      await get('accountant', '/v1/audit/export').expect(403);
      await get('principal', '/v1/audit').expect(200);
      await get('admin', '/v1/audit').expect(200);
    });

    it('filters by actor, action, subject and dates, and pages', async () => {
      await post('placement', '/v1/alumni/campaigns', { name: 'Audit seed' }).expect(201);
      const all = (await get('admin', '/v1/audit?limit=200').expect(200)).body;
      expect(all.total).toBeGreaterThan(0);
      const seed = all.items.find((r: { action: string }) => r.action === 'alumni.campaign_created');
      expect(seed.actorName).toBe('Pia Placement');

      const byAction = (await get('admin', '/v1/audit?action=alumni.campaign_created').expect(200)).body;
      expect(byAction.items.every((r: { action: string }) => r.action === 'alumni.campaign_created')).toBe(true);
      const prefix = (await get('admin', '/v1/audit?action=alumni.*').expect(200)).body;
      expect(prefix.items.length).toBeGreaterThan(0);
      expect(prefix.items.every((r: { action: string }) => r.action.startsWith('alumni.'))).toBe(true);

      const bySubject = (await get('admin', `/v1/audit?subjectType=alumni_campaign&subjectId=${seed.subjectId}`).expect(200)).body;
      expect(bySubject.total).toBe(1);
      const byActor = (await get('admin', `/v1/audit?actorId=${seed.actorId}`).expect(200)).body;
      expect(byActor.items.every((r: { actorId: string }) => r.actorId === seed.actorId)).toBe(true);

      const today = new Date().toISOString().slice(0, 10);
      expect((await get('admin', `/v1/audit?from=${today}&to=${today}&action=alumni.campaign_created`).expect(200)).body.total).toBe(1);
      expect((await get('admin', '/v1/audit?from=2001-01-01&to=2001-01-31').expect(200)).body.total).toBe(0);
      await get('admin', '/v1/audit?from=2026-12-01&to=2026-01-01').expect(400);
      await get('admin', '/v1/audit?actorId=not-a-uuid').expect(400);

      await post('placement', '/v1/alumni/campaigns', { name: 'Audit seed 2' }).expect(201);
      await post('placement', '/v1/alumni/campaigns', { name: 'Audit seed 3' }).expect(201);
      const page1 = (await get('admin', '/v1/audit?limit=1&offset=0&action=alumni.campaign_created').expect(200)).body;
      const page2 = (await get('admin', '/v1/audit?limit=1&offset=1&action=alumni.campaign_created').expect(200)).body;
      expect(page1.items).toHaveLength(1);
      expect(page2.items[0].id).not.toBe(page1.items[0].id);
      expect(page1.total).toBeGreaterThan(2);
    });

    it('audits being viewed and exported', async () => {
      await get('principal', '/v1/audit?action=alumni.*').expect(200);
      const seen = (await get('admin', `/v1/audit?action=audit.viewed&actorId=${t.principal.id}`).expect(200)).body;
      expect(seen.total).toBeGreaterThan(0);
      expect(seen.items[0].data.filters.action).toBe('alumni.*');
      const csv = await get('admin', '/v1/audit/export?action=alumni.*').expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text).toContain('Time,Actor type');
      expect(csv.text).toContain('alumni.campaign_created');
      const exported = (await get('admin', '/v1/audit?action=audit.exported').expect(200)).body;
      expect(exported.total).toBe(1);
    });

    it("never shows another institution's rows", async () => {
      const mine = (await get('admin', '/v1/audit?action=alumni.*').expect(200)).body;
      const theirs = (await get('outsider', '/v1/audit?action=alumni.*').expect(200)).body;
      expect(mine.total).toBeGreaterThan(0);
      expect(theirs.total).toBe(0);
      const rows = (await owner.query("select count(*)::int as n from audit_log where tenant_id = $1 and action = 'alumni.campaign_created'", [other.tenantId])).rows[0].n;
      expect(rows).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('custom report builder', () => {
    let reportId: string;

    beforeAll(async () => {
      const [stu] = t.students;
      await db.insert(s.attendanceRecords).values([
        { tenantId: t.tenantId, studentId: stu.id, sectionId: t.section.id, date: '2026-10-19', status: 'present', markedBy: t.teacher.id, occurredAt: new Date() },
        { tenantId: t.tenantId, studentId: t.students[1].id, sectionId: t.section.id, date: '2026-10-19', status: 'absent', markedBy: t.teacher.id, occurredAt: new Date() },
        { tenantId: t.tenantId, studentId: t.students[2].id, sectionId: t.section.id, date: '2026-10-19', status: 'present', markedBy: t.teacher.id, occurredAt: new Date() },
      ]);
      const batchId = crypto.randomUUID();
      await db.insert(s.feeInvoices).values([
        { tenantId: t.tenantId, studentId: stu.id, sectionId: t.section.id, batchId, title: 'Tuition', amountPaise: 1_000_000, paidPaise: 400_000, dueOn: '2026-11-01', status: 'due', createdBy: t.principal.id },
        { tenantId: t.tenantId, studentId: t.students[1].id, sectionId: t.section.id, batchId, title: 'Tuition', amountPaise: 1_000_000, paidPaise: 1_000_000, dueOn: '2026-11-01', status: 'paid', createdBy: t.principal.id },
        { tenantId: t.tenantId, studentId: t.students[2].id, sectionId: t.section.id, batchId, title: 'Lab', amountPaise: 200_000, paidPaise: 0, dueOn: '2026-12-01', status: 'due', createdBy: t.principal.id },
      ]);
      await db.insert(s.staffProfiles).values({ tenantId: t.tenantId, userId: t.teacher.id, employeeCode: 'OPS1', employmentType: 'permanent' });
      // The other institution has its own invoice that must never show up.
      await db.insert(s.feeInvoices).values({ tenantId: other.tenantId, studentId: other.students[0].id, sectionId: other.section.id, batchId, title: 'Tuition', amountPaise: 9_999_900, paidPaise: 0, dueOn: '2026-11-01', status: 'due', createdBy: other.principal.id });
    });

    it('offers each role only its datasets', async () => {
      const keys = async (who: string) => ((await get(who, '/v1/analytics/custom-reports/datasets').expect(200)).body.datasets as { key: string }[]).map((d) => d.key);
      expect(await keys('principal')).toEqual(['students', 'attendance', 'marks', 'fees', 'staff']);
      expect(await keys('teacher')).toEqual(['students', 'attendance', 'marks']);
      expect(await keys('accountant')).toEqual(['fees']);
      expect(await keys('hr')).toEqual(['staff']);
      await get('student', '/v1/analytics/custom-reports/datasets').expect(403);
    });

    it('groups and aggregates, with money in paise', async () => {
      const r = (
        await post('accountant', '/v1/analytics/custom-reports/preview', {
          dataset: 'fees',
          definition: { groupBy: ['title'], aggregates: [{ fn: 'count' }, { fn: 'sum', field: 'amount' }, { fn: 'avg', field: 'paid' }], sort: [{ field: 'sum_amount', dir: 'desc' }] },
        }).expect(200)
      ).body;
      expect(r.columns.map((c: { key: string }) => c.key)).toEqual(['title', 'count', 'sum_amount', 'avg_paid']);
      expect(r.rows).toEqual([
        { title: 'Tuition', count: 2, sum_amount: 2_000_000, avg_paid: 700_000 },
        { title: 'Lab', count: 1, sum_amount: 200_000, avg_paid: 0 },
      ]);
      expect(r.columns[2].kind).toBe('money');
    });

    it('filters on the right types (money in rupees, dates, text, lists)', async () => {
      const run = async (filters: object[]) => (await post('principal', '/v1/analytics/custom-reports/preview', { dataset: 'fees', definition: { columns: ['student', 'amount'], filters } }).expect(200)).body.rows as unknown[];
      expect(await run([{ field: 'amount', op: 'gte', value: 5000 }])).toHaveLength(2);
      expect(await run([{ field: 'due_on', op: 'gte', value: '2026-12-01' }])).toHaveLength(1);
      expect(await run([{ field: 'title', op: 'contains', value: 'lab' }])).toHaveLength(1);
      expect(await run([{ field: 'status', op: 'in', value: ['paid', 'cancelled'] }])).toHaveLength(1);
      expect(await run([{ field: 'student', op: 'is_null' }])).toHaveLength(0);
    });

    it('computes an attendance rate as the average of "present"', async () => {
      const r = (await post('principal', '/v1/analytics/custom-reports/preview', { dataset: 'attendance', definition: { groupBy: ['class'], aggregates: [{ fn: 'avg', field: 'present' }, { fn: 'count' }] } }).expect(200)).body;
      expect(r.rows).toEqual([{ class: 'BCom Sem 3 A', avg_present: 0.67, count: 3 }]);
    });

    it('rejects anything outside the catalogue', async () => {
      const bad = (definition: object, dataset = 'students') => post('principal', '/v1/analytics/custom-reports/preview', { dataset, definition });
      await bad({ columns: ['password_hash'] }).expect(400);
      await bad({ columns: ['student; drop table students'] }).expect(400);
      await bad({ filters: [{ field: 'student', op: 'eq', value: "x' or 1=1 --" }] }).expect(200); // a value is only ever a bound parameter
      await bad({ groupBy: ['status'], aggregates: [{ fn: 'sum', field: 'student' }] }).expect(400);
      await bad({ groupBy: ['status'], sort: [{ field: 'student' }] }).expect(400);
      await bad({ filters: [{ field: 'enrolled_on', op: 'eq', value: 'yesterday' }] }).expect(400);
      await bad({ limit: 100000 }).expect(400);
      await bad({}, 'users').expect(400);
      await bad({ columns: ['pan'] }, 'staff').expect(400);
    });

    it("limits a dataset to the roles allowed and a teacher to the teacher's classes", async () => {
      await post('teacher', '/v1/analytics/custom-reports/preview', { dataset: 'fees', definition: {} }).expect(403);
      await post('accountant', '/v1/analytics/custom-reports/preview', { dataset: 'students', definition: {} }).expect(403);
      await post('hr', '/v1/analytics/custom-reports/preview', { dataset: 'fees', definition: {} }).expect(403);
      const own = (await post('teacher', '/v1/analytics/custom-reports/preview', { dataset: 'students', definition: { columns: ['student'] } }).expect(200)).body.rows;
      expect(own).toHaveLength(3); // the teacher's Monday slot is in section A
      const none = (await post('teacher2', '/v1/analytics/custom-reports/preview', { dataset: 'students', definition: { columns: ['student'] } }).expect(200)).body.rows;
      expect(none).toHaveLength(0);
      const staff = (await post('hr', '/v1/analytics/custom-reports/preview', { dataset: 'staff', definition: { columns: ['employee_code', 'name'] } }).expect(200)).body.rows;
      expect(staff).toEqual([{ employee_code: 'OPS1', name: expect.any(String) }]);
    });

    it('keeps institutions apart', async () => {
      const mine = (await post('principal', '/v1/analytics/custom-reports/preview', { dataset: 'fees', definition: { aggregates: [{ fn: 'sum', field: 'amount' }] } }).expect(200)).body.rows;
      expect(mine[0].sum_amount).toBe(2_200_000);
      const theirs = (await post('outsider', '/v1/analytics/custom-reports/preview', { dataset: 'fees', definition: { aggregates: [{ fn: 'sum', field: 'amount' }] } }).expect(200)).body.rows;
      expect(theirs[0].sum_amount).toBe(9_999_900);
    });

    it('saves, runs, exports CSV and audits the run', async () => {
      const body = { name: 'Fees by title', dataset: 'fees', definition: { groupBy: ['title'], aggregates: [{ fn: 'sum', field: 'balance' }] } };
      const created = (await post('accountant', '/v1/analytics/custom-reports', body).expect(201)).body;
      reportId = created.id;
      await post('teacher', '/v1/analytics/custom-reports', body).expect(403);
      const run = (await post('accountant', `/v1/analytics/custom-reports/${reportId}/run`, {}).expect(200)).body;
      expect(run.rows).toEqual([{ title: 'Tuition', sum_balance: 600_000 }, { title: 'Lab', sum_balance: 200_000 }].sort((a, b) => a.title.localeCompare(b.title)));
      const csv = await get('accountant', `/v1/analytics/custom-reports/${reportId}/export?format=csv`).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text).toContain('Sum of Balance');
      expect(csv.text).toContain('6000.00'); // rupees in the export
      const audited = await owner.query("select count(*)::int as n from audit_log where tenant_id = $1 and action = 'report.custom_run' and subject_id = $2", [t.tenantId, reportId]);
      expect(audited.rows[0].n).toBe(2);
      // Someone else's report is not visible, a leader sees it, and the other institution never does.
      expect((await get('principal', '/v1/analytics/custom-reports').expect(200)).body.map((r: { id: string }) => r.id)).toContain(reportId);
      await put('hr', `/v1/analytics/custom-reports/${reportId}`, body).expect(403);
      await post('outsider', `/v1/analytics/custom-reports/${reportId}/run`, {}).expect(404);
      const edited = (await put('accountant', `/v1/analytics/custom-reports/${reportId}`, { ...body, name: 'Fees balance' }).expect(200)).body;
      expect(edited.name).toBe('Fees balance');
    });

    it('is scheduled through the existing report schedules', async () => {
      await post('accountant', `/v1/analytics/custom-reports/${reportId}/schedule`, { frequency: 'weekly', recipients: ['teacher1@x.in'] }).expect(400);
      const principalEmail = (await owner.query('select email from users where id = $1', [t.principal.id])).rows[0].email as string;
      // The principal may see the fees dataset; a teacher may not.
      const teacherEmail = (await owner.query('select email from users where id = $1', [t.teacher.id])).rows[0].email as string;
      await post('accountant', `/v1/analytics/custom-reports/${reportId}/schedule`, { frequency: 'weekly', recipients: [teacherEmail] }).expect(400);
      const sched = (await post('accountant', `/v1/analytics/custom-reports/${reportId}/schedule`, { frequency: 'weekly', recipients: [principalEmail] }).expect(201)).body;
      expect(sched.reportKey).toBe(`custom.${reportId}`);
      await owner.query("update report_schedules set next_run_at = now() - interval '1 minute' where id = $1", [sched.id]);
      expect(await app.get(ReportsService).runDue()).toBeGreaterThanOrEqual(1);
      const run = (await owner.query('select status, row_count from report_runs where schedule_id = $1', [sched.id])).rows[0];
      expect(run).toEqual({ status: 'ok', row_count: 2 });
      const listed = (await get('accountant', '/v1/analytics/custom-reports').expect(200)).body.find((r: { id: string }) => r.id === reportId);
      expect(listed.schedule.frequency).toBe('weekly');
      await http().delete(`/v1/analytics/custom-reports/${reportId}/schedule`).set(auth('accountant')).expect(204);
      expect((await owner.query('select count(*)::int as n from report_schedules where report_key = $1', [`custom.${reportId}`])).rows[0].n).toBe(0);
      await http().delete(`/v1/analytics/custom-reports/${reportId}`).set(auth('accountant')).expect(204);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('connector registry and outbound webhooks', () => {
    let hookId: string;
    const secret = 'whsec_0123456789abcdef';
    const drain = async () => {
      await app.get(EventBus).drain();
      return app.get(ConnectorsService).deliverDue();
    };
    const delivery = async (id: string) => (await owner.query('select * from connector_deliveries where connector_id = $1 order by created_at', [id])).rows;
    const donate = (amountPaise = 50_000) => post('placement', `/v1/alumni/campaigns/${campaignId}/donations`, { donorName: 'Event Donor', amountPaise, mode: 'cash', receivedOn: '2025-10-20' }).expect(201);
    let campaignId: string;

    beforeAll(async () => {
      campaignId = (await post('placement', '/v1/alumni/campaigns', { name: 'Hook campaign' }).expect(201)).body.id;
    });

    it('lists the types with their forms; the webhook, Koha, video and BI export are available', async () => {
      const types = (await get('principal', '/v1/connectors/types').expect(200)).body as { type: string; available: boolean; fields: unknown[] }[];
      expect(types.map((x) => x.type)).toEqual(['webhook_out', 'sms_provider', 'payment', 'gps', 'library_koha', 'lms_video', 'bi_export']);
      expect(types.filter((x) => x.available).map((x) => x.type)).toEqual(['webhook_out', 'library_koha', 'lms_video', 'bi_export']);
      expect(types.every((x) => x.fields.length > 0)).toBe(true);
      await get('teacher', '/v1/connectors/types').expect(403);
    });

    it('is configured by the administrator, stored encrypted, and never shows a secret back', async () => {
      await post('principal', '/v1/connectors', { type: 'webhook_out', name: 'ERP', config: { url: hookUrl, secret } }).expect(403);
      await post('admin', '/v1/connectors', { type: 'nope', name: 'x', config: {} }).expect(400);
      await post('admin', '/v1/connectors', { type: 'webhook_out', name: 'x', config: { url: hookUrl, secret: 'short' } }).expect(400);
      await post('admin', '/v1/connectors', { type: 'webhook_out', name: 'x', config: { url: hookUrl, secret, extra: 1 } }).expect(400);
      const created = (await post('admin', '/v1/connectors', { type: 'webhook_out', name: 'Warehouse', config: { url: hookUrl, secret, events: [] } }).expect(201)).body;
      hookId = created.id;
      expect(JSON.stringify(created)).not.toContain(secret);
      expect(created.config.url).toBe(hookUrl);
      expect(created.secretsSet).toEqual(['secret']);
      expect(created.enabled).toBe(false);
      const row = (await owner.query('select config_enc, config_public from connectors where id = $1', [hookId])).rows[0];
      expect(row.config_enc).toMatch(/^v1\./);
      expect(row.config_enc).not.toContain(secret);
      expect(JSON.stringify(row.config_public)).not.toContain(secret);
      const listed = JSON.stringify((await get('principal', '/v1/connectors').expect(200)).body);
      expect(listed).not.toContain(secret);
      await post('admin', '/v1/connectors', { type: 'webhook_out', name: 'Warehouse', config: { url: hookUrl, secret } }).expect(400); // names are unique
      // Settings left blank keep the stored secret.
      const upd = (await patch('admin', `/v1/connectors/${hookId}`, { config: { secret: '' } }).expect(200)).body;
      expect(upd.secretsSet).toEqual(['secret']);
      const audit = await owner.query("select data from audit_log where tenant_id = $1 and action like 'connector.%'", [t.tenantId]);
      expect(JSON.stringify(audit.rows)).not.toContain(secret);
    });

    it("keeps one institution's connectors from another", async () => {
      expect((await get('outsiderAdmin', '/v1/connectors').expect(200)).body).toEqual([]);
      await post('outsiderAdmin', `/v1/connectors/${hookId}/test`).expect(404);
      await post('outsiderAdmin', `/v1/connectors/${hookId}/enable`).expect(404);
    });

    it('tests a webhook with a signed request, and reports other types as not available', async () => {
      hits = [];
      const ok = (await post('admin', `/v1/connectors/${hookId}/test`).expect(200)).body;
      expect(ok.status).toBe('ok');
      expect(hits).toHaveLength(1);
      expect(hits[0].headers['x-kinetix-event']).toBe('connector.test');
      expect(verifyWebhook(secret, hits[0].body, hits[0].headers['x-kinetix-signature'] as string)).toBe(true);
      expect(verifyWebhook('wrong-secret-wrong-secret', hits[0].body, hits[0].headers['x-kinetix-signature'] as string)).toBe(false);
      answer = 500;
      const failed = (await post('admin', `/v1/connectors/${hookId}/test`).expect(200)).body;
      answer = 200;
      expect(failed).toMatchObject({ status: 'failed', httpStatus: 500 });
      const sms = (await post('admin', '/v1/connectors', { type: 'sms_provider', name: 'SMS', config: { provider: 'msg91', apiKey: 'k-123456' } }).expect(201)).body;
      expect(await post('admin', `/v1/connectors/${sms.id}/test`).expect(200).then((r) => r.body)).toEqual({ status: 'not_available', message: 'Not available in this build' });
      const saved = (await get('admin', '/v1/connectors').expect(200)).body.find((c: { id: string }) => c.id === sms.id);
      expect(saved.lastTestStatus).toBe('not_available');
      expect(saved.available).toBe(false);
      await post('admin', '/v1/connectors', { type: 'sms_provider', name: 'SMS 2', config: { provider: 'carrier-pigeon', apiKey: 'k' } }).expect(400);
    });

    it('delivers domain events with an HMAC signature once enabled, and not while disabled', async () => {
      await drain();
      hits = [];
      await donate(); // disabled: no delivery queued
      await drain();
      expect(await delivery(hookId)).toHaveLength(0);
      expect(hits).toHaveLength(0);

      await post('admin', `/v1/connectors/${hookId}/enable`).expect(200);
      const donation = (await donate(75_000)).body;
      await drain();
      expect(hits).toHaveLength(1);
      const hit = hits[0];
      expect(hit.headers['x-kinetix-event']).toBe('alumni.donation_received');
      expect(verifyWebhook(secret, hit.body, hit.headers['x-kinetix-signature'] as string)).toBe(true);
      // A tampered body or a replay beyond the tolerance fails verification.
      expect(verifyWebhook(secret, hit.body + ' ', hit.headers['x-kinetix-signature'] as string)).toBe(false);
      expect(verifyWebhook(secret, hit.body, signWebhook(secret, hit.body, 1000))).toBe(false);
      const event = JSON.parse(hit.body);
      expect(event).toMatchObject({ type: 'alumni.donation_received', tenantId: t.tenantId, aggregateId: donation.id, data: { amountPaise: 75_000 } });
      expect(hit.headers['x-kinetix-delivery']).toBeTruthy();
      const rows = await delivery(hookId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: 'delivered', attempts: 1, response_status: 200 });
      // The same event is never queued twice.
      await drain();
      expect(await delivery(hookId)).toHaveLength(1);
    });

    it('retries failures with a log, and gives up after five attempts', async () => {
      hits = [];
      answer = 503;
      await donate(10_000);
      await drain();
      let rows = await delivery(hookId);
      const failing = rows.find((r) => r.status === 'retrying');
      expect(failing).toMatchObject({ attempts: 1, response_status: 503 });
      expect(failing.last_error).toContain('503');
      expect(new Date(failing.next_attempt_at).getTime()).toBeGreaterThan(Date.now());
      // Not due yet: nothing is sent.
      const before = hits.length;
      await app.get(ConnectorsService).deliverDue();
      expect(hits.length).toBe(before);

      // Due again and the receiver recovers.
      answer = 200;
      await owner.query("update connector_deliveries set next_attempt_at = now() - interval '1 second' where id = $1", [failing.id]);
      await app.get(ConnectorsService).deliverDue();
      rows = await delivery(hookId);
      expect(rows.find((r) => r.id === failing.id)).toMatchObject({ status: 'delivered', attempts: 2, last_error: null });

      // A receiver that never recovers.
      answer = 500;
      await donate(20_000);
      await drain();
      const dead = (await delivery(hookId)).find((r) => r.status === 'retrying')!;
      for (let i = 0; i < 5; i++) {
        await owner.query("update connector_deliveries set next_attempt_at = now() - interval '1 second' where id = $1", [dead.id]);
        await app.get(ConnectorsService).deliverDue();
      }
      const final = (await delivery(hookId)).find((r) => r.id === dead.id);
      expect(final).toMatchObject({ status: 'dead', attempts: 5 });
      // A person can put a dead delivery back in the queue.
      answer = 200;
      await post('principal', `/v1/connectors/deliveries/${dead.id}/retry`).expect(403);
      await post('admin', `/v1/connectors/deliveries/${dead.id}/retry`).expect(204);
      await new Promise((r) => setTimeout(r, 400));
      await app.get(ConnectorsService).deliverDue();
      expect((await delivery(hookId)).find((r) => r.id === dead.id)?.status).toBe('delivered');
      const log = (await get('principal', `/v1/connectors/${hookId}/deliveries`).expect(200)).body;
      expect(log.length).toBeGreaterThanOrEqual(3);
    });

    it('sends only the events a webhook subscribed to, and only its own institution\'s', async () => {
      const narrow = (await post('admin', '/v1/connectors', { type: 'webhook_out', name: 'Narrow', enabled: true, config: { url: hookUrl, secret, events: ['exams.results_published'] } }).expect(201)).body;
      await post('admin', `/v1/connectors/${hookId}/disable`).expect(200);
      hits = [];
      await donate(5_000);
      await drain();
      expect(await delivery(narrow.id)).toHaveLength(0);
      expect(hits).toHaveLength(0);
      // The other institution's events never reach this institution's connectors.
      const [camp] = (await owner.query("insert into alumni_campaigns (tenant_id, name) values ($1, 'Other') returning id", [other.tenantId])).rows;
      const evCount = (await owner.query("insert into domain_events (tenant_id, type, aggregate_type, payload) values ($1, 'exams.results_published', 'x', '{}') returning id", [other.tenantId])).rowCount;
      expect(evCount).toBe(1);
      expect(camp.id).toBeTruthy();
      await drain();
      expect(await delivery(narrow.id)).toHaveLength(0);
    });

    it('removes a connector with its log', async () => {
      await http().delete(`/v1/connectors/${hookId}`).set(auth('principal')).expect(403);
      await http().delete(`/v1/connectors/${hookId}`).set(auth('admin')).expect(204);
      expect(await delivery(hookId)).toHaveLength(0);
    });

    it('refuses addresses on the private network in production', () => {
      expect(() => assertSafeUrl('http://127.0.0.1:9/h', true)).toThrow();
      expect(() => assertSafeUrl('https://10.0.0.5/h', true)).toThrow();
      expect(() => assertSafeUrl('https://localhost/h', true)).toThrow();
      expect(() => assertSafeUrl('https://169.254.169.254/latest', true)).toThrow();
      expect(() => assertSafeUrl('http://example.org/h', true)).toThrow();
      expect(() => assertSafeUrl('https://hooks.example.org/h', true)).not.toThrow();
      expect(() => assertSafeUrl('ftp://example.org/h', false)).toThrow();
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('alumni giving', () => {
    let campaignId: string;
    let alumniId: string;

    beforeAll(async () => {
      alumniId = (await post('placement', '/v1/placements/alumni', { fullName: 'Anil Alumnus', graduationYear: 2018, program: 'BCom' }).expect(201)).body.id;
    });

    it('is for alumni relations and the accounts office', async () => {
      await get('teacher', '/v1/alumni/campaigns').expect(403);
      await post('student', '/v1/alumni/campaigns', { name: 'x' }).expect(403);
      await get('hr', '/v1/alumni/donations').expect(403);
      await get('accountant', '/v1/alumni/campaigns').expect(200);
    });

    it('runs a campaign: pledge, donations, receipts and totals', async () => {
      campaignId = (await post('placement', '/v1/alumni/campaigns', { name: 'Library fund', goalPaise: 1_000_000, receiptNote: 'Exempt under Section 80G, reg. no. AB/123/2020' }).expect(201)).body.id;
      const pledge = (await post('placement', `/v1/alumni/campaigns/${campaignId}/pledges`, { alumniId, amountPaise: 300_000, pledgedOn: '2026-10-01' }).expect(201)).body;
      expect(pledge.donorName).toBe('Anil Alumnus');
      await post('placement', `/v1/alumni/campaigns/${campaignId}/donations`, { donorName: 'X', amountPaise: 100, mode: 'barter', receivedOn: '2026-10-20' }).expect(400);
      await post('placement', `/v1/alumni/campaigns/${campaignId}/donations`, { donorName: 'X', donorPan: 'bad', amountPaise: 100, mode: 'cash', receivedOn: '2026-10-20' }).expect(400);
      await post('placement', `/v1/alumni/campaigns/${campaignId}/donations`, { amountPaise: 100, mode: 'cash', receivedOn: '2026-10-20' }).expect(400);
      await post('placement', `/v1/alumni/campaigns/${campaignId}/donations`, { donorName: 'X', amountPaise: 0, mode: 'cash', receivedOn: '2026-10-20' }).expect(400);

      const d1 = (await post('accountant', `/v1/alumni/campaigns/${campaignId}/donations`, { alumniId, pledgeId: pledge.id, donorPan: 'abcde1234f', donorAddress: '12 MG Road, Pune', amountPaise: 150_000, mode: 'upi', reference: 'UPI-778', receivedOn: '2026-10-20' }).expect(201)).body;
      expect(d1.receiptSerial).toBe('ALR-2026-27-0001');
      expect(d1.donorPan).toBe('ABCDE1234F');
      let c = (await get('placement', `/v1/alumni/campaigns/${campaignId}`).expect(200)).body;
      expect(c.pledges[0].status).toBe('open'); // only half paid
      const d2 = (await post('placement', `/v1/alumni/campaigns/${campaignId}/donations`, { alumniId, pledgeId: pledge.id, amountPaise: 150_000, mode: 'cheque', reference: 'CHQ 0042', receivedOn: '2027-03-31' }).expect(201)).body;
      expect(d2.receiptSerial).toBe('ALR-2026-27-0002');
      const d3 = (await post('placement', `/v1/alumni/campaigns/${campaignId}/donations`, { donorName: 'Walk-in donor', amountPaise: 25_000, mode: 'cash', receivedOn: '2027-04-02' }).expect(201)).body;
      expect(d3.receiptSerial).toBe('ALR-2027-28-0001'); // a new financial year restarts the series

      c = (await get('placement', `/v1/alumni/campaigns/${campaignId}`).expect(200)).body;
      expect(c).toMatchObject({ raisedPaise: 325_000, donations: 3, donors: 2, pledgedOpenPaise: 0, percent: 32.5 });
      expect(c.pledges[0].status).toBe('fulfilled');
      const listed = (await get('placement', '/v1/alumni/campaigns').expect(200)).body.find((x: { id: string }) => x.id === campaignId);
      expect(listed.raisedPaise).toBe(325_000);
      expect((await get('placement', `/v1/alumni/donations?campaignId=${campaignId}`).expect(200)).body).toHaveLength(3);
    });

    it('produces the receipt PDF, audited, only for those allowed', async () => {
      const [d] = (await get('placement', `/v1/alumni/donations?campaignId=${campaignId}`).expect(200)).body.filter((x: { receiptSerial: string }) => x.receiptSerial === 'ALR-2026-27-0001');
      const res = await get('accountant', `/v1/alumni/donations/${d.id}/receipt`).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      }).expect(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('ALR-2026-27-0001.pdf');
      const pdf = (res.body as Buffer).toString('latin1');
      expect(pdf.startsWith('%PDF')).toBe(true);
      expect(pdf).toContain('ALR-2026-27-0001');
      expect(pdf).toContain('Anil Alumnus');
      expect(pdf).toContain('ABCDE1234F');
      expect(pdf).toContain('One Thousand Five Hundred');
      expect(pdf).toContain('Section 80G');
      await get('teacher', `/v1/alumni/donations/${d.id}/receipt`).expect(403);
      await get('outsider', `/v1/alumni/donations/${d.id}/receipt`).expect(404);
      expect((await owner.query("select count(*)::int as n from audit_log where tenant_id = $1 and action = 'alumni.receipt_downloaded'", [t.tenantId])).rows[0].n).toBe(1);
    });

    it('stops taking pledges and donations once the campaign is closed', async () => {
      await put('placement', `/v1/alumni/campaigns/${campaignId}`, { name: 'Library fund', goalPaise: 1_000_000, status: 'closed' }).expect(200);
      await post('placement', `/v1/alumni/campaigns/${campaignId}/donations`, { donorName: 'Late', amountPaise: 100, mode: 'cash', receivedOn: '2026-10-20' }).expect(409);
      await post('placement', `/v1/alumni/campaigns/${campaignId}/pledges`, { donorName: 'Late', amountPaise: 100, pledgedOn: '2026-10-20' }).expect(409);
    });

    it('takes volunteering sign-ups up to the places available', async () => {
      const opp = (await post('placement', '/v1/alumni/volunteering', { title: 'Career day panel', slots: 1, startsOn: '2026-11-15' }).expect(201)).body;
      await post('accountant', '/v1/alumni/volunteering', { title: 'x' }).expect(403);
      await post('placement', `/v1/alumni/volunteering/${opp.id}/signups`, { alumniId, note: 'Happy to talk about finance' }).expect(201);
      await post('placement', `/v1/alumni/volunteering/${opp.id}/signups`, { alumniId }).expect(409);
      const second = (await post('placement', '/v1/placements/alumni', { fullName: 'Bela Alumna', graduationYear: 2019 }).expect(201)).body.id;
      await post('placement', `/v1/alumni/volunteering/${opp.id}/signups`, { alumniId: second }).expect(409); // full
      const list = (await get('placement', '/v1/alumni/volunteering').expect(200)).body;
      expect(list[0].signups).toEqual([{ opportunityId: opp.id, alumniId, note: 'Happy to talk about finance', fullName: 'Anil Alumnus' }]);
      await http().delete(`/v1/alumni/volunteering/${opp.id}/signups/${alumniId}`).set(auth('placement')).expect(204);
      await post('placement', `/v1/alumni/volunteering/${opp.id}/signups`, { alumniId: second }).expect(201);
      await put('placement', `/v1/alumni/volunteering/${opp.id}`, { title: 'Career day panel', slots: 1, status: 'closed' }).expect(200);
      await post('placement', `/v1/alumni/volunteering/${opp.id}/signups`, { alumniId }).expect(409);
    });

    it('writes amounts in words and finds the financial year', () => {
      expect(amountInWords(150_000)).toBe('Rupees One Thousand Five Hundred Only');
      expect(amountInWords(12_525_050)).toBe('Rupees One Lakh Twenty Five Thousand Two Hundred Fifty and Fifty Paise Only');
      expect(amountInWords(1_000_000_000)).toBe('Rupees One Crore Only');
      expect(financialYear('2027-03-31')).toBe('2026-27');
      expect(financialYear('2027-04-01')).toBe('2027-28');
      expect(financialYear('2026-12-31')).toBe('2026-27');
    });
  });
});
