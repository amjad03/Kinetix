import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { totpCode, totpStep } from '../src/auth/totp.js';
import { DbService } from '../src/db/db.service.js';
import * as s from '../src/db/schema.js';
import { contentLicenses, domainEvents, eventConsumptions, uploadScans, userSessions } from '../src/db/schema-foundation.js';
import { DomainEvents, EventBus } from '../src/events/events.js';
import { JobsService } from '../src/jobs/jobs.service.js';
import { UploadScanService, VirusScanner } from '../src/scanning/upload-scan.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

class FakeScanner extends VirusScanner {
  readonly enabled = true;
  down = false;
  async scan(data: Buffer) {
    if (this.down) throw new Error('clamd is down');
    return data.includes('EICAR') ? { clean: false, signature: 'Eicar-Test-Signature' } : { clean: true };
  }
}

describe('Phase 00 foundation', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const scanner = new FakeScanner();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = (slug: string, email: string) => http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201);
  const code = (secret: string) => totpCode(secret, totpStep(new Date()));
  let n = 0;
  const staff = async (tenantId: string, campusId: string, role: (typeof s.roleName.enumValues)[number]) => {
    const [u] = await db.insert(s.users).values({ tenantId, fullName: role, email: `${role}${++n}-${Math.random().toString(36).slice(2, 6)}@x.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId, userId: u.id, role, campusId });
    return u;
  };

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(new FixedClock(new Date()), (b) => b.overrideProvider(VirusScanner).useValue(scanner));
    tokens.principal = (await login(t.slug, t.principal.email!)).body.accessToken;
    tokens.teacher = (await login(t.slug, t.teacher.email!)).body.accessToken;
    tokens.outsider = (await login(other.slug, other.principal.email!)).body.accessToken;
    const acct = await staff(t.tenantId, t.campus.id, 'accountant');
    ids.accountant = acct.id;
    ids.accountantEmail = acct.email!;
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('MFA and sessions', () => {
    let secret = '';
    let backup: string[] = [];

    it('signs in without a second factor until the institution requires one, and lists the session', async () => {
      const r = await login(t.slug, ids.accountantEmail);
      expect(r.body).toMatchObject({ mustSetUpMfa: false, mustChangePassword: false });
      tokens.accountant = r.body.accessToken;
      const sessions = (await http().get('/v1/me/sessions').set(as('accountant')).expect(200)).body;
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({ current: true, mfaVerified: false });
      expect(sessions[0].label).toBeTruthy();
    });

    it('only administrators set the policy, and only for assignable roles', async () => {
      await http().put('/v1/admin/security-policy').set(as('teacher')).send({ mfaRequiredRoles: ['accountant'] }).expect(403);
      await http().put('/v1/admin/security-policy').set(as('principal')).send({ mfaRequiredRoles: ['student'] }).expect(400);
      await http().put('/v1/admin/security-policy').set(as('principal')).send({ mfaRequiredRoles: ['accountant'] }).expect(200);
      expect((await http().get('/v1/admin/security-policy').set(as('principal')).expect(200)).body.mfaRequiredRoles).toEqual(['accountant']);
      await http().get('/v1/admin/security-policy').set(as('outsider')).expect(200).expect((r) => expect(r.body.mfaRequiredRoles).toEqual([]));
    });

    it('a required role without a factor can only set one up', async () => {
      const r = await login(t.slug, ids.accountantEmail);
      expect(r.body.mustSetUpMfa).toBe(true);
      tokens.accountant = r.body.accessToken;
      const denied = await http().get(`/v1/fees/invoices?sectionId=${t.section.id}`).set(as('accountant')).expect(403);
      expect(denied.body.code).toBe('MFA_SETUP_REQUIRED');
      expect((await http().get('/v1/me/mfa').set(as('accountant')).expect(200)).body).toEqual({ enrolled: false, backupCodesLeft: 0, required: true });
      secret = (await http().post('/v1/me/mfa/enrol').set(as('accountant')).expect(200)).body.secret;
      const uri = (await http().post('/v1/me/mfa/enrol').set(as('accountant')).expect(200)).body;
      secret = uri.secret;
      expect(uri.otpauthUri).toMatch(/^otpauth:\/\/totp\/KINETIX/);
      const wrong = await http().post('/v1/me/mfa/confirm').set(as('accountant')).send({ code: '000000' }).expect(403);
      expect(wrong.body.code).toBe('MFA_CODE_INVALID');
      const ok = await http().post('/v1/me/mfa/confirm').set(as('accountant')).send({ code: code(secret) }).expect(200);
      backup = ok.body.backupCodes;
      expect(backup).toHaveLength(10);
      tokens.accountant = ok.body.accessToken;
      await http().get(`/v1/fees/invoices?sectionId=${t.section.id}`).set(as('accountant')).expect(200);
      await http().post('/v1/me/mfa/enrol').set(as('accountant')).expect(409);
    });

    it('then needs a code at every sign-in; a code cannot be replayed and a backup code works once', async () => {
      const first = await login(t.slug, ids.accountantEmail);
      expect(first.body).toMatchObject({ mfaRequired: true });
      expect(first.body.accessToken).toBeUndefined();
      const bad = await http().post('/v1/auth/mfa/verify').send({ mfaToken: first.body.mfaToken, code: '123456' }).expect(401);
      expect(bad.body.code).toBe('MFA_CODE_INVALID');
      await http().post('/v1/auth/mfa/verify').send({ mfaToken: 'nonsense-token-value', code: '123456' }).expect(401);
      // The code used to confirm enrolment is already spent for this 30-second step (or an earlier one).
      const stale = await http().post('/v1/auth/mfa/verify').send({ mfaToken: first.body.mfaToken, code: code(secret) });
      expect([200, 401]).toContain(stale.status);
      const viaBackup = await http().post('/v1/auth/mfa/verify').send({ mfaToken: first.body.mfaToken, code: backup[0] }).expect(201);
      expect(viaBackup.body.accessToken).toBeTruthy();
      tokens.accountantMfa = viaBackup.body.accessToken;
      await http().get(`/v1/fees/invoices?sectionId=${t.section.id}`).set(as('accountantMfa')).expect(200);
      const second = await login(t.slug, ids.accountantEmail);
      await http().post('/v1/auth/mfa/verify').send({ mfaToken: second.body.mfaToken, code: backup[0] }).expect(401);
      expect((await http().get('/v1/me/mfa').set(as('accountantMfa')).expect(200)).body.backupCodesLeft).toBe(9);
      const sessions = (await http().get('/v1/me/sessions').set(as('accountantMfa')).expect(200)).body as { mfaVerified: boolean; current: boolean }[];
      expect(sessions.find((x) => x.current)?.mfaVerified).toBe(true);
    });

    it('regenerates backup codes with a code, and refuses to switch off while required', async () => {
      await http().post('/v1/me/mfa/backup-codes').set(as('accountantMfa')).send({ code: '111111' }).expect(403);
      const fresh = await http().post('/v1/me/mfa/backup-codes').set(as('accountantMfa')).send({ code: backup[1] }).expect(200);
      expect(fresh.body.backupCodes).toHaveLength(10);
      await http().delete('/v1/me/mfa').set(as('accountantMfa')).send({ code: fresh.body.backupCodes[0] }).expect(403);
    });

    it('signs a device out remotely: its token stops working at once', async () => {
      const a = await login(t.slug, t.teacher2.email!);
      const b = await login(t.slug, t.teacher2.email!);
      await http().get('/v1/me/sessions').set({ authorization: `Bearer ${a.body.accessToken}` }).expect(200);
      const list = (await http().get('/v1/me/sessions').set({ authorization: `Bearer ${b.body.accessToken}` }).expect(200)).body as { id: string; current: boolean }[];
      const mine = list.find((x) => x.current)!;
      const theirs = list.find((x) => !x.current)!;
      await http().delete(`/v1/me/sessions/${theirs.id}`).set({ authorization: `Bearer ${b.body.accessToken}` }).expect(204);
      await http().get('/v1/me/sessions').set({ authorization: `Bearer ${a.body.accessToken}` }).expect(401);
      await http().delete(`/v1/me/sessions/${theirs.id}`).set({ authorization: `Bearer ${b.body.accessToken}` }).expect(404);
      // Nobody else's session can be touched.
      await http().delete(`/v1/me/sessions/${mine.id}`).set(as('outsider')).expect(404);
      const c = await login(t.slug, t.teacher2.email!);
      const out = await http().post('/v1/me/sessions/revoke-others').set({ authorization: `Bearer ${c.body.accessToken}` }).expect(200);
      expect(out.body.revoked).toBeGreaterThanOrEqual(1);
      await http().get('/v1/me/sessions').set({ authorization: `Bearer ${b.body.accessToken}` }).expect(401);
      await http().get('/v1/me/sessions').set({ authorization: `Bearer ${c.body.accessToken}` }).expect(200);
      const audited = await db.select().from(s.auditLog).where(and(eq(s.auditLog.tenantId, t.tenantId), eq(s.auditLog.action, 'auth.session_revoked')));
      expect(audited.length).toBeGreaterThanOrEqual(1);
    });

    it('an administrator can reset a colleague who lost their phone', async () => {
      await http().post(`/v1/admin/users/${ids.accountant}/mfa/reset`).set(as('teacher')).expect(403);
      await http().post(`/v1/admin/users/${ids.accountant}/mfa/reset`).set(as('outsider')).expect(404);
      await http().post(`/v1/admin/users/${ids.accountant}/mfa/reset`).set(as('principal')).expect(204);
      await http().get('/v1/me/sessions').set(as('accountantMfa')).expect(401);
      const r = await login(t.slug, ids.accountantEmail);
      expect(r.body).toMatchObject({ mustSetUpMfa: true });
      expect(await db.select().from(userSessions).where(and(eq(userSessions.userId, ids.accountant), eq(userSessions.mfaVerified, true), isNull(userSessions.revokedAt)))).toHaveLength(0);
    });
  });

  describe('feature flags', () => {
    it('toggle per institution and guard the endpoints they cover', async () => {
      const list = (await http().get('/v1/admin/features').set(as('principal')).expect(200)).body as { key: string; enabled: boolean }[];
      expect(list.find((f) => f.key === 'analytics.reports')?.enabled).toBe(true);
      await http().put('/v1/admin/features/analytics.reports').set(as('teacher')).send({ enabled: false }).expect(403);
      await http().put('/v1/admin/features/nope').set(as('principal')).send({ enabled: false }).expect(404);
      await http().put('/v1/admin/features/analytics.reports').set(as('principal')).send({ enabled: false }).expect(200);
      const off = await http().get('/v1/analytics/reports').set(as('principal')).expect(403);
      expect(off.body.code).toBe('FEATURE_DISABLED');
      expect((await http().get('/v1/features').set(as('teacher')).expect(200)).body['analytics.reports']).toBe(false);
      // The other institution is untouched.
      await http().get('/v1/analytics/reports').set(as('outsider')).expect(200);
      await http().put('/v1/admin/features/analytics.reports').set(as('principal')).send({ enabled: true }).expect(200);
      await http().get('/v1/analytics/reports').set(as('principal')).expect(200);
      const audited = await db.select().from(s.auditLog).where(and(eq(s.auditLog.tenantId, t.tenantId), eq(s.auditLog.action, 'feature.toggled')));
      expect(audited).toHaveLength(2);
    });
  });

  describe('domain event outbox', () => {
    it('writes events only when the change commits, dispatches each to a consumer once, and retries failures', async () => {
      const bus = app.get(EventBus);
      const dbs = app.get(DbService);
      const seen: string[] = [];
      let failOnce = true;
      bus.subscribe('test-counter', ['test.happened'], async (e) => {
        seen.push(e.id);
      });
      bus.subscribe('test-flaky', ['test.flaky'], async () => {
        if (failOnce) {
          failOnce = false;
          throw new Error('boom');
        }
      });
      await expect(
        dbs.withTenant(t.tenantId, async (tx) => {
          await bus.emit(tx, t.tenantId, { type: 'test.happened', aggregateType: 'thing' });
          throw new Error('rolled back');
        }),
      ).rejects.toThrow('rolled back');
      expect(await db.select().from(domainEvents).where(and(eq(domainEvents.tenantId, t.tenantId), eq(domainEvents.type, 'test.happened')))).toHaveLength(0);

      const id = await dbs.withTenant(t.tenantId, (tx) => bus.emit(tx, t.tenantId, { type: 'test.happened', aggregateType: 'thing', payload: { a: 1 } }));
      await dbs.withTenant(t.tenantId, (tx) => bus.emit(tx, t.tenantId, { type: 'test.flaky', aggregateType: 'thing' }));
      await bus.drain();
      expect(seen).toEqual([id]);
      const [flaky] = await db.select().from(domainEvents).where(and(eq(domainEvents.tenantId, t.tenantId), eq(domainEvents.type, 'test.flaky')));
      expect(flaky).toMatchObject({ attempts: 1, dispatchedAt: null, lastError: 'boom' });
      // Redelivery of an event the consumer already handled does nothing.
      await db.update(domainEvents).set({ dispatchedAt: null, nextAttemptAt: new Date() }).where(eq(domainEvents.id, id));
      await db.update(domainEvents).set({ nextAttemptAt: new Date() }).where(eq(domainEvents.id, flaky.id));
      await bus.drain();
      expect(seen).toEqual([id]);
      expect((await db.select().from(domainEvents).where(eq(domainEvents.id, flaky.id)))[0].dispatchedAt).not.toBeNull();
      expect(await db.select().from(eventConsumptions).where(eq(eventConsumptions.eventId, id))).toHaveLength(2); // test-counter and the audit trail
      expect(await db.select().from(s.auditLog).where(and(eq(s.auditLog.tenantId, t.tenantId), eq(s.auditLog.action, 'event.test.happened')))).toHaveLength(1);
    });

    it('is emitted by a fee payment', async () => {
      const dueOn = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
      await http().post('/v1/fees/invoices').set(as('principal')).send({ sectionId: t.section.id, title: 'Events fee', amountPaise: 10_000, dueOn }).expect(201);
      const inv = (await http().get(`/v1/fees/invoices?sectionId=${t.section.id}`).set(as('principal')).expect(200)).body[0];
      const invoiceId = inv.id ?? inv.invoices?.[0]?.id;
      await http().post(`/v1/fees/invoices/${invoiceId}/payments`).set(as('principal')).send({ amountPaise: 10_000, method: 'cash' }).expect(201);
      const ev = await db.select().from(domainEvents).where(and(eq(domainEvents.tenantId, t.tenantId), eq(domainEvents.type, DomainEvents.FeePaid)));
      expect(ev).toHaveLength(1);
      expect(ev[0].payload).toMatchObject({ amountPaise: 10_000, method: 'cash' });
      await app.get(EventBus).drain();
      await app.get(JobsService).drain(); // the payment queued a notification; leave the shared queue empty for other suites
      expect(await db.select().from(s.auditLog).where(and(eq(s.auditLog.tenantId, t.tenantId), eq(s.auditLog.action, 'event.fees.payment_received')))).toHaveLength(1);
    });
  });

  describe('upload virus scanning', () => {
    const PDF = (extra: string) => Buffer.from(`%PDF-1.4\n${extra}\n%%EOF`);
    const up = (title: string, body: Buffer) => http().post(`/v1/documents/vault/student/${t.students[0].id}?title=${title}&category=marks_card`).set(as('principal')).set('content-type', 'application/pdf').send(body);

    it('quarantines until clean, deletes infected files, and retries when the scanner is down', async () => {
      const clean = (await up('Clean', PDF('hello')).expect(201)).body;
      const bad = (await up('Bad', PDF('EICAR')).expect(201)).body;
      const waiting = (await up('Waiting', PDF('later')).expect(201)).body;
      const dl = (id: string) => http().get(`/v1/documents/vault/files/${id}`).set(as('principal'));
      const quarantined = await dl(clean.id).expect(423);
      expect(quarantined.body.code).toBe('UPLOAD_QUARANTINED');
      scanner.down = true;
      const svc = app.get(UploadScanService);
      expect(await svc.scanPending()).toBe(0);
      await dl(clean.id).expect(423);
      scanner.down = false;
      expect(await svc.scanPending()).toBe(3);
      await dl(clean.id).expect(200);
      await dl(waiting.id).expect(200);
      await dl(bad.id).expect(423);
      const [infected] = await db.select().from(uploadScans).where(eq(uploadScans.subjectId, bad.id));
      expect(infected).toMatchObject({ status: 'infected', signature: 'Eicar-Test-Signature' });
      expect((await db.select().from(s.vaultDocuments).where(eq(s.vaultDocuments.id, bad.id)))[0]).toMatchObject({ scanStatus: 'infected' });
      expect(await db.select().from(s.auditLog).where(and(eq(s.auditLog.tenantId, t.tenantId), eq(s.auditLog.action, 'upload.infected')))).toHaveLength(1);
    });

    it('can be switched off for an institution with the feature flag', async () => {
      await http().put('/v1/admin/features/documents.virus_scan').set(as('principal')).send({ enabled: false }).expect(200);
      const d = (await up('Unscanned', PDF('x')).expect(201)).body;
      await http().get(`/v1/documents/vault/files/${d.id}`).set(as('principal')).expect(200);
    });
  });

  describe('content licensing', () => {
    it('hides expired and non-licensed library items from listings', async () => {
      const [course] = await db.select().from(s.courses).limit(1);
      const listed = async (who: string) => ((await http().get('/v1/content/courses').set(as(who)).expect(200)).body as { id: string }[]).some((c) => c.id === course.id);
      expect(await listed('principal')).toBe(true);
      const insert = (v: Partial<typeof contentLicenses.$inferInsert>) => db.insert(contentLicenses).values({ contentType: 'course', contentId: course.id, rightsHolder: 'Publisher', licence: 'CC-BY-NC', ...v }).onConflictDoUpdate({ target: [contentLicenses.contentType, contentLicenses.contentId], set: v as never });
      await insert({ allowedTenants: [other.tenantId] });
      expect(await listed('principal')).toBe(false);
      expect(await listed('outsider')).toBe(true);
      await http().get(`/v1/content/courses/${course.id}`).set(as('principal')).expect(404);
      await insert({ allowedTenants: [t.tenantId], expiresOn: '2020-01-01' });
      expect(await listed('principal')).toBe(false);
      await insert({ allowedTenants: [t.tenantId], expiresOn: '2999-01-01' });
      expect(await listed('principal')).toBe(true);
      expect(await listed('outsider')).toBe(false);
      await db.delete(contentLicenses).where(eq(contentLicenses.contentId, course.id));
      expect(await listed('outsider')).toBe(true);
    });

    it('is managed by the platform team only', async () => {
      await http().get('/v1/platform/content-licenses').set(as('principal')).expect(403);
    });
  });

  describe('observability', () => {
    it('answers with a request id, keeps the caller\'s id, and exposes Prometheus metrics', async () => {
      const r = await http().get('/health').expect(200);
      expect(r.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      const mine = await http().get('/health').set('x-request-id', 'trace-me-12345').expect(200);
      expect(mine.headers['x-request-id']).toBe('trace-me-12345');
      await http().get('/v1/me/sessions').set(as('teacher')).expect(200);
      const m = await http().get('/metrics').expect(200);
      expect(m.headers['content-type']).toMatch(/text\/plain/);
      expect(m.text).toMatch(/# TYPE kinetix_http_requests_total counter/);
      expect(m.text).toMatch(/kinetix_http_requests_total\{method="GET",route="\/v1\/me\/sessions",status="2xx"\} \d+/);
      expect(m.text).toMatch(/kinetix_http_request_duration_seconds_bucket\{[^}]*le="\+Inf"\}/);
      expect(m.text).toMatch(/kinetix_domain_events_total/);
    });
  });
});
