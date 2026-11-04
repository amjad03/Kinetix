import type { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Mailer, type Mail } from '../src/analytics/mailer.js';
import { TextSender, WhatsAppSender, type TextMessage, type WhatsAppMessage } from '../src/comms/channels.js';
import { ChatSafetyService } from '../src/messages/chat-safety.service.js';
import * as s from '../src/db/schema.js';
import * as sc from '../src/db/schema-comms.js';
import { contactSuppressions } from '../src/db/schema-life.js';
import { hostels } from '../src/db/schema-lht.js';
import { messageDeliveries } from '../src/db/schema-pathways.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool } from './helpers.js';

/** SMS through a provider that answers with an id; it can be told to refuse the next sends. */
class FakeSms extends TextSender {
  readonly provider = 'msg91';
  readonly sent: TextMessage[] = [];
  refuse = 0;
  async send(m: TextMessage) {
    if (this.refuse > 0) {
      this.refuse--;
      throw new Error('Operator gateway down');
    }
    this.sent.push(m);
    return { providerMessageId: `sms-${this.sent.length}` };
  }
}
class FakeWhatsApp extends WhatsAppSender {
  readonly connected = true;
  override readonly provider = 'meta';
  readonly sent: WhatsAppMessage[] = [];
  async send(m: WhatsAppMessage) {
    this.sent.push(m);
    return { providerMessageId: `wamid.${this.sent.length}` };
  }
}

/**
 * The communication production pass, end to end: channel registration (DLT) and credits, the fallback chain with
 * consent, the do-not-contact list, quiet hours, caps and emergencies, providers' delivery reports, bounces and STOP
 * replies, the cost reports, notices to roles, hostels, routes and lists with translations and a poll, family chat
 * moderation, blocks, escalation and do-not-disturb, RSVPs, PTM minutes, and other roles and institutions refused.
 * Figures are worked out by hand in the comments.
 */
describe('communication pass', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: { ...s, ...sc } });
  const monday = nextMondayIst('10:30');
  const clock = new FixedClock(monday);
  const sms = new FakeSms();
  const wa = new FakeWhatsApp();
  const mails: Mail[] = [];
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const get = (who: string, path: string) => http().get(path).set(as(who));
  const post = (who: string, path: string, body: object = {}) => http().post(path).set(as(who)).send(body);
  const put = (who: string, path: string, body: object) => http().put(path).set(as(who)).send(body);
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const at = (iso: string) => (clock.at = new Date(iso));
  const hook = (provider: string, body: unknown, token = ids.smsToken) => http().post(`/v1/comms/webhooks/${provider}/${t.tenantId}/${token}`).send(body as object);

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const passwordHash = await argon2.hash('pw');
    const user = async (email: string, role: (typeof s.roleName.enumValues)[number], tenantId = t.tenantId) => {
      const [u] = await db.insert(s.users).values({ tenantId, fullName: email.split('@')[0], email, passwordHash }).returning();
      await db.insert(s.userRoles).values({ tenantId, userId: u.id, role });
      return u;
    };
    const hod = await user(`hod-${t.slug}@x.in`, 'hod');
    const acc = await user(`acc-${t.slug}@x.in`, 'accountant');
    ids.hod = hod.id;
    // Commerce teaches BCom (its subject), so a head of Commerce reaches the BCom classes; the teacher is in Commerce.
    const [dept] = await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Commerce', headUserId: hod.id }).returning();
    ids.dept = dept.id;
    await db.update(s.subjects).set({ departmentId: dept.id }).where(eq(s.subjects.id, t.subject.id));
    await db.insert(s.staffProfiles).values({ tenantId: t.tenantId, userId: t.teacher.id, employeeCode: 'T001', departmentId: dept.id });
    await db.insert(s.departmentStaff).values({ tenantId: t.tenantId, departmentId: dept.id, userId: t.teacher.id });
    // Phones: families and the student; the teacher too (for staff routes).
    await db.update(s.users).set({ phone: '9800000001' }).where(eq(s.users.id, t.guardian.id));
    await db.update(s.users).set({ phone: '+91 98000 00002' }).where(eq(s.users.id, t.guardian2.id));
    await db.update(s.users).set({ phone: '9800000003' }).where(eq(s.users.id, t.studentUser.id));
    app = await createApp(clock, (b) =>
      b
        .overrideProvider(TextSender)
        .useValue(sms)
        .overrideProvider(WhatsAppSender)
        .useValue(wa)
        .overrideProvider(Mailer)
        .useValue({ provider: 'ses', send: async (m: Mail) => (mails.push(m), { providerMessageId: `ses-${mails.length}` }) }),
    );
    for (const [k, email] of [['principal', t.principal.email], ['teacher', t.teacher.email], ['teacher2', t.teacher2.email], ['parent', t.guardian.email], ['parent2', t.guardian2.email], ['student', t.studentUser.email], ['hod', hod.email], ['accountant', acc.email]] as const) tokens[k] = await login(t.slug, email!);
    tokens.outsider = await login(other.slug, other.principal.email!);
  }, 90_000);

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('registers each channel (DLT entity id and header, prices, caps) and keeps prepaid credits', async () => {
    await get('teacher', '/v1/comms/channels').expect(403);
    await put('principal', '/v1/comms/channels/sms', { enabled: true, senderId: 'ab', dltEntityId: '', unitCostPaise: 25 }).expect(400);
    await put('principal', '/v1/comms/channels/sms', { enabled: true, senderId: 'SIMSBL', dltEntityId: '123', unitCostPaise: 25 }).expect(400);
    await put('principal', '/v1/comms/channels/sms', { enabled: true, senderId: 'simsbl', dltEntityId: '1201159000000000001', unitCostPaise: 25, lowBalanceUnits: 10 }).expect(200);
    await put('principal', '/v1/comms/channels/whatsapp', { enabled: true, senderId: '109876543210', unitCostPaise: 80 }).expect(200);
    await put('principal', '/v1/comms/channels/email', { enabled: true, senderId: 'not-an-email', unitCostPaise: 0 }).expect(400);
    await put('principal', '/v1/comms/channels/email', { enabled: true, senderId: 'office@college.in', unitCostPaise: 0 }).expect(200);
    await put('principal', '/v1/comms/channels/fax', { enabled: true, unitCostPaise: 0 }).expect(404);
    const channels = (await get('principal', '/v1/comms/channels').expect(200)).body;
    const smsRow = channels.find((c: { channel: string }) => c.channel === 'sms');
    expect(smsRow).toMatchObject({ senderId: 'SIMSBL', dltEntityId: '1201159000000000001', unitCostPaise: 25, provider: 'msg91' });
    ids.smsToken = smsRow.reportUrl.split('/').pop();
    expect(smsRow.reportUrl).toContain(`/v1/comms/webhooks/msg91/${t.tenantId}/`);
    ids.waToken = channels.find((c: { channel: string }) => c.channel === 'whatsapp').reportUrl.split('/').pop();
    ids.mailToken = channels.find((c: { channel: string }) => c.channel === 'email').reportUrl.split('/').pop();

    // Credits: 100 SMS for ₹25.00 and 50 WhatsApp messages for ₹40.00; the accounts office may top up, a teacher may not.
    await post('teacher', '/v1/comms/credits', { channel: 'sms', units: 100 }).expect(403);
    await post('accountant', '/v1/comms/credits', { channel: 'sms', units: -5 }).expect(400);
    expect((await post('accountant', '/v1/comms/credits', { channel: 'sms', units: 100, amountPaise: 2500, reference: 'INV-2026-114' }).expect(201)).body.balance).toBe(100);
    expect((await post('accountant', '/v1/comms/credits', { channel: 'whatsapp', units: 50, amountPaise: 4000, reference: 'INV-2026-115' }).expect(201)).body.balance).toBe(50);
    await post('accountant', '/v1/comms/credits', { channel: 'sms', kind: 'adjust', units: -1 }).expect(400); // a correction says why
    await post('accountant', '/v1/comms/credits', { channel: 'sms', kind: 'adjust', units: -500, note: 'Wrong top-up' }).expect(400); // below zero
    const credits = (await get('accountant', '/v1/comms/credits').expect(200)).body;
    expect(credits.find((c: { channel: string }) => c.channel === 'sms')).toMatchObject({ balance: 100, prepaid: true, unitCostPaise: 25, toppedUpPaise: 2500, low: false });
    expect(credits.find((c: { channel: string }) => c.channel === 'email')).toMatchObject({ prepaid: false });
  });

  it('keeps DLT and WhatsApp registration on the templates', async () => {
    const tpl = (b: object) => post('principal', '/v1/comms/templates', { key: 'notice', ...b });
    await tpl({ channel: 'sms', body: 'Notice from {{institution}}: {{title}}. {{body}}', dltTemplateId: '1207161234567890123' }).expect(400); // no header
    await tpl({ channel: 'sms', body: 'Notice from {{institution}}: {{title}}. {{body}}', dltTemplateId: 'ABC', dltHeader: 'SIMSBL' }).expect(400);
    ids.smsTpl = (await tpl({ channel: 'sms', body: 'Notice from {{institution}}: {{title}}. {{body}}', dltTemplateId: '1207161234567890123', dltHeader: 'simsbl', dltContentType: 'service_implicit' }).expect(201)).body.id;
    ids.waTpl = (await tpl({ channel: 'whatsapp', body: 'Notice: {{title}}. {{body}}', waTemplateName: 'school_notice', waLanguage: 'en' }).expect(201)).body.id;
    ids.mailTpl = (await tpl({ channel: 'email', subject: '{{title}}', body: 'Dear {{name}},\n{{body}}\n{{institution}}' }).expect(201)).body.id;
    await tpl({ channel: 'whatsapp', locale: 'kn', body: 'x {{title}}', waTemplateName: 'Bad Name' }).expect(400);
    const list = (await get('principal', '/v1/comms/templates').expect(200)).body;
    expect(list.find((x: { id: string }) => x.id === ids.smsTpl)).toMatchObject({ dltHeader: 'SIMSBL', dltContentType: 'service_implicit' });
  });

  it('works each delivery along WhatsApp, SMS and email with consent, charges credits and logs every step', async () => {
    // The father opts in to WhatsApp; the mother has not; the student opts out of SMS.
    expect((await put('parent', '/v1/comms/preferences', { channel: 'whatsapp', granted: true }).expect(200)).body.channels.find((c: { channel: string }) => c.channel === 'whatsapp')).toMatchObject({ granted: true, asked: true });
    await put('student', '/v1/comms/preferences', { channel: 'sms', granted: false }).expect(200);
    const aud = (await post('principal', '/v1/comms/audiences', { name: 'Families and student C', rule: { userIds: [t.guardian.id, t.guardian2.id, t.studentUser.id] } }).expect(201)).body;
    ids.audience = aud.id;
    const c = (await post('principal', '/v1/comms/campaigns', { title: 'Holiday on Friday', templateId: ids.waTpl, audienceId: aud.id, vars: { title: 'Holiday', body: 'College closed on Friday' }, fallback: ['sms', 'email'] }).expect(201)).body;
    ids.campaign = c.id;
    // Father: WhatsApp (80 paise). Mother: no WhatsApp opt-in, so SMS (1 part, 25 paise). Student: no WhatsApp, SMS refused, so email (free).
    expect(wa.sent).toEqual([{ to: '+919800000001', template: 'school_notice', language: 'en', params: ['Holiday', 'College closed on Friday'], phoneNumberId: '109876543210' }]);
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0]).toMatchObject({ to: '+919800000002', templateId: '1207161234567890123', header: 'SIMSBL', entityId: '1201159000000000001', contentType: 'service_implicit', text: `Notice from Tenant ${t.slug.slice(1).split('-')[0]}: Holiday. College closed on Friday` });
    expect(mails.map((m) => m.to[0])).toEqual([t.studentUser.email]);
    expect(c).toMatchObject({ status: 'sent', recipients: 3, sentCount: 3, failedCount: 0, costPaise: 105 });
    const credits = (await get('accountant', '/v1/comms/credits').expect(200)).body;
    expect(credits.find((x: { channel: string }) => x.channel === 'sms').balance).toBe(99);
    expect(credits.find((x: { channel: string }) => x.channel === 'whatsapp').balance).toBe(49);
    // The send log: 6 steps (1 + 2 + 3), the hold-backs with their reason.
    const log = (await get('principal', `/v1/comms/log?sourceId=${c.id}`).expect(200)).body;
    expect(log.total).toBe(6);
    expect(new Set(log.rows.map((r: { title: string; sentBy: string }) => `${r.title}|${r.sentBy}`))).toEqual(new Set([`Holiday on Friday|${t.principal.fullName}`]));
    const of = (name: string) => log.rows.filter((r: { recipient: string }) => r.recipient === name).map((r: { channel: string; status: string; error: string | null }) => `${r.channel}:${r.status}${r.error ? `:${r.error}` : ''}`).sort();
    expect(of(t.guardian.fullName)).toEqual(['whatsapp:accepted']);
    expect(of(t.guardian2.fullName)).toEqual(['sms:accepted', 'whatsapp:suppressed:Has not opted in to WhatsApp']);
    expect(of(t.studentUser.fullName)).toEqual(['email:accepted', 'sms:suppressed:Opted out of SMS', 'whatsapp:suppressed:Has not opted in to WhatsApp']);
    expect(log.rows.find((r: { channel: string; status: string }) => r.channel === 'sms' && r.status === 'accepted').address).toBe('+91******0002');
    const detail = (await get('principal', `/v1/comms/campaigns/${c.id}`).expect(200)).body;
    expect(detail.byChannel).toEqual(expect.arrayContaining([{ channel: 'whatsapp', status: 'sent', n: 1, cost: 80 }, { channel: 'sms', status: 'sent', n: 1, cost: 25 }, { channel: 'email', status: 'sent', n: 1, cost: 0 }]));
  });

  it('applies delivery reports once, falls back on a failed one, stops email to a bounced address and honours STOP', async () => {
    await hook('msg91', { data: [] }, 'f'.repeat(32)).expect(404);
    await http().post(`/v1/comms/webhooks/msg91/${other.tenantId}/${ids.smsToken}`).send({}).expect(404);
    await http().post(`/v1/comms/webhooks/fax/${t.tenantId}/${ids.smsToken}`).send({}).expect(404);
    const dlr = { data: [{ requestId: 'sms-1', report: [{ number: '919800000002', status: '1' }] }] };
    expect((await hook('msg91', dlr).expect(200)).body).toEqual({ received: 1, applied: 1, unmatched: 0 });
    expect((await hook('msg91', dlr).expect(200)).body).toEqual({ received: 1, applied: 0, unmatched: 0 }); // a repeat changes nothing
    // WhatsApp says the father's message failed: at the next run it goes by SMS (one more part, 25 paise).
    await http().get(`/v1/comms/webhooks/meta/${t.tenantId}/${ids.waToken}?hub.mode=subscribe&hub.challenge=4242`).expect(200).expect('content-type', /^text\/plain/).expect('4242');
    // The echo never reflects markup (it was text/html).
    await http().get(`/v1/comms/webhooks/meta/${t.tenantId}/${ids.waToken}?hub.challenge=${encodeURIComponent('<script>alert(1)</script>')}`).expect(400);
    expect((await hook('meta', { entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'failed', errors: [{ title: 'Message undeliverable' }] }] } }] }] }, ids.waToken).expect(200)).body.applied).toBe(1);
    await post('principal', '/v1/comms/run').expect(200);
    expect(sms.sent.map((m) => m.to)).toEqual(['+919800000002', '+919800000001']);
    const c = (await get('principal', `/v1/comms/campaigns/${ids.campaign}`).expect(200)).body;
    expect(c).toMatchObject({ status: 'sent', sentCount: 3, deliveredCount: 1, costPaise: 130 });
    // The student's email bounced (permanent): the address goes on the do-not-contact list.
    const sns = JSON.stringify({ Type: 'Notification', MessageId: 'sns-1', Message: JSON.stringify({ notificationType: 'Bounce', mail: { messageId: 'ses-1' }, bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: t.studentUser.email, diagnosticCode: '550 5.1.1 user unknown' }] } }) });
    await http().post(`/v1/comms/webhooks/ses/${t.tenantId}/${ids.mailToken}`).set('content-type', 'text/plain').send(sns).expect(200);
    // text/plain is read by this webhook alone (SNS's 256 KB cap); no other route gets a parsed text body or the cap.
    await http().post(`/v1/comms/webhooks/ses/${t.tenantId}/${ids.mailToken}`).set('content-type', 'text/plain').send('x'.repeat(300 * 1024)).expect(413);
    await http().post('/v1/comms/run').set('content-type', 'text/plain').send('x'.repeat(300 * 1024)).expect(401);
    const [sup] = await db.select().from(contactSuppressions).where(and(eq(contactSuppressions.tenantId, t.tenantId), eq(contactSuppressions.channel, 'email')));
    expect(sup).toMatchObject({ address: t.studentUser.email!.toLowerCase(), reason: 'bounced', userId: t.studentUser.id });
    expect((await get('principal', `/v1/comms/log?sourceId=${ids.campaign}&status=bounced`).expect(200)).body.total).toBe(1);
    // The mother replies STOP: her SMS choice is now "no".
    await hook('msg91', { data: [{ mobile: '919800000002', message: 'STOP', id: 'in-1' }] }).expect(200);
    const prefs = (await get('parent2', '/v1/comms/preferences').expect(200)).body.channels;
    expect(prefs.find((x: { channel: string }) => x.channel === 'sms')).toMatchObject({ granted: false, asked: true });
  });

  it('waits out quiet hours and the hourly cap, runs short of credits into the next channel, and lets an emergency through', async () => {
    await db.insert(s.moduleSettings).values({ tenantId: t.tenantId, module: 'communication', settings: { rules: { quietHoursOn: true, quietHoursStart: 21, quietHoursEnd: 7 } } });
    const night = new Date(monday.getTime() + 11.5 * 3600_000); // Monday 22:00 IST
    at(night.toISOString());
    const aud = (await post('principal', '/v1/comms/audiences', { name: 'Father', rule: { userIds: [t.guardian.id] } }).expect(201)).body;
    const c = (await post('principal', '/v1/comms/campaigns', { title: 'Bus timing', templateId: ids.smsTpl, audienceId: aud.id, vars: { title: 'Bus', body: 'Route 2 leaves at 7:10' } }).expect(201)).body;
    const [d] = await db.select().from(messageDeliveries).where(eq(messageDeliveries.campaignId, c.id));
    expect(d).toMatchObject({ status: 'queued', deferredReason: 'quiet_hours' });
    expect(d.nextAttemptAt?.toISOString()).toBe(new Date(monday.getTime() + 20.5 * 3600_000).toISOString()); // Tuesday 07:00 IST
    expect(sms.sent).toHaveLength(2);
    // An emergency goes now, to the mother too although she said STOP (DPDP Act s.7: safety); the head of department may not send one.
    const both = (await post('principal', '/v1/comms/audiences', { name: 'Both families', rule: { userIds: [t.guardian.id, t.guardian2.id] } }).expect(201)).body;
    await post('hod', '/v1/comms/campaigns', { title: 'Flood', templateId: ids.smsTpl, audienceId: both.id, emergency: true }).expect(403);
    const e = (await post('principal', '/v1/comms/campaigns', { title: 'Flood alert', templateId: ids.smsTpl, audienceId: both.id, vars: { title: 'Flood alert', body: 'Stay home tomorrow' }, emergency: true }).expect(201)).body;
    expect(e).toMatchObject({ status: 'sent', sentCount: 2, emergency: true });
    expect(sms.sent).toHaveLength(4);
    // Tuesday 07:05: the bus message goes.
    at(new Date(monday.getTime() + 20.5 * 3600_000 + 5 * 60_000).toISOString());
    await post('principal', '/v1/comms/run').expect(200);
    expect(sms.sent).toHaveLength(5);
    // At most one SMS an hour: the next one waits an hour after the first in the window.
    await put('principal', '/v1/comms/channels/sms', { enabled: true, senderId: 'SIMSBL', dltEntityId: '1201159000000000001', unitCostPaise: 25, hourlyLimit: 1 }).expect(200);
    const capped = (await post('principal', '/v1/comms/campaigns', { title: 'Second', templateId: ids.smsTpl, audienceId: aud.id, vars: { title: 'Again', body: 'x' } }).expect(201)).body;
    expect(capped.status).toBe('sending');
    expect(capped.waiting).toEqual([expect.objectContaining({ reason: 'hourly_limit', n: 1 })]);
    await put('principal', '/v1/comms/channels/sms', { enabled: true, senderId: 'SIMSBL', dltEntityId: '1201159000000000001', unitCostPaise: 25, hourlyLimit: 0 }).expect(200);
    // Out of SMS credits: the reminder goes by email instead. Spent so far: 1 + 1 + 2 (emergency) + 1 = 5 of 100.
    expect((await get('accountant', '/v1/comms/credits').expect(200)).body.find((x: { channel: string }) => x.channel === 'sms').balance).toBe(95);
    await post('accountant', '/v1/comms/credits', { channel: 'sms', kind: 'adjust', units: -95, note: 'Credits moved to the campus account' }).expect(201);
    const broke = (await post('principal', '/v1/comms/campaigns', { title: 'Fees', templateId: ids.smsTpl, audienceId: aud.id, vars: { title: 'Fees', body: 'Due on 10th' }, fallback: ['email'] }).expect(201)).body;
    expect(broke).toMatchObject({ status: 'sent', sentCount: 1 });
    expect(mails.at(-1)?.to).toEqual([t.guardian.email]);
    const steps = (await get('principal', `/v1/comms/log?sourceId=${broke.id}`).expect(200)).body.rows.map((r: { channel: string; status: string; error: string | null }) => `${r.channel}:${r.status}:${r.error ?? ''}`).sort();
    expect(steps).toEqual(['email:accepted:', 'sms:failed:Not enough SMS credits (0 left, 1 needed)']);
    await post('accountant', '/v1/comms/credits', { channel: 'sms', units: 200, amountPaise: 5000, reference: 'INV-2026-131' }).expect(201);
    await db.delete(s.moduleSettings).where(and(eq(s.moduleSettings.tenantId, t.tenantId), eq(s.moduleSettings.module, 'communication')));
    at(new Date(monday.getTime() + 24 * 3600_000).toISOString()); // Tuesday 10:30 IST
  });

  it('reports delivery, read and cost by channel and department, for the right people only', async () => {
    const r = (await get('accountant', '/v1/comms/reports/summary').expect(200)).body;
    const ch = (c: string) => r.byChannel.find((x: { channel: string }) => x.channel === c);
    // SMS spends: mother 25, father (fallback) 25, emergency 2 × 25, bus 25, the capped one went at its time? (no: it waits) = 125.
    expect(ch('sms').costPaise).toBe(125);
    expect(ch('whatsapp')).toMatchObject({ costPaise: 80, failed: 1 });
    expect(ch('email').costPaise).toBe(0);
    expect(ch('sms').delivered).toBe(1);
    // Everything here was sent by the principal, who has no department.
    expect(r.byDepartment).toEqual([expect.objectContaining({ department: 'Institution office', costPaise: 205 })]);
    const ledger = (await get('accountant', '/v1/comms/credits/ledger?kind=spend').expect(200)).body;
    expect(ledger.rows.reduce((n: number, x: { amountPaise: number }) => n - Number(x.amountPaise), 0)).toBe(205);
    await get('teacher', '/v1/comms/reports/summary').expect(403);
    expect((await get('outsider', '/v1/comms/reports/summary').expect(200)).body.total).toEqual({ sent: 0, delivered: 0, failed: 0, costPaise: 0 });
    expect((await get('outsider', '/v1/comms/log').expect(200)).body.total).toBe(0);
    await get('outsider', `/v1/comms/campaigns/${ids.campaign}`).expect(404);
    await get('hod', `/v1/comms/campaigns/${ids.campaign}`).expect(404); // not their department's
    expect((await get('hod', '/v1/comms/log').expect(200)).body.total).toBe(0);
    // The send log as a kit list: filters and export; it cannot be deleted.
    // Five SMS went out; the mother's first is "delivered" by its report, so four are still only "sent".
    const kit = (await get('principal', '/v1/records/comm-send-log?f.channel=sms&f.status=accepted').expect(200)).body;
    expect(kit.total).toBe(4);
    const first = kit.rows[0].id;
    expect((await http().delete(`/v1/records/comm-send-log/${first}`).set(as('principal'))).status).toBeGreaterThanOrEqual(400);
    const csv = await get('principal', '/v1/records/comm-send-log/export?format=csv&f.channel=sms').expect(200);
    expect(csv.text.split('\n')[0]).toContain('Cost (₹)');
  });

  it('keeps the consent register: people choose in the app, the office records paper forms, all of it kept', async () => {
    const reg = (await get('principal', '/v1/comms/preferences/register?channel=sms&granted=false').expect(200)).body;
    expect(reg.rows.map((x: { fullName: string; source: string }) => `${x.fullName}:${x.source}`).sort()).toEqual([`${t.guardian2.fullName}:reply_stop`, `${t.studentUser.fullName}:app`].sort());
    await post('principal', '/v1/comms/preferences/record', { userId: t.guardian2.id, channel: 'sms', granted: true, note: 'x' }).expect(400);
    await post('principal', '/v1/comms/preferences/record', { userId: t.guardian2.id, channel: 'sms', granted: true, note: 'Signed the consent form at the office' }).expect(201);
    expect((await get('parent2', '/v1/comms/preferences').expect(200)).body.channels.find((x: { channel: string }) => x.channel === 'sms').granted).toBe(true);
    await get('teacher', '/v1/comms/preferences/register').expect(403);
    await post('teacher', '/v1/comms/preferences/record', { userId: t.guardian2.id, channel: 'sms', granted: false, note: 'Asked by phone' }).expect(403);
    const history = (await get('principal', `/v1/records/comm-channel-prefs?q=${encodeURIComponent(t.guardian2.fullName)}`).expect(200)).body;
    expect(history.total).toBe(2); // STOP, then the paper form
  });

  it('sends notices to whole roles, hostels, bus routes and saved lists; a head of department only to their own', async () => {
    // Student A (the father's child) lives in a hostel; student B (the mother's) rides route 2.
    const [hostel] = await db.insert(hostels).values({ tenantId: t.tenantId, name: 'Kaveri Hostel', wardenUserId: t.teacher2.id }).returning();
    const [block] = await db.insert(s.hostelBlocks).values({ tenantId: t.tenantId, name: 'A', hostelId: hostel.id }).returning();
    const [room] = await db.insert(s.hostelRooms).values({ tenantId: t.tenantId, blockId: block.id, number: '101' }).returning();
    const [bed] = await db.insert(s.hostelBeds).values({ tenantId: t.tenantId, roomId: room.id, label: '1' }).returning();
    await db.insert(s.hostelAllotments).values({ tenantId: t.tenantId, studentId: t.students[0].id, bedId: bed.id, startsOn: '2026-08-01', createdBy: t.principal.id });
    const [route] = await db.insert(s.transportRoutes).values({ tenantId: t.tenantId, name: 'Route 2' }).returning();
    const [stop] = await db.insert(s.transportStops).values({ tenantId: t.tenantId, routeId: route.id, name: 'Nagasandra', seq: 1, lat: 13.04, lng: 77.5 }).returning();
    await db.insert(s.transportAssignments).values({ tenantId: t.tenantId, studentId: t.students[1].id, routeId: route.id, stopId: stop.id, startsOn: '2026-08-01' });
    const preview = async (who: string, audience: object, channels = ['parent', 'student', 'teacher']) => (await post(who, '/v1/announcements/preview', { channels, audience }).expect(200)).body;
    expect(await preview('principal', { scope: 'roles', roles: ['guardian'] })).toMatchObject({ parent: 2, student: 0, teacher: 0 });
    expect(await preview('principal', { scope: 'roles', roles: ['teacher', 'hod'] })).toMatchObject({ teacher: 3, parent: 0 });
    expect(await preview('principal', { scope: 'roles', roles: ['student'] })).toMatchObject({ student: 1 });
    expect(await preview('principal', { scope: 'hostels', hostelIds: [hostel.id] })).toMatchObject({ parent: 1, teacher: 1 }); // the father and the warden
    expect(await preview('principal', { scope: 'routes', routeIds: [route.id] })).toMatchObject({ parent: 1, teacher: 0 }); // the mother
    expect(await preview('principal', { scope: 'lists', listIds: [ids.audience] })).toMatchObject({ parent: 2, student: 1 });
    // The head of Commerce: their department and its classes, not the whole institution, a role or a hostel.
    await post('hod', '/v1/announcements/preview', { channels: ['parent'], audience: { scope: 'all' } }).expect(403);
    await post('hod', '/v1/announcements/preview', { channels: ['parent'], audience: { scope: 'roles', roles: ['guardian'] } }).expect(403);
    await post('hod', '/v1/announcements/preview', { channels: ['parent'], audience: { scope: 'lists', listIds: [ids.audience] } }).expect(403); // not their list
    expect(await preview('hod', { scope: 'departments', departmentIds: [ids.dept] }, ['parent', 'teacher'])).toMatchObject({ parent: 2, teacher: 2 });
    const mine = (await post('hod', '/v1/announcements', { title: 'Commerce seminar', body: 'Seminar on GST on Thursday.', channels: ['parent'], audience: { scope: 'sections', sectionIds: [t.section.id] } }).expect(201)).body;
    expect(mine.departmentId).toBe(ids.dept);
    const principals = (await post('principal', '/v1/announcements', { title: 'Office timing', body: 'The office closes at 4 pm.', channels: ['parent'], audience: { scope: 'all' } }).expect(201)).body;
    const seen = (await get('hod', '/v1/announcements').expect(200)).body.map((a: { id: string }) => a.id);
    expect(seen).toContain(mine.id);
    expect(seen).not.toContain(principals.id);
    await get('hod', `/v1/announcements/${principals.id}`).expect(404);
    await get('hod', `/v1/announcements/${principals.id}/recipients`).expect(404);
  });

  it('gives each reader the notice in their language, runs its poll and sends it by SMS too', async () => {
    await db.update(s.users).set({ preferredLanguage: 'kn' }).where(eq(s.users.id, t.guardian.id));
    const before = sms.sent.length;
    const n = (
      await post('principal', '/v1/announcements', {
        title: 'Annual day',
        body: 'Annual day is on **Saturday** at 10 am.',
        priority: 'important',
        channels: ['parent'],
        audience: { scope: 'sections', sectionIds: [t.section.id] },
        translations: { kn: { title: 'ವಾರ್ಷಿಕೋತ್ಸವ', body: 'ಶನಿವಾರ ಬೆಳಿಗ್ಗೆ 10ಕ್ಕೆ ವಾರ್ಷಿಕೋತ್ಸವ.' } },
        poll: { question: 'Will you attend?', options: ['Yes', 'No', 'Not sure'] },
        external: { templateId: ids.smsTpl, fallback: ['email'] },
      }).expect(201)
    ).body;
    await post('principal', '/v1/announcements', { title: 'x', body: 'y', channels: ['parent'], audience: { scope: 'all' }, poll: { question: 'Same?', options: ['A', 'a'] } }).expect(400);
    const mineKn = (await get('parent', `/v1/announcements/inbox/${n.id}`).expect(200)).body;
    expect(mineKn).toMatchObject({ title: 'ವಾರ್ಷಿಕೋತ್ಸವ', language: 'kn', pinned: true, poll: { question: 'Will you attend?', myVote: null, results: null } });
    expect((await get('parent2', `/v1/announcements/inbox/${n.id}`).expect(200)).body).toMatchObject({ title: 'Annual day', language: 'en' });
    await post('parent', `/v1/announcements/inbox/${n.id}/vote`, { option: 3 }).expect(400);
    expect((await post('parent', `/v1/announcements/inbox/${n.id}/vote`, { option: 0 }).expect(200)).body.poll).toMatchObject({ myVote: 0, results: [{ option: 'Yes', votes: 1, pct: 100 }, { option: 'No', votes: 0, pct: 0 }, { option: 'Not sure', votes: 0, pct: 0 }] });
    await post('parent2', `/v1/announcements/inbox/${n.id}/vote`, { option: 1 }).expect(200);
    await post('parent', `/v1/announcements/inbox/${n.id}/vote`, { option: 2 }).expect(200); // changed their mind
    await post('outsider', `/v1/announcements/inbox/${n.id}/vote`, { option: 0 }).expect(404);
    const d = (await get('principal', `/v1/announcements/${n.id}`).expect(200)).body;
    // Two families got it, both answered: No 1, Not sure 1.
    expect(d.poll).toMatchObject({ voted: 2, votedPct: 100, results: [{ votes: 0 }, { votes: 1, pct: 50 }, { votes: 1, pct: 50 }] });
    // By SMS too: both families (the mother's SMS consent is back), the text filled from the notice.
    expect(sms.sent.length - before).toBe(2);
    expect(sms.sent.at(-1)?.text).toContain('Annual day. Annual day is on Saturday at 10 am.');
    expect(d.external.campaign).toMatchObject({ recipients: 2, sent: 2, costPaise: 50 });
    // A poll that has closed takes no answers.
    const closing = (await post('principal', '/v1/announcements', { title: 'Bus survey', body: 'Do you need the bus?', channels: ['parent'], audience: { scope: 'sections', sectionIds: [t.section.id] }, poll: { question: 'Bus?', options: ['Yes', 'No'], closesAt: new Date(clock.now().getTime() + 3600_000).toISOString() } }).expect(201)).body;
    at(new Date(clock.now().getTime() + 2 * 3600_000).toISOString());
    await post('parent', `/v1/announcements/inbox/${closing.id}/vote`, { option: 0 }).expect(409);
  });

  it('lets only leaders send an emergency, which reaches everyone through the institution switches and is pinned', async () => {
    await db.update(s.tenants).set({ settings: { notifications: { off: ['announcement'], pushOff: ['announcement'] } } }).where(eq(s.tenants.id, t.tenantId));
    await post('hod', '/v1/announcements', { title: 'Flood', body: 'Go home', priority: 'emergency', channels: ['parent'], audience: { scope: 'sections', sectionIds: [t.section.id] } }).expect(403);
    await post('principal', '/v1/announcements', { title: 'Flood', body: 'Go home', priority: 'emergency', channels: ['parent'], audience: { scope: 'all' }, sendAt: new Date(clock.now().getTime() + 3600_000).toISOString() }).expect(400);
    const normal = (await post('principal', '/v1/announcements', { title: 'Sports day', body: 'Wear white.', priority: 'important', channels: ['parent'], audience: { scope: 'all' } }).expect(201)).body;
    const e = (await post('principal', '/v1/announcements', { title: 'Heavy rain: college closed', body: 'Stay at home today.', priority: 'emergency', channels: ['boards', 'parent', 'student', 'teacher'], audience: { scope: 'all' } }).expect(201)).body;
    expect(e).toMatchObject({ priority: 'emergency', requiresAck: true, status: 'sent' });
    const notes = await db.select().from(s.notifications).where(eq(s.notifications.userId, t.guardian.id));
    expect(notes.find((x) => x.dedupeKey === `announcement:${normal.id}`)).toBeUndefined(); // the institution turned these off
    expect(notes.find((x) => x.dedupeKey === `announcement:${e.id}`)).toMatchObject({ data: { announcementId: e.id, urgent: '1' } });
    const inbox = (await get('parent', '/v1/announcements/inbox?app=parent').expect(200)).body;
    expect(inbox.items[0]).toMatchObject({ id: e.id, emergency: true, pinned: true, canAcknowledge: true });
    const [b] = await db.select().from(s.broadcasts).where(eq(s.broadcasts.id, (await db.select().from(s.announcements).where(eq(s.announcements.id, e.id)))[0].broadcastId!));
    expect(b.priority).toBe('emergency');
    await db.update(s.tenants).set({ settings: {} }).where(eq(s.tenants.id, t.tenantId));
  });

  it('moderates family chat: the filter flags, either side reports, leaders hide, warn or block', async () => {
    const c = (await post('parent', '/v1/conversations', { studentId: t.students[0].id, withUserId: t.teacher.id }).expect(201)).body;
    ids.conv = c.id;
    const m1 = (await post('parent', `/v1/conversations/${c.id}/messages`, { body: 'You are an idiot for giving so much homework' }).expect(201)).body;
    expect(m1.flagged).toBe(true);
    const ok = (await post('parent', `/v1/conversations/${c.id}/messages`, { body: 'Sorry. Can she get the notes?' }).expect(201)).body;
    expect(ok.flagged).toBe(false);
    let queue = (await get('principal', '/v1/conversations/moderation').expect(200)).body;
    expect(queue.rows).toEqual([expect.objectContaining({ reason: 'filter', note: 'abusive_language', reporter: null, message: expect.objectContaining({ id: m1.id }) })]);
    await post('parent', `/v1/conversations/${c.id}/messages/${m1.id}/report`, { reason: 'abusive' }).expect(400); // their own
    await post('teacher', `/v1/conversations/${c.id}/messages/${m1.id}/report`, { reason: 'abusive', note: 'Rude' }).expect(201);
    await post('teacher', `/v1/conversations/${c.id}/messages/${m1.id}/report`, { reason: 'abusive' }).expect(409);
    await post('teacher2', `/v1/conversations/${c.id}/messages/${m1.id}/report`, { reason: 'abusive' }).expect(404); // not in the thread
    await get('teacher', '/v1/conversations/moderation').expect(403);
    queue = (await get('principal', '/v1/conversations/moderation').expect(200)).body;
    expect(queue.total).toBe(2);
    expect(queue.rows.map((r: { reporter: string | null }) => r.reporter).sort()).toEqual([t.teacher.fullName, null].sort());
    await post('principal', `/v1/conversations/moderation/${queue.rows[0].id}`, { action: 'hide' }).expect(400); // say why
    expect((await post('principal', `/v1/conversations/moderation/${queue.rows[0].id}`, { action: 'hide', note: 'Abusive language' }).expect(200)).body).toMatchObject({ action: 'hide', reports: 2 });
    expect((await get('principal', '/v1/conversations/moderation').expect(200)).body.total).toBe(0);
    const familyView = (await get('parent', `/v1/conversations/${c.id}/messages`).expect(200)).body.messages;
    expect(familyView.find((m: { id: string }) => m.id === m1.id)).toMatchObject({ body: 'This message was removed by the institution.', hidden: true });
    const leaderView = (await get('principal', `/v1/conversations/${c.id}/messages`).expect(200)).body.messages;
    expect(leaderView.find((m: { id: string }) => m.id === m1.id)).toMatchObject({ body: 'You are an idiot for giving so much homework', hidden: true, flag: 'abusive_language' });
    // A teacher giving a student a private number is flagged for safeguarding.
    const sc2 = (await post('student', '/v1/conversations', { studentId: t.students[2].id, withUserId: t.teacher.id }).expect(201)).body;
    expect((await post('teacher', `/v1/conversations/${sc2.id}/messages`, { body: 'Call me on 98450 12345 after class' }).expect(201)).body.flagged).toBe(true);
    // The teacher pauses the family; the office and leaders can lift it.
    const blk = (await post('teacher', `/v1/conversations/${c.id}/block`, { reason: 'Repeated abuse', days: 7 }).expect(201)).body;
    await post('parent', `/v1/conversations/${c.id}/messages`, { body: 'Hello?' }).expect(403);
    expect((await get('parent', `/v1/conversations/${c.id}/messages`).expect(200)).body).toMatchObject({ canWrite: false, blocked: { reason: 'Repeated abuse' } });
    expect((await get('teacher', '/v1/conversations/blocks').expect(200)).body.map((b: { id: string }) => b.id)).toEqual([blk.id]);
    await post('parent', `/v1/conversations/blocks/${blk.id}/lift`).expect(404);
    await post('teacher', `/v1/conversations/blocks/${blk.id}/lift`).expect(200);
    await post('parent', `/v1/conversations/${c.id}/messages`, { body: 'Thank you for the notes.' }).expect(201);
    // A reply by SMS from the father lands in this conversation.
    await hook('msg91', { data: [{ mobile: '919800000001', message: 'Will she get the IA marks soon?', id: 'in-2' }] }).expect(200);
    expect((await get('teacher', `/v1/conversations/${c.id}/messages`).expect(200)).body.messages.at(-1)).toMatchObject({ body: 'Will she get the IA marks soon? (by SMS)', side: 'family' });
  });

  it('takes a conversation to the head of department, by the family or after 48 hours unanswered', async () => {
    await post('parent', `/v1/conversations/${ids.conv}/escalate`, { reason: 'x' }).expect(400);
    await post('teacher2', `/v1/conversations/${ids.conv}/escalate`, { reason: 'No reply about the notes' }).expect(404);
    const s1 = (await post('parent', `/v1/conversations/${ids.conv}/escalate`, { reason: 'No reply about the notes' }).expect(200)).body;
    expect(s1.escalatedTo).toEqual({ id: ids.hod, fullName: expect.any(String) });
    await post('parent', `/v1/conversations/${ids.conv}/escalate`, { reason: 'Again please' }).expect(409);
    // The head reads and answers.
    const hv = (await get('hod', `/v1/conversations/${ids.conv}/messages`).expect(200)).body;
    expect(hv.messages.at(-1)).toMatchObject({ kind: 'system', body: expect.stringContaining('Escalated to') });
    await post('hod', `/v1/conversations/${ids.conv}/messages`, { body: 'I will make sure the notes reach you tomorrow.' }).expect(201);
    expect((await get('hod', '/v1/conversations').expect(200)).body.map((x: { id: string }) => x.id)).toContain(ids.conv);
    // The mother writes to teacher 2, the class teacher (no department): after 48 hours the principal gets it.
    await db.update(s.sections).set({ classTeacherId: t.teacher2.id }).where(eq(s.sections.id, t.section.id));
    const c2 = (await post('parent2', '/v1/conversations', { studentId: t.students[1].id, withUserId: t.teacher2.id }).expect(201)).body;
    const q = (await post('parent2', `/v1/conversations/${c2.id}/messages`, { body: 'Is there class on Saturday?' }).expect(201)).body;
    await db.update(s.messages).set({ createdAt: clock.now() }).where(eq(s.messages.id, q.id)); // written "now" on the test clock
    const safety = app.get(ChatSafetyService);
    at(new Date(clock.now().getTime() + 47 * 3600_000).toISOString());
    expect(await safety.escalateOverdue(t.tenantId)).toBe(0);
    at(new Date(clock.now().getTime() + 2 * 3600_000).toISOString());
    expect(await safety.escalateOverdue(t.tenantId)).toBe(1);
    const [row] = await db.select().from(s.conversations).where(eq(s.conversations.id, c2.id));
    expect(row).toMatchObject({ escalatedTo: t.principal.id, escalationReason: 'No reply for 48 hours' });
    expect(await safety.escalateOverdue(t.tenantId)).toBe(0); // once
  });

  it('tells families when a teacher is on do-not-disturb, and keeps chat only as long as the rule says', async () => {
    await put('parent', '/v1/conversations/me/availability', { dndUntil: null, hours: null }).expect(403);
    const until = new Date(clock.now().getTime() + 3 * 3600_000).toISOString();
    expect((await put('teacher', '/v1/conversations/me/availability', { dndUntil: until, hours: null, awayNote: 'On exam duty' }).expect(200)).body).toMatchObject({ active: true, awayNote: 'On exam duty' });
    const sent = (await post('parent', `/v1/conversations/${ids.conv}/messages`, { body: 'Thank you sir.' }).expect(201)).body;
    expect(sent.away).toMatchObject({ until, note: 'On exam duty' });
    await put('teacher', '/v1/conversations/me/availability', { dndUntil: new Date(clock.now().getTime() + 40 * 86_400_000).toISOString(), hours: null }).expect(400);
    await put('teacher', '/v1/conversations/me/availability', { dndUntil: null, hours: { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] } }).expect(200);
    // Retention: a 30-day rule would clear nothing yet (dry run) and keeps messages under an open report.
    await put('principal', '/v1/retention/rules', { target: 'family_chat', keepDays: 30, action: 'delete' }).expect(200);
    const dry = (await post('principal', '/v1/retention/run?dryRun=true').expect(200)).body;
    expect(dry.find((o: { target: string }) => o.target === 'family_chat').affected).toBe(0);
  });

  it('collects RSVPs with places and guests until replies close, and shows the organiser who is coming', async () => {
    const day = new Date(clock.now().getTime() + 10 * 86_400_000).toISOString().slice(0, 10);
    const by = new Date(clock.now().getTime() + 5 * 86_400_000).toISOString().slice(0, 10);
    await post('principal', '/v1/admin/calendar', { kind: 'event', title: 'Annual day', startsOn: day, endsOn: day, rsvp: true, rsvpBy: new Date(clock.now().getTime() + 20 * 86_400_000).toISOString().slice(0, 10) }).expect(400);
    const ev = (await post('principal', '/v1/admin/calendar', { kind: 'event', title: 'Annual day', startsOn: day, endsOn: day, rsvp: true, rsvpBy: by, capacity: 3, venue: 'Main hall' }).expect(201)).body;
    const plain = (await post('principal', '/v1/admin/calendar', { kind: 'event', title: 'Founders day', startsOn: day, endsOn: day }).expect(201)).body;
    const cal = (await get('parent', `/v1/calendar?from=${day}&to=${day}`).expect(200)).body.events;
    expect(cal.find((e: { id: string }) => e.id === ev.id)).toMatchObject({ rsvp: true, capacity: 3, venue: 'Main hall', myRsvp: null, replies: { going: 0, places: 0 } });
    expect((await post('parent', `/v1/calendar/${ev.id}/rsvp`, { response: 'going', guests: 1 }).expect(200)).body).toMatchObject({ going: 1, places: 2 });
    await post('parent2', `/v1/calendar/${ev.id}/rsvp`, { response: 'going', guests: 1 }).expect(409); // 2 + 2 > 3
    await post('parent2', `/v1/calendar/${ev.id}/rsvp`, { response: 'going' }).expect(200);
    await post('student', `/v1/calendar/${ev.id}/rsvp`, { response: 'maybe' }).expect(200);
    await post('parent', `/v1/calendar/${ev.id}/rsvp`, { response: 'going', guests: 1 }).expect(200); // their own places are not counted twice
    await post('parent', `/v1/calendar/${plain.id}/rsvp`, { response: 'going' }).expect(400);
    await post('outsider', `/v1/calendar/${ev.id}/rsvp`, { response: 'going' }).expect(404);
    const list = (await get('principal', `/v1/admin/calendar/${ev.id}/rsvps`).expect(200)).body;
    expect(list.totals).toEqual({ going: 2, places: 3, maybe: 1, notGoing: 0 });
    expect(list.rows).toHaveLength(3);
    await get('parent', `/v1/admin/calendar/${ev.id}/rsvps`).expect(403);
    at(new Date(clock.now().getTime() + 6 * 86_400_000).toISOString());
    await post('parent', `/v1/calendar/${ev.id}/rsvp`, { response: 'not_going' }).expect(409);
  });

  it('records PTM minutes after the meeting, tells the family, and reports the meeting', async () => {
    const today = new Date(clock.now().getTime() + 5.5 * 3600_000).toISOString().slice(0, 10); // IST date
    const ev = (await post('principal', '/v1/ptm/events', { title: 'Mid-term PTM', eventDate: today, location: 'Hall' }).expect(201)).body;
    await post('teacher', `/v1/ptm/events/${ev.id}/slots`, { from: '08:00', to: '09:00', durationMinutes: 30 }).expect(201);
    const slots = (await get('parent', `/v1/ptm/events/${ev.id}/slots?studentId=${t.students[0].id}`).expect(200)).body;
    const slotList = slots.slots ?? slots;
    const first = slotList[0];
    await post('parent', `/v1/ptm/slots/${first.id}/book`, { studentId: t.students[0].id }).expect(201);
    const second = slotList[1];
    await post('parent2', `/v1/ptm/slots/${second.id}/book`, { studentId: t.students[1].id }).expect(201);
    // Before the meeting: no minutes yet.
    const startOf = new Date(first.startsAt).getTime();
    const keep = clock.now();
    at(new Date(startOf - 3600_000).toISOString());
    await post('teacher', `/v1/ptm/slots/${first.id}/minutes`, { attendance: 'attended', minutes: 'Discussed attendance' }).expect(409);
    at(new Date(startOf + 3 * 3600_000).toISOString());
    await post('teacher', `/v1/ptm/slots/${first.id}/minutes`, { attendance: 'attended', minutes: 'ok' }).expect(400); // write what was discussed
    await post('teacher2', `/v1/ptm/slots/${first.id}/minutes`, { attendance: 'attended', minutes: 'Discussed attendance' }).expect(404);
    await post('teacher', `/v1/ptm/slots/${first.id}/minutes`, { attendance: 'attended', minutes: 'Discussed attendance and the IA 1 marks.', actionPoints: 'Extra class on Saturdays; father checks the diary daily.' }).expect(200);
    await post('teacher', `/v1/ptm/slots/${second.id}/minutes`, { attendance: 'no_show' }).expect(200);
    const mine = (await get('parent', `/v1/ptm/my-bookings?eventId=${ev.id}`).expect(200)).body;
    expect(mine[0]).toMatchObject({ attendance: 'attended', actionPoints: 'Extra class on Saturdays; father checks the diary daily.' });
    const note = await db.select().from(s.notifications).where(and(eq(s.notifications.userId, t.guardian.id), eq(s.notifications.dedupeKey, `ptm:minutes:${first.id}`)));
    expect(note).toHaveLength(1);
    const rep = (await get('principal', `/v1/ptm/events/${ev.id}/report`).expect(200)).body;
    expect(rep.total).toEqual({ slots: 2, booked: 2, attended: 1, noShow: 1, minutes: 1 });
    await get('teacher', `/v1/ptm/events/${ev.id}/report`).expect(403);
    clock.at = keep;
  });

  it('refuses other roles and other institutions everywhere', async () => {
    for (const [method, path] of [
      ['get', '/v1/comms/credits'],
      ['get', '/v1/comms/credits/ledger'],
      ['get', '/v1/comms/log'],
      ['get', '/v1/comms/preferences/register'],
      ['get', '/v1/conversations/moderation'],
      ['get', '/v1/records/comm-credit-ledger'],
      ['get', '/v1/records/comm-channel-prefs'],
    ] as const) {
      expect((await http()[method](path).set(as('teacher'))).status).toBe(403);
      expect((await http()[method](path).set(as('parent'))).status).toBe(403);
    }
    expect((await get('outsider', '/v1/comms/credits').expect(200)).body.every((c: { balance: number }) => c.balance === 0)).toBe(true);
    expect((await get('outsider', '/v1/conversations/moderation').expect(200)).body.total).toBe(0);
    expect((await get('outsider', '/v1/comms/preferences/register').expect(200)).body.total).toBe(0);
    expect((await get('outsider', '/v1/records/comm-send-log').expect(200)).body.total).toBe(0);
    await post('outsider', `/v1/conversations/${ids.conv}/escalate`, { reason: 'Looking around' }).expect(404);
    await post('outsider', `/v1/conversations/blocks/${ids.conv}/lift`).expect(404);
  });
});
