import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Mailer, type Mail } from '../src/analytics/mailer.js';
import { fillTemplate, placeholders, retryDelayMinutes, toE164 } from '../src/comms/comms.logic.js';
import * as s from '../src/db/schema.js';
import { EventBus } from '../src/events/events.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

const PDF = (tag: string) => Buffer.from(`%PDF-1.4 ${tag}`);

describe('communication rules', () => {
  it('fills placeholders and lists the ones with no value', () => {
    expect(fillTemplate('Dear {{name}}, {{item}} is due on {{ date }}.', { name: 'Asha', date: '1 Nov' })).toEqual({ text: 'Dear Asha,  is due on 1 Nov.', missing: ['item'] });
    expect(placeholders('{{a}} {{b}} {{a}}')).toEqual(['a', 'b']);
  });
  it('backs off between retries and stops after three', () => {
    expect([1, 2, 3].map(retryDelayMinutes)).toEqual([15, 60, null]);
  });
  it('turns phone numbers into E.164 form', () => {
    expect([toE164('98000 00001'), toE164('+919800000001'), toE164('919800000001'), toE164('12345'), toE164(null)]).toEqual(['+919800000001', '+919800000001', '+919800000001', null, null]);
  });
});

describe('document versions, retention, communication, parent visibility and approval-bound flows', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  const sent: Mail[] = [];
  let failMail = 0;
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(auth(who)).send(body);
  const q = async <R = { id: string }>(sql: string, args: unknown[]) => (await owner.query(sql, args)).rows as R[];
  const bin = (who: string, url: string) =>
    get(who, url).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
  const drain = () => app.get(EventBus).drain();
  const start = clock.at;

  beforeAll(async () => {
    t = await createTenant(owner);
    const hash = await argon2.hash('pw');
    const [acc] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Asha Accounts', email: 'asha@acc.in', passwordHash: hash }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: acc.id, role: 'accountant' });
    ids.accountant = acc.id;
    app = await createApp(clock, (b) =>
      b.overrideProvider(Mailer).useValue({
        send: async (m: Mail) => {
          if (failMail > 0) {
            failMail -= 1;
            throw new Error('mail relay down');
          }
          sent.push(m);
        },
      }),
    );
    tokens = {
      teacher: await login(t.slug, t.teacher.email!),
      principal: await login(t.slug, t.principal.email!),
      student: await login(t.slug, t.studentUser.email!),
      parent: await login(t.slug, t.guardian.email!),
      parent2: await login(t.slug, t.guardian2.email!),
      accountant: await login(t.slug, 'asha@acc.in'),
    };
    ids.me = t.students[2].id;
    await q(`update users set phone = '9800000001' where id = $1`, [t.studentUser.id]);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('document versions', () => {
    const V = '/v1/documents/vault';
    const up = (q2: string, body: Buffer) => http().post(`${V}/student/${t.students[0].id}?${q2}`).set(auth('principal')).set('content-type', 'application/pdf').send(body);

    it('lists every version of a document and restores an older one as a new version', async () => {
      const v1 = (await up('title=Aadhaar&category=aadhaar&visibility=staff', PDF('one')).expect(201)).body;
      const v2 = (await up(`title=Aadhaar&category=aadhaar&visibility=staff&replacesId=${v1.id}`, PDF('two')).expect(201)).body;
      const v3 = (await up(`title=Aadhaar&category=aadhaar&visibility=staff&replacesId=${v2.id}`, PDF('three')).expect(201)).body;
      expect([v1.version, v2.version, v3.version]).toEqual([1, 2, 3]);
      const fromOld = (await get('principal', `${V}/files/${v1.id}/versions`).expect(200)).body;
      const fromNew = (await get('principal', `${V}/files/${v3.id}/versions`).expect(200)).body;
      expect(fromOld.map((x: { version: number }) => x.version)).toEqual([1, 2, 3]);
      expect(fromNew.map((x: { id: string }) => x.id)).toEqual(fromOld.map((x: { id: string }) => x.id));
      expect(fromNew.map((x: { current: boolean }) => x.current)).toEqual([false, false, true]);
      await get('parent', `${V}/files/${v1.id}/versions`).expect(404);
      await post('teacher', `${V}/files/${v1.id}/restore`).expect(404);
      const restored = (await post('principal', `${V}/files/${v1.id}/restore`).expect(201)).body;
      expect(restored).toMatchObject({ version: 4, title: 'Aadhaar' });
      expect((await bin('principal', `${V}/files/${restored.id}`)).body.toString()).toBe('%PDF-1.4 one');
      const all = (await get('principal', `${V}/files/${restored.id}/versions`).expect(200)).body;
      expect(all.map((x: { version: number; current: boolean }) => [x.version, x.current])).toEqual([[1, false], [2, false], [3, false], [4, true]]);
      expect((await q<{ n: number }>(`select count(*)::int as n from vault_documents where tenant_id = $1 and category = 'aadhaar' and archived_at is null`, [t.tenantId]))[0].n).toBe(1);
      await post('principal', `${V}/files/${restored.id}/restore`).expect(400);
    });
  });

  describe('retention rules', () => {
    const RT = '/v1/retention';

    it('checks what a rule may do, previews it, then applies it', async () => {
      await put('teacher', `${RT}/rules`, { target: 'notifications', keepDays: 90, action: 'delete' }).expect(403);
      await put('principal', `${RT}/rules`, { target: 'vault_documents', category: 'aadhaar', keepDays: 90, action: 'delete' }).expect(400);
      await put('principal', `${RT}/rules`, { target: 'notifications', category: 'x', keepDays: 90, action: 'delete' }).expect(400);
      await put('principal', `${RT}/rules`, { target: 'notifications', keepDays: 5, action: 'delete' }).expect(400);
      await put('principal', `${RT}/rules`, { target: 'vault_documents', category: 'aadhaar', keepDays: 365, action: 'archive' }).expect(200);
      const rule = (await put('principal', `${RT}/rules`, { target: 'notifications', keepDays: 90, action: 'delete' }).expect(200)).body;
      const again = (await put('principal', `${RT}/rules`, { target: 'notifications', keepDays: 60, action: 'delete' }).expect(200)).body;
      expect(again.id).toBe(rule.id);
      expect((await get('principal', `${RT}/rules`).expect(200)).body.rules).toHaveLength(2);
      await q(`insert into notifications (tenant_id, user_id, kind, title, body, dedupe_key, read_at) values ($1,$2,'broadcast','Old read','x','old-read-1', now())`, [t.tenantId, t.studentUser.id]);
      await q(`insert into notifications (tenant_id, user_id, kind, title, body, dedupe_key) values ($1,$2,'broadcast','Old unread','x','old-unread-1')`, [t.tenantId, t.studentUser.id]);
      // Nothing is old enough yet.
      expect((await post('principal', `${RT}/run`).expect(200)).body.every((r: { affected: number }) => r.affected === 0)).toBe(true);
      clock.at = new Date(start.getTime() + 400 * 86_400_000);
      const dry = (await post('principal', `${RT}/run`).expect(200)).body;
      expect(dry.find((r: { target: string }) => r.target === 'notifications').affected).toBe(1);
      expect(dry.find((r: { target: string }) => r.target === 'vault_documents').affected).toBe(1);
      expect((await q<{ n: number }>(`select count(*)::int as n from notifications where dedupe_key = 'old-read-1'`, []))[0].n).toBe(1);
      const real = (await post('principal', `${RT}/run?dryRun=false`).expect(200)).body;
      expect(real.find((r: { target: string }) => r.target === 'notifications').affected).toBe(1);
      expect((await q<{ n: number }>(`select count(*)::int as n from notifications where dedupe_key = 'old-read-1'`, []))[0].n).toBe(0);
      expect((await q<{ n: number }>(`select count(*)::int as n from notifications where dedupe_key = 'old-unread-1'`, []))[0].n).toBe(1);
      expect((await q<{ n: number }>(`select count(*)::int as n from vault_documents where tenant_id = $1 and category = 'aadhaar' and archived_at is null`, [t.tenantId]))[0].n).toBe(0);
      expect((await get('principal', `${RT}/rules`).expect(200)).body.rules.find((r: { target: string }) => r.target === 'notifications').lastAffected).toBe(1);
      clock.at = start;
    });
  });

  describe('communication engine', () => {
    const CM = '/v1/comms';
    let studentsAudience = '';

    it('keeps templates per channel and language and saved audiences', async () => {
      const tpl = (body: object) => post('principal', `${CM}/templates`, body);
      await tpl({ key: 'fee_reminder', channel: 'in_app', body: 'Hello {{name}}, {{item}} is due on {{date}}.', subject: 'Fee reminder' }).expect(201);
      await tpl({ key: 'fee_reminder', channel: 'in_app', body: 'again' }).expect(409);
      await tpl({ key: 'fee_reminder', channel: 'in_app', locale: 'kn', body: 'ನಮಸ್ಕಾರ {{name}}, {{item}} {{date}} ರಂದು ಬಾಕಿ.', subject: 'ಶುಲ್ಕ ಜ್ಞಾಪನೆ' }).expect(201);
      await tpl({ key: 'Bad Key', channel: 'sms', body: 'abc' }).expect(400);
      await post('teacher', `${CM}/templates`, { key: 'x1', channel: 'email', body: 'abc' }).expect(403);
      const list = (await get('principal', `${CM}/templates`).expect(200)).body;
      expect(list.find((x: { locale: string }) => x.locale === 'en').placeholders).toEqual(['name', 'item', 'date']);
      await post('principal', `${CM}/audiences`, { name: 'Nobody', rule: {} }).expect(400);
      studentsAudience = (await post('principal', `${CM}/audiences`, { name: 'All students', rule: { roles: ['student'] } }).expect(201)).body.id;
      const a2 = (await post('principal', `${CM}/audiences`, { name: 'Parents of Sem 3 A', rule: { roles: ['guardian'], sectionIds: [t.section.id] } }).expect(201)).body;
      expect(a2.size).toBe(2);
      expect((await post('principal', `${CM}/audiences/preview`, { roles: ['teacher'] }).expect(200)).body.size).toBeGreaterThanOrEqual(2);
      await post('principal', `${CM}/audiences`, { name: 'All students', rule: { roles: ['student'] } }).expect(409);
    });

    it('sends in-app messages in the recipient’s language and tracks who read them', async () => {
      const tplId = (await get('principal', `${CM}/templates`).expect(200)).body.find((x: { locale: string }) => x.locale === 'en').id;
      await q(`update users set preferred_language = 'kn' where id = $1`, [t.studentUser.id]);
      const c = (await post('principal', `${CM}/campaigns`, { title: 'October fee reminder', templateId: tplId, audienceId: studentsAudience, vars: { item: 'Tuition', date: '1 Nov' } }).expect(201)).body;
      expect(c).toMatchObject({ status: 'sent', recipients: 1, sentCount: 1, failedCount: 0, delivery: { sent: 1 } });
      const n = (await q<{ title: string; body: string; kind: string }>(`select title, body, kind from notifications where dedupe_key = $1`, [`campaign:${c.id}:${t.studentUser.id}`]))[0];
      expect(n.kind).toBe('broadcast');
      expect(n.body).toContain(`ನಮಸ್ಕಾರ ${t.studentUser.fullName}`);
      expect(n.body).toContain('Tuition');
      await q(`update notifications set read_at = now() where dedupe_key = $1`, [`campaign:${c.id}:${t.studentUser.id}`]);
      expect((await get('principal', `${CM}/campaigns/${c.id}`).expect(200)).body.delivery).toEqual({ read: 1 });
      await q(`update users set preferred_language = 'en' where id = $1`, [t.studentUser.id]);
    });

    it('schedules sends for later, runs them when due and lets a scheduled one be cancelled', async () => {
      const tplId = (await get('principal', `${CM}/templates`).expect(200)).body.find((x: { locale: string }) => x.locale === 'en').id;
      const later = new Date(start.getTime() + 2 * 3600_000).toISOString();
      await post('principal', `${CM}/campaigns`, { title: 'Past', templateId: tplId, audienceId: studentsAudience, sendAt: new Date(start.getTime() - 3600_000).toISOString() }).expect(409);
      const c = (await post('principal', `${CM}/campaigns`, { title: 'Later', templateId: tplId, audienceId: studentsAudience, vars: { item: 'Library fine', date: '5 Nov' }, sendAt: later }).expect(201)).body;
      expect(c).toMatchObject({ status: 'scheduled', recipients: 0 });
      const skipped = (await post('principal', `${CM}/campaigns`, { title: 'Cancelled', templateId: tplId, audienceId: studentsAudience, sendAt: later }).expect(201)).body;
      await post('principal', `${CM}/campaigns/${skipped.id}/cancel`).expect(200);
      await post('principal', `${CM}/campaigns/${skipped.id}/cancel`).expect(409);
      expect((await post('principal', `${CM}/run`).expect(200)).body).toEqual({ campaigns: 0, retried: 0 });
      clock.at = new Date(start.getTime() + 3 * 3600_000);
      expect((await post('principal', `${CM}/run`).expect(200)).body).toEqual({ campaigns: 1, retried: 0 });
      expect((await get('principal', `${CM}/campaigns/${c.id}`).expect(200)).body).toMatchObject({ status: 'sent', sentCount: 1 });
      expect((await get('principal', `${CM}/campaigns/${skipped.id}`).expect(200)).body.status).toBe('cancelled');
      clock.at = start;
    });

    it('sends email through the general channel and retries failures with back-off', async () => {
      const emailTpl = (await post('principal', `${CM}/templates`, { key: 'notice', channel: 'email', subject: 'School notice for {{name}}', body: 'Dear {{name}}, school is closed on {{date}}.' }).expect(201)).body;
      failMail = 2;
      const c = (await post('principal', `${CM}/campaigns`, { title: 'Closure notice', templateId: emailTpl.id, audienceId: studentsAudience, vars: { date: '12 Nov' } }).expect(201)).body;
      expect(c).toMatchObject({ status: 'sending', failedCount: 1, sentCount: 0 });
      expect(c.failures[0]).toMatchObject({ error: 'mail relay down', attempts: 1 });
      expect(sent).toHaveLength(0);
      // 15 minutes later the first retry fails again; an hour after that it goes through.
      clock.at = new Date(start.getTime() + 16 * 60_000);
      expect((await post('principal', `${CM}/run`).expect(200)).body).toEqual({ campaigns: 0, retried: 1 });
      expect((await get('principal', `${CM}/campaigns/${c.id}`).expect(200)).body.failures[0].attempts).toBe(2);
      clock.at = new Date(start.getTime() + 16 * 60_000 + 61 * 60_000);
      expect((await post('principal', `${CM}/run`).expect(200)).body.retried).toBe(1);
      const done = (await get('principal', `${CM}/campaigns/${c.id}`).expect(200)).body;
      expect(done).toMatchObject({ status: 'sent', sentCount: 1, failedCount: 0 });
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ to: [t.studentUser.email], subject: `School notice for ${t.studentUser.fullName}` });
      expect(sent[0].text).toContain('12 Nov');
      clock.at = start;
    });

    it('stops after three failed attempts and leaves the reason', async () => {
      const tpl = (await post('principal', `${CM}/templates`, { key: 'notice2', channel: 'email', subject: 'Hello', body: 'Hi {{name}}' }).expect(201)).body;
      failMail = 10;
      const c = (await post('principal', `${CM}/campaigns`, { title: 'Always failing', templateId: tpl.id, audienceId: studentsAudience }).expect(201)).body;
      clock.at = new Date(start.getTime() + 20 * 60_000);
      await post('principal', `${CM}/run`).expect(200);
      clock.at = new Date(start.getTime() + 20 * 60_000 + 90 * 60_000);
      await post('principal', `${CM}/run`).expect(200);
      const after = (await get('principal', `${CM}/campaigns/${c.id}`).expect(200)).body;
      expect(after.failures[0]).toMatchObject({ attempts: 3, nextAttemptAt: null });
      expect(after.failedCount).toBe(1);
      clock.at = new Date(clock.at.getTime() + 24 * 3600_000);
      expect((await post('principal', `${CM}/run`).expect(200)).body.retried).toBe(0);
      failMail = 0;
      clock.at = start;
    });

    it('sends SMS only for templates with a registered DLT id, and does not pretend WhatsApp is connected', async () => {
      const bare = (await post('principal', `${CM}/templates`, { key: 'sms_fee', channel: 'sms', body: 'Fee due {{date}}' }).expect(201)).body;
      await post('principal', `${CM}/campaigns`, { title: 'SMS', templateId: bare.id, audienceId: studentsAudience }).expect(409);
      await put('principal', `${CM}/templates/${bare.id}`, { subject: '', body: 'Fee due {{date}}', dltTemplateId: '1107161234567890123', active: true }).expect(200);
      const c = (await post('principal', `${CM}/campaigns`, { title: 'SMS', templateId: bare.id, audienceId: studentsAudience, vars: { date: '1 Nov' } }).expect(201)).body;
      expect(c).toMatchObject({ status: 'sent', sentCount: 1 });
      const wa = (await post('principal', `${CM}/templates`, { key: 'wa_fee', channel: 'whatsapp', body: 'Fee due' }).expect(201)).body;
      const err = (await post('principal', `${CM}/campaigns`, { title: 'WA', templateId: wa.id, audienceId: studentsAudience }).expect(409)).body;
      expect(JSON.stringify(err)).toContain('WhatsApp Business is not connected');
    });
  });

  describe('parent visibility', () => {
    const kid = () => t.students[0].id;

    it('shows parents everything by default and lets the school switch sections off', async () => {
      expect((await get('parent', '/v1/parent/visibility').expect(200)).body).toEqual({ attendance: true, diary: true, report_card: true, behaviour: true, activities: true, health: true });
      await get('parent', `/v1/parent/children/${kid()}/attendance`).expect(200);
      await get('parent', `/v1/parent/children/${kid()}/diary`).expect(200);
      await get('parent', `/v1/parent/children/${kid()}/health`).expect(200);
      await get('parent', `/v1/parent/children/${kid()}/activities`).expect(200);
      await get('parent', `/v1/school/report-cards?studentId=${kid()}`).expect(200);
      await put('teacher', '/v1/parent-visibility/attendance', { visible: false }).expect(403);
      await put('principal', '/v1/parent-visibility/marks', { visible: false }).expect(400);
      for (const section of ['attendance', 'diary', 'health', 'activities', 'behaviour', 'report_card']) await put('principal', `/v1/parent-visibility/${section}`, { visible: false }).expect(200);
      expect((await get('principal', '/v1/parent-visibility').expect(200)).body.every((x: { visible: boolean }) => x.visible === false)).toBe(true);
    });

    it('holds back hidden sections from parents only', async () => {
      for (const path of ['attendance', 'diary', 'health', 'activities', 'behaviour']) {
        const r = await get('parent', `/v1/parent/children/${kid()}/${path}`).expect(403);
        expect(JSON.stringify(r.body)).toContain('PARENT_VISIBILITY_OFF');
      }
      await get('parent', `/v1/school/report-cards?studentId=${kid()}`).expect(403);
      await get('parent', `/v1/discipline/students/${kid()}`).expect(403);
      await get('parent', '/v1/discipline/my-notices').expect(403);
      const summary = (await get('parent', `/v1/parent/children/${kid()}/summary`).expect(200)).body;
      expect(summary.attendance).toMatchObject({ hidden: true, periods: 0, rate: null });
      // Staff and the student see their own data regardless.
      await get('principal', `/v1/school/report-cards?studentId=${kid()}`).expect(200);
      await get('principal', `/v1/discipline/students/${kid()}`).expect(200);
      await get('student', `/v1/parent/children/${ids.me}/attendance`).expect(200);
      expect((await get('student', '/v1/student/diary').expect(200)).body).toEqual([]);
      await get('student', '/v1/student/activities').expect(200);
    });

    it('turns a section back on', async () => {
      await put('principal', '/v1/parent-visibility/attendance', { visible: true }).expect(200);
      await get('parent', `/v1/parent/children/${kid()}/attendance`).expect(200);
      expect((await get('parent', `/v1/parent/children/${kid()}/summary`).expect(200)).body.attendance.hidden).toBeUndefined();
      expect((await q<{ n: number }>(`select count(*)::int as n from audit_log where tenant_id = $1 and action = 'parent_visibility.changed'`, [t.tenantId]))[0].n).toBe(7);
    });
  });

  describe('flows that go through the approval workflow', () => {
    const W = '/v1/workflows';
    const B = `${W}/bound`;
    const define = (requestType: string, name: string) => post('principal', `${W}/definitions`, { requestType, name, steps: [{ name: 'Accounts', approver: { kind: 'role', role: 'accountant' } }] }).expect(201);
    const decide = (id: string, decision: 'approve' | 'reject', comment = '') => post('accountant', `${W}/requests/${id}/decide`, { decision, comment }).expect(200);
    const invoice = async (i: number) => ((await get('principal', `/v1/fees/students/${t.students[i].id}`).expect(200)).body.invoices as { id: string; amountPaise: number; paidPaise: number; status: string }[])[0];

    beforeAll(async () => {
      await post('principal', '/v1/fees/invoices', { sectionId: t.section.id, title: 'Tuition', amountPaise: 100_000_00, dueOn: '2026-12-01' }).expect(201);
    });

    it('awards a scholarship only after approval, and applies a rejection', async () => {
      const scheme = (await post('principal', '/v1/finance/scholarship-schemes', { name: 'Merit 50', kind: 'percent', value: 50 }).expect(201)).body;
      const a1 = (await post('parent', '/v1/finance/scholarships/apply', { schemeId: scheme.id, studentId: t.students[0].id }).expect(201)).body;
      const a2 = (await post('parent2', '/v1/finance/scholarships/apply', { schemeId: scheme.id, studentId: t.students[1].id }).expect(201)).body;
      await post('principal', `${B}/scholarships/${a1.id}`).expect(404);
      await define('scholarship_award', 'Scholarship award');
      const blocked = await post('principal', `/v1/finance/scholarships/${a1.id}/decide`, { approve: true }).expect(409);
      expect(JSON.stringify(blocked.body)).toContain('WORKFLOW_REQUIRED');
      const r1 = (await post('principal', `${B}/scholarships/${a1.id}`).expect(201)).body;
      await post('principal', `${B}/scholarships/${a1.id}`).expect(409);
      const r2 = (await post('principal', `${B}/scholarships/${a2.id}`).expect(201)).body;
      expect((await get('principal', `${B}/scholarships/${a1.id}`).expect(200)).body).toMatchObject({ id: r1.id, status: 'pending' });
      expect((await get('principal', `/v1/finance/scholarships?studentId=${t.students[0].id}`).expect(200)).body[0].status).toBe('pending');
      await decide(r1.id, 'approve', 'Merit list');
      await decide(r2.id, 'reject', 'Income proof missing');
      await drain();
      const apps = (await get('principal', '/v1/finance/scholarships').expect(200)).body as { id: string; status: string; awardedPaise: number; decisionNote: string }[];
      expect(apps.find((x) => x.id === a1.id)).toMatchObject({ status: 'approved', awardedPaise: 50_000_00, decisionNote: 'Merit list' });
      expect(apps.find((x) => x.id === a2.id)).toMatchObject({ status: 'rejected', awardedPaise: 0 });
      expect((await invoice(0)).amountPaise).toBe(50_000_00);
      expect((await invoice(1)).amountPaise).toBe(100_000_00);
    });

    it('issues a refund only after approval', async () => {
      const inv = await invoice(0);
      const pay = (await post('principal', `/v1/fees/invoices/${inv.id}/payments`, { amountPaise: 50_000_00, method: 'cash' }).expect(201)).body;
      const paymentId = pay.paymentId ?? pay.id;
      await post('principal', `${B}/refunds`, { paymentId, amountPaise: 10_000_00, reason: 'Duplicate charge' }).expect(404);
      await define('fee_refund', 'Fee refund');
      await post('principal', '/v1/finance/refunds', { paymentId, amountPaise: 10_000_00, reason: 'Duplicate charge' }).expect(409);
      await post('principal', `${B}/refunds`, { paymentId, amountPaise: 60_000_00, reason: 'Too much' }).expect(400);
      const r = (await post('principal', `${B}/refunds`, { paymentId, amountPaise: 10_000_00, reason: 'Duplicate charge' }).expect(201)).body;
      await post('principal', `${B}/refunds`, { paymentId, amountPaise: 45_000_00, reason: 'More than is left' }).expect(400);
      expect((await q<{ n: number }>(`select count(*)::int as n from fee_refunds where tenant_id = $1`, [t.tenantId]))[0].n).toBe(0);
      await decide(r.workflowRequestId, 'approve');
      await drain();
      expect((await q<{ n: number }>(`select count(*)::int as n from fee_refunds where tenant_id = $1 and amount_paise = 1000000`, [t.tenantId]))[0].n).toBe(1);
      expect((await q<{ status: string }>(`select status from refund_requests where id = $1`, [r.refundRequestId]))[0].status).toBe('refunded');
      expect((await invoice(0)).paidPaise).toBe(40_000_00);
    });

    it('approves a certificate request through the workflow', async () => {
      const tpl = (await get('principal', '/v1/documents/templates').expect(200)).body.find((x: { kind: string }) => x.kind === 'bonafide');
      const cert = (await post('parent', '/v1/documents/requests', { templateId: tpl.id, studentId: t.students[0].id, purpose: 'Bank account' }).expect(201)).body;
      await define('certificate_issue', 'Certificate approval');
      const blocked = await post('principal', `/v1/documents/requests/${cert.id}/approve`, {}).expect(409);
      expect(JSON.stringify(blocked.body)).toContain('WORKFLOW_REQUIRED');
      const r = (await post('principal', `${B}/certificates/${cert.id}`).expect(201)).body;
      await decide(r.id, 'approve', 'Verified');
      await drain();
      expect((await q<{ status: string; decision_note: string }>(`select status, decision_note from certificates where id = $1`, [cert.id]))[0]).toEqual({ status: 'approved', decision_note: 'Verified' });
      await post('principal', `/v1/documents/requests/${cert.id}/issue`).expect(200);
    });

    it('waives an application fee through the workflow', async () => {
      const year = (await q<{ academic_year_id: string }>(`select academic_year_id from sections where id = $1`, [t.section.id]))[0].academic_year_id;
      const cycle = (await q(`insert into admission_cycles (tenant_id, program_id, academic_year_id, name, seats, opens_on, closes_on) values ($1,$2,$3,'2027 intake',60,'2026-10-01','2026-12-31') returning id`, [t.tenantId, t.program.id, year]))[0].id;
      const app1 = (await q(`insert into applications (tenant_id, cycle_id, application_no, applicant_name, phone, guardian_name, guardian_phone, access_token_hash, fee_status) values ($1,$2,'APP-1','Ravi','9811111111','Mr Rao','9822222222','h','pending') returning id`, [t.tenantId, cycle]))[0].id;
      await define('admission_fee_waiver', 'Application fee waiver');
      await post('principal', `/v1/admissions/applications/${app1}/fee/waive`, { reason: 'Staff ward' }).expect(409);
      const r = (await post('principal', `${B}/admission-waivers/${app1}`, { reason: 'Staff ward' }).expect(201)).body;
      await decide(r.id, 'approve');
      await drain();
      expect((await q<{ fee_status: string }>(`select fee_status from applications where id = $1`, [app1]))[0].fee_status).toBe('waived');
      await post('principal', `${B}/admission-waivers/${app1}`, { reason: 'again' }).expect(400);
    });

    it('records a grievance resolution only after approval', async () => {
      const tk = (await post('student', '/v1/grievances', { category: 'fees', subject: 'Wrong fee charged', description: 'I was charged the hostel fee but I am a day scholar.' }).expect(201)).body;
      await define('grievance_resolution', 'Grievance resolution');
      const blocked = await post('principal', `/v1/grievances/${tk.id}/resolve`, { resolution: 'Refunded the hostel fee.' }).expect(409);
      expect(JSON.stringify(blocked.body)).toContain('WORKFLOW_REQUIRED');
      const r = (await post('principal', `${B}/grievances/${tk.id}/resolution`, { resolution: 'Refunded the hostel fee and corrected the record.' }).expect(201)).body;
      expect((await get('student', `/v1/grievances/${tk.id}`).expect(200)).body.status).not.toBe('resolved');
      await decide(r.id, 'approve');
      await drain();
      const done = (await get('student', `/v1/grievances/${tk.id}`).expect(200)).body;
      expect(done).toMatchObject({ status: 'resolved', resolution: 'Refunded the hostel fee and corrected the record.' });
      expect(done.timeline.map((e: { kind: string }) => e.kind)).toContain('resolved');
      // The proposal stays internal: the reporter never sees the draft.
      expect(done.timeline.map((e: { kind: string }) => e.kind)).not.toContain('resolution_proposed');
    });
  });
});
