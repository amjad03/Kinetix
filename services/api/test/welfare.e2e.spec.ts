import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('grievance, discipline, counselling and welfare', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const start = new Date('2026-10-20T04:30:00Z');
  const clock = new FixedClock(start);
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body);
  const audited = async (action: string) => (await owner.query('select count(*)::int as n from audit_log where tenant_id = $1 and action = $2', [t.tenantId, action])).rows[0].n as number;
  const days = (n: number) => new Date(start.getTime() + n * 86_400_000);
  const R = (rupees: number) => rupees * 100;

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@wf.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
    return u;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const users = { gro: await addUser('Gita Grievance', 'grievance_officer'), icc: await addUser('Indu Icc', 'icc_member'), icc2: await addUser('Isha Icc', 'icc_member'), c1: await addUser('Chitra Counsellor', 'counsellor'), c2: await addUser('Chetan Counsellor', 'counsellor'), admin: await addUser('Adil Admin', 'tenant_admin') };
    app = await createApp(clock);
    tokens = {
      gro: await login(t.slug, users.gro.email!),
      icc: await login(t.slug, users.icc.email!),
      icc2: await login(t.slug, users.icc2.email!),
      c1: await login(t.slug, users.c1.email!),
      c2: await login(t.slug, users.c2.email!),
      admin: await login(t.slug, users.admin.email!),
      teacher: await login(t.slug, t.teacher.email!),
      principal: await login(t.slug, t.principal.email!),
      student: await login(t.slug, t.studentUser.email!),
      parent: await login(t.slug, t.guardian.email!),
      parent2: await login(t.slug, t.guardian2.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
    Object.assign(ids, { gro: users.gro.id, icc: users.icc.id, icc2: users.icc2.id, c1: users.c1.id, c2: users.c2.id, me: t.students[2].id, kid: t.students[0].id, student: t.studentUser.id, parent: t.guardian.id });
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('grievance tickets', () => {
    const fees = { category: 'fees', subject: 'Fee receipt is wrong', description: 'The receipt shows the wrong amount for term 3.' };

    it('numbers tickets, sets the SLA from severity, and lets parents raise only for their own child', async () => {
      const a = (await post('student', '/v1/grievances', fees).expect(201)).body;
      expect(a).toMatchObject({ ticketNo: 'GRV-0001', status: 'open', severity: 'medium', studentId: ids.me, committee: null });
      expect(new Date(a.slaDueAt).toISOString()).toBe(days(5).toISOString());
      ids.fees = a.id;
      const b = (await post('parent', '/v1/grievances', { ...fees, subject: 'Bus pickup is late', category: 'transport', severity: 'high', studentId: ids.kid }).expect(201)).body;
      expect(new Date(b.slaDueAt).toISOString()).toBe(new Date(start.getTime() + 48 * 3_600_000).toISOString());
      await post('parent2', '/v1/grievances', { ...fees, studentId: ids.kid }).expect(404);
      await post('parent', '/v1/grievances', { ...fees, description: 'short' }).expect(400);
      expect((await get('student', '/v1/grievances/mine').expect(200)).body).toHaveLength(1);
    });

    it('is a queue for the grievance team only; the committee cannot open general tickets', async () => {
      await get('student', '/v1/grievances').expect(403);
      await get('teacher', '/v1/grievances').expect(403);
      expect((await get('gro', '/v1/grievances').expect(200)).body).toHaveLength(2);
      expect((await get('icc', '/v1/grievances').expect(200)).body).toHaveLength(0);
      await get('icc', `/v1/grievances/${ids.fees}`).expect(404);
      await get('teacher', `/v1/grievances/${ids.fees}`).expect(404);
      await get('parent', `/v1/grievances/${ids.fees}`).expect(404);
      await get('outsider', `/v1/grievances/${ids.fees}`).expect(404);
    });

    it('assigns to the team, keeps internal notes from the reporter, and resolves', async () => {
      await post('gro', `/v1/grievances/${ids.fees}/assign`, { assigneeUserId: ids.icc }).expect(409);
      await post('gro', `/v1/grievances/${ids.fees}/assign`, { assigneeUserId: ids.gro }).expect(200);
      await post('student', `/v1/grievances/${ids.fees}/assign`, { assigneeUserId: ids.gro }).expect(403);
      await post('gro', `/v1/grievances/${ids.fees}/comments`, { body: 'Checking with accounts', internal: true }).expect(200);
      await post('gro', `/v1/grievances/${ids.fees}/comments`, { body: 'We are looking into it' }).expect(200);
      await post('student', `/v1/grievances/${ids.fees}/comments`, { body: 'Thank you' }).expect(200);
      const reporterView = (await get('student', `/v1/grievances/${ids.fees}`).expect(200)).body;
      expect(reporterView.timeline.map((e: { body: string }) => e.body)).not.toContain('Checking with accounts');
      expect(reporterView.timeline.map((e: { body: string }) => e.body)).toContain('We are looking into it');
      const staffView = (await get('gro', `/v1/grievances/${ids.fees}`).expect(200)).body;
      expect(staffView.timeline.map((e: { body: string }) => e.body)).toContain('Checking with accounts');
      await post('student', `/v1/grievances/${ids.fees}/resolve`, { resolution: 'I fixed it myself' }).expect(403);
      await post('gro', `/v1/grievances/${ids.fees}/resolve`, { resolution: 'Receipt reissued' }).expect(200);
      await post('student', `/v1/grievances/${ids.fees}/rating`, { rating: 6 }).expect(400);
      await post('parent', `/v1/grievances/${ids.fees}/rating`, { rating: 5 }).expect(404);
      const rated = (await post('student', `/v1/grievances/${ids.fees}/rating`, { rating: 4, comment: 'Quick' }).expect(200)).body;
      expect(rated).toMatchObject({ status: 'closed', rating: 4 });
      await post('student', `/v1/grievances/${ids.fees}/rating`, { rating: 5 }).expect(409);
      await post('student', `/v1/grievances/${ids.fees}/reopen`, { body: 'Still wrong' }).expect(409);
      const stats = (await get('gro', '/v1/grievances/stats').expect(200)).body;
      expect(stats).toMatchObject({ total: 2, open: 1, averageRating: 4 });
      expect(stats.committee).toBeUndefined();
    });

    it('hides the reporter of an anonymous ticket from everyone but themselves, including the audit trail', async () => {
      const a = (await post('student', '/v1/grievances', { category: 'staff_conduct', subject: 'Unfair marking by a lecturer', description: 'I would rather not be named in this matter.', anonymous: true }).expect(201)).body;
      expect(a.raisedBy).toBe(ids.student);
      const seen = (await get('gro', `/v1/grievances/${a.id}`).expect(200)).body;
      expect(seen.anonymous).toBe(true);
      expect(seen.raisedBy).toBeUndefined();
      expect(seen.studentId).toBeUndefined();
      expect(JSON.stringify(seen)).not.toContain(ids.student);
      const queue = (await get('gro', '/v1/grievances').expect(200)).body as { id: string; raisedBy?: string }[];
      expect(queue.find((x) => x.id === a.id)?.raisedBy).toBeUndefined();
      const log = (await owner.query("select actor_id, data from audit_log where tenant_id = $1 and action = 'grievance.raised' and subject_id = $2", [t.tenantId, a.id])).rows[0];
      expect(log.actor_id).toBeNull();
      expect(JSON.stringify(log.data)).not.toContain(ids.student);
      await post('gro', `/v1/grievances/${a.id}/comments`, { body: 'Can you tell us more?' }).expect(200);
      await post('student', `/v1/grievances/${a.id}/comments`, { body: 'It was in the viva' }).expect(200);
      const tl = (await get('gro', `/v1/grievances/${a.id}`).expect(200)).body.timeline as { actorRole: string; actorUserId: string | null }[];
      expect(tl.filter((e) => e.actorRole === 'reporter').every((e) => e.actorUserId === null)).toBe(true);
    });

    it('lets the reporter reopen a resolved ticket within a week, then not', async () => {
      const a = (await post('student', '/v1/grievances', { ...fees, subject: 'Hostel water supply', category: 'hostel' }).expect(201)).body;
      await post('gro', `/v1/grievances/${a.id}/resolve`, { resolution: 'Plumber fixed it' }).expect(200);
      const re = (await post('student', `/v1/grievances/${a.id}/reopen`, { body: 'Broken again' }).expect(200)).body;
      expect(re).toMatchObject({ status: 'reopened', escalationLevel: 0 });
      await post('gro', `/v1/grievances/${a.id}/resolve`, { resolution: 'New valve installed' }).expect(200);
      clock.at = days(8);
      await post('student', `/v1/grievances/${a.id}/reopen`, { body: 'Late' }).expect(409);
      clock.at = start;
    });
  });

  describe('anti-ragging, ICC and POSH committee', () => {
    it('routes the matter to a committee that only committee members, and the reporter, can open', async () => {
      const r = (await post('student', '/v1/grievances', { category: 'ragging', severity: 'low', subject: 'Seniors in the hostel', description: 'A group of seniors made us do things at night.' }).expect(201)).body;
      expect(r).toMatchObject({ committee: 'anti_ragging', severity: 'high', committeeStage: 'received' });
      ids.ragging = r.id;
      const posh = (await post('teacher', '/v1/grievances', { category: 'harassment', subject: 'Behaviour at the department', description: 'I want to file a complaint about a colleague.', committee: 'posh' }).expect(201)).body;
      expect(posh.committee).toBe('posh');
      for (const who of ['gro', 'admin', 'teacher', 'parent', 'outsider'] as const) await get(who, `/v1/grievances/${ids.ragging}`).expect(404);
      for (const who of ['gro', 'admin'] as const) expect((await get(who, '/v1/grievances').expect(200)).body.some((x: { committee: string | null }) => x.committee)).toBe(false);
      expect((await get('icc', '/v1/grievances').expect(200)).body).toHaveLength(2);
      expect((await get('principal', '/v1/grievances').expect(200)).body.length).toBeGreaterThanOrEqual(2);
      const before = await audited('grievance.committee_viewed');
      const view = (await get('icc', `/v1/grievances/${ids.ragging}`).expect(200)).body;
      expect(view.viewer).toBe('committee');
      expect(await audited('grievance.committee_viewed')).toBe(before + 1);
      const note = (await owner.query("select count(*)::int as n from notifications where tenant_id = $1 and kind = 'grievance' and body like '%Seniors%'", [t.tenantId])).rows[0].n;
      expect(note).toBe(0); // no subject text leaves the committee through notifications
    });

    it('takes the committee through its stages in order, with a member assigned, before resolution', async () => {
      const stage = (who: string, stage: string) => post(who, `/v1/grievances/${ids.ragging}/committee-stage`, { stage, note: `moved to ${stage}` });
      await stage('gro', 'inquiry').expect(403);
      await stage('icc', 'action').expect(409);
      await stage('icc', 'inquiry').expect(200);
      await stage('icc', 'report').expect(409); // nobody assigned yet
      await post('icc', `/v1/grievances/${ids.ragging}/assign`, { assigneeUserId: ids.gro }).expect(409); // only committee members
      await post('icc', `/v1/grievances/${ids.ragging}/assign`, { assigneeUserId: ids.icc2 }).expect(200);
      await stage('icc2', 'report').expect(200);
      await post('icc2', `/v1/grievances/${ids.ragging}/resolve`, { resolution: 'Warning issued to the seniors' }).expect(409); // not yet at the action stage
      await post('icc2', `/v1/grievances/${ids.ragging}/comments`, { body: 'Statements recorded', internal: true }).expect(200);
      await stage('icc2', 'action').expect(200);
      await post('gro', `/v1/grievances/${ids.ragging}/resolve`, { resolution: 'nope nope' }).expect(404);
      await post('icc2', `/v1/grievances/${ids.ragging}/resolve`, { resolution: 'Seniors suspended from the hostel' }).expect(200);
      const reporter = (await get('student', `/v1/grievances/${ids.ragging}`).expect(200)).body;
      expect(reporter.timeline.every((e: { visibility: string }) => e.visibility === 'public')).toBe(true);
      expect(reporter.timeline.map((e: { kind: string }) => e.kind)).not.toContain('stage_inquiry');
      expect((await post('student', `/v1/grievances/${ids.ragging}/rating`, { rating: 5 }).expect(200)).body.status).toBe('closed');
      expect(await audited('grievance.committee_stage')).toBe(3);
    });
  });

  describe('SLA escalation', () => {
    it('escalates an overdue ticket one level at a time, up to the top, and tells the next tier', async () => {
      const a = (await post('parent', '/v1/grievances', { category: 'infrastructure', severity: 'critical', subject: 'Broken stair railing', description: 'The railing on the east stair is loose.', studentId: ids.kid }).expect(201)).body;
      expect(new Date(a.slaDueAt).toISOString()).toBe(new Date(start.getTime() + 24 * 3_600_000).toISOString());
      expect((await get('gro', '/v1/grievances?overdue=true').expect(200)).body).toHaveLength(0);
      clock.at = days(2);
      const esc = (await get('gro', `/v1/grievances/${a.id}`).expect(200)).body;
      expect(esc.status).toBe('open'); // reading does not escalate; the queue and the job do
      expect((await post('gro', '/v1/grievances/escalate-overdue').expect(200)).body.escalated).toBeGreaterThanOrEqual(1);
      const l1 = (await get('gro', `/v1/grievances/${a.id}`).expect(200)).body;
      expect(l1).toMatchObject({ status: 'escalated', escalationLevel: 1 });
      expect(new Date(l1.slaDueAt).toISOString()).toBe(new Date(days(2).getTime() + 24 * 3_600_000).toISOString());
      clock.at = days(4);
      await get('gro', '/v1/grievances').expect(200); // the queue escalates too
      expect((await get('gro', `/v1/grievances/${a.id}`).expect(200)).body.escalationLevel).toBe(2);
      clock.at = days(9);
      await get('gro', '/v1/grievances').expect(200);
      expect((await get('gro', `/v1/grievances/${a.id}`).expect(200)).body.escalationLevel).toBe(2); // capped
      expect(await audited('grievance.escalated')).toBeGreaterThanOrEqual(2);
      const principalNotes = (await owner.query("select count(*)::int as n from notifications where tenant_id = $1 and user_id = $2 and kind = 'grievance'", [t.tenantId, t.principal.id])).rows[0].n;
      expect(principalNotes).toBeGreaterThan(0);
      const stats = (await get('gro', '/v1/grievances/stats').expect(200)).body;
      expect(stats.overdue).toBeGreaterThanOrEqual(1);
      clock.at = start;
    });
  });

  describe('discipline', () => {
    it('lets staff report, restricts the register, and keeps the reporter from the family', async () => {
      await post('student', '/v1/discipline/incidents', { studentId: ids.kid, incidentOn: '2026-10-19', kind: 'Fight', description: 'A scuffle in the corridor.' }).expect(403);
      const inc = (await post('teacher', '/v1/discipline/incidents', { studentId: ids.kid, incidentOn: '2026-10-19', kind: 'Fight', severity: 'major', description: 'A scuffle in the corridor.' }).expect(201)).body;
      ids.incident = inc.id;
      expect((await get('teacher', '/v1/discipline/incidents').expect(200)).body).toHaveLength(1);
      expect((await get('principal', '/v1/discipline/incidents').expect(200)).body).toHaveLength(1);
      await get('gro', '/v1/discipline/incidents').expect(403);
      const fam = (await get('parent', `/v1/discipline/students/${ids.kid}`).expect(200)).body;
      expect(fam[0].reportedBy).toBeUndefined();
      expect(fam[0]).toMatchObject({ kind: 'Fight', status: 'reported' });
      await get('parent2', `/v1/discipline/students/${ids.kid}`).expect(404);
      await get('teacher', `/v1/discipline/students/${ids.kid}`).expect(404);
    });

    it('restricts suspension to the principal and validates each action', async () => {
      await post('admin', `/v1/discipline/incidents/${ids.incident}/review`).expect(200);
      await post('admin', `/v1/discipline/incidents/${ids.incident}/actions`, { action: 'suspension', startsOn: '2026-10-21', endsOn: '2026-10-23' }).expect(403);
      await post('principal', `/v1/discipline/incidents/${ids.incident}/actions`, { action: 'suspension', startsOn: '2026-10-21' }).expect(400);
      await post('principal', `/v1/discipline/incidents/${ids.incident}/actions`, { action: 'fine' }).expect(400);
      await post('principal', `/v1/discipline/incidents/${ids.incident}/actions`, { action: 'expulsion' }).expect(409); // not a severe incident
      const act = (await post('principal', `/v1/discipline/incidents/${ids.incident}/actions`, { action: 'suspension', detail: 'Three days', startsOn: '2026-10-21', endsOn: '2026-10-23' }).expect(201)).body;
      ids.action = act.id;
      expect((await get('parent', `/v1/discipline/students/${ids.kid}`).expect(200)).body[0]).toMatchObject({ status: 'action_taken', actions: [{ action: 'suspension', status: 'active' }] });
      const note = (await owner.query("select count(*)::int as n from notifications where tenant_id = $1 and user_id = $2 and kind = 'grievance'", [t.tenantId, ids.parent])).rows[0].n;
      expect(note).toBeGreaterThan(0);
    });

    it('lets the family appeal within 15 days and needs a different decision-maker', async () => {
      await post('parent2', `/v1/discipline/actions/${ids.action}/appeals`, { grounds: 'Not my child but unfair anyway' }).expect(404);
      await post('parent', `/v1/discipline/actions/${ids.action}/appeals`, { grounds: 'short' }).expect(400);
      const ap = (await post('parent', `/v1/discipline/actions/${ids.action}/appeals`, { grounds: 'He was defending himself and did not start it.' }).expect(201)).body;
      await post('parent', `/v1/discipline/actions/${ids.action}/appeals`, { grounds: 'He was defending himself, as I said before.' }).expect(409);
      await post('principal', `/v1/discipline/incidents/${ids.incident}/close`).expect(409);
      await post('principal', `/v1/discipline/appeals/${ap.id}/decision`, { decision: 'reduced', note: 'Reduced to one day' }).expect(403); // the principal took the action
      await post('parent', `/v1/discipline/appeals/${ap.id}/decision`, { decision: 'revoked', note: 'Revoke it please' }).expect(403);
      const out = (await post('admin', `/v1/discipline/appeals/${ap.id}/decision`, { decision: 'reduced', note: 'Reduced to one day' }).expect(200)).body;
      expect(out.status).toBe('reduced');
      const view = (await get('parent', `/v1/discipline/students/${ids.kid}`).expect(200)).body[0];
      expect(view).toMatchObject({ status: 'closed', actions: [{ status: 'reduced', appeals: [{ status: 'reduced', decisionNote: 'Reduced to one day' }] }] });
      expect(view.actions[0].appeals[0].appellantUserId).toBeUndefined();
      await post('admin', `/v1/discipline/appeals/${ap.id}/decision`, { decision: 'upheld', note: 'Changed my mind' }).expect(409);
    });

    it('closes the appeal window after 15 days', async () => {
      const inc = (await post('teacher', '/v1/discipline/incidents', { studentId: ids.me, incidentOn: '2026-10-20', kind: 'Late arrival', description: 'Repeated late arrival this month.' }).expect(201)).body;
      const act = (await post('admin', `/v1/discipline/incidents/${inc.id}/actions`, { action: 'warning', detail: 'Written warning' }).expect(201)).body;
      clock.at = days(16);
      const r = await post('student', `/v1/discipline/actions/${act.id}/appeals`, { grounds: 'The bus was late on every one of those days.' }).expect(409);
      expect(r.body.code).toBe('APPEAL_WINDOW_CLOSED');
      clock.at = start;
      await post('student', `/v1/discipline/actions/${act.id}/appeals`, { grounds: 'The bus was late on every one of those days.' }).expect(201);
    });
  });

  describe('counselling', () => {
    it('keeps the notes to the counsellor who holds the session, and the reason to those who need it', async () => {
      const s1 = (await post('parent', '/v1/counselling/sessions', { studentId: ids.kid, reason: 'Anxious about exams and sleeping badly' }).expect(201)).body;
      expect(s1).toMatchObject({ status: 'requested', counsellorUserId: null });
      expect(s1.reason).toContain('Anxious');
      const pView = (await get('principal', '/v1/counselling/sessions').expect(200)).body;
      expect(pView[0].reason).toBeUndefined();
      expect((await get('c2', '/v1/counselling/sessions').expect(200)).body[0].reason).toContain('Anxious');
      await post('teacher', `/v1/counselling/sessions/${s1.id}/schedule`, { scheduledAt: days(1).toISOString() }).expect(403);
      await post('c1', `/v1/counselling/sessions/${s1.id}/schedule`, { scheduledAt: days(-1).toISOString() }).expect(409);
      const sch = (await post('c1', `/v1/counselling/sessions/${s1.id}/schedule`, { scheduledAt: days(1).toISOString() }).expect(200)).body;
      expect(sch).toMatchObject({ status: 'scheduled', counsellorUserId: ids.c1 });
      await post('c2', `/v1/counselling/sessions/${s1.id}/schedule`, { scheduledAt: days(2).toISOString() }).expect(404);
      await get('c2', `/v1/counselling/sessions/${s1.id}`).expect(404);
      await get('teacher', `/v1/counselling/sessions/${s1.id}`).expect(404);
      await get('parent2', `/v1/counselling/sessions/${s1.id}`).expect(404);
      await get('outsider', `/v1/counselling/sessions/${s1.id}`).expect(404);
      const secret = 'Student discloses panic attacks; plan: breathing exercises.';
      await owner.query('select 1');
      await http().put(`/v1/counselling/sessions/${s1.id}/notes`).set(auth('c2')).send({ notes: secret }).expect(404);
      await http().put(`/v1/counselling/sessions/${s1.id}/notes`).set(auth('principal')).send({ notes: secret }).expect(403);
      const saved = (await http().put(`/v1/counselling/sessions/${s1.id}/notes`).set(auth('c1')).send({ notes: secret }).expect(200)).body;
      expect(saved.confidentialNotes).toBe(secret);
      expect((await get('c1', `/v1/counselling/sessions/${s1.id}`).expect(200)).body.confidentialNotes).toBe(secret);
      for (const who of ['principal', 'admin', 'parent'] as const) {
        const body = (await get(who, `/v1/counselling/sessions/${s1.id}`).expect(200)).body;
        expect(JSON.stringify(body)).not.toContain('panic');
        expect(body.confidentialNotes).toBeUndefined();
      }
      for (const who of ['principal', 'parent', 'c1'] as const) expect(JSON.stringify((await get(who, '/v1/counselling/sessions').expect(200)).body)).not.toContain('panic');
      expect(JSON.stringify((await get('principal', `/v1/counselling/sessions/${s1.id}`).expect(200)).body)).not.toContain('Anxious');
      const logs = (await owner.query("select data from audit_log where tenant_id = $1 and action like 'counselling.%'", [t.tenantId])).rows;
      expect(JSON.stringify(logs)).not.toContain('panic');
      expect(JSON.stringify(logs)).not.toContain('Anxious');
      expect(await audited('counselling.notes_viewed')).toBe(1);
      expect((await post('c1', `/v1/counselling/sessions/${s1.id}/outcome`, { status: 'completed' }).expect(200)).body.status).toBe('completed');
      await post('c1', `/v1/counselling/sessions/${s1.id}/cancel`).expect(409);
    });

    it('takes requests from students and referrals from staff, and lets the requester cancel', async () => {
      const mine = (await post('student', '/v1/counselling/sessions', { reason: 'Stress' }).expect(201)).body;
      expect(mine.studentId).toBe(ids.me);
      expect((await get('student', '/v1/counselling/sessions').expect(200)).body).toHaveLength(1);
      await post('student', '/v1/counselling/sessions', { studentId: ids.kid }).expect(404);
      await post('teacher', '/v1/counselling/sessions', { reason: 'Withdrawn in class' }).expect(409);
      const ref = (await post('teacher', '/v1/counselling/sessions', { studentId: ids.kid, reason: 'Withdrawn in class' }).expect(201)).body;
      expect(ref.status).toBe('requested');
      await post('student', `/v1/counselling/sessions/${ref.id}/cancel`).expect(404);
      await post('teacher', `/v1/counselling/sessions/${ref.id}/cancel`).expect(200);
      const walkIn = (await post('c2', '/v1/counselling/sessions', { studentId: ids.me, reason: 'Walk-in' }).expect(201)).body;
      expect(walkIn).toMatchObject({ status: 'scheduled', counsellorUserId: ids.c2 });
    });
  });

  describe('welfare requests', () => {
    const body = { kind: 'scholarship', title: 'Merit scholarship', details: 'Top of the class', amountRequestedPaise: R(20_000) };

    it('lets families ask, and only the welfare team decide, within the amount asked', async () => {
      await post('teacher', '/v1/welfare/requests', body).expect(403);
      const mine = (await post('student', '/v1/welfare/requests', body).expect(201)).body;
      const kids = (await post('parent', '/v1/welfare/requests', { ...body, kind: 'fee_waiver', title: 'Fee waiver', studentId: ids.kid }).expect(201)).body;
      await post('parent2', '/v1/welfare/requests', { ...body, studentId: ids.kid }).expect(404);
      expect((await get('student', '/v1/welfare/requests').expect(200)).body).toHaveLength(1);
      expect((await get('parent', '/v1/welfare/requests').expect(200)).body).toHaveLength(1);
      expect((await get('gro', '/v1/welfare/requests').expect(200)).body).toHaveLength(2);
      expect((await get('teacher', '/v1/welfare/requests').expect(200)).body).toHaveLength(0);
      await post('student', `/v1/welfare/requests/${mine.id}/decision`, { decision: 'approved', note: 'self-approve' }).expect(403);
      await post('gro', `/v1/welfare/requests/${mine.id}/disburse`).expect(409);
      await post('gro', `/v1/welfare/requests/${mine.id}/decision`, { decision: 'approved', amountApprovedPaise: R(25_000), note: 'Approved' }).expect(409);
      await post('gro', `/v1/welfare/requests/${mine.id}/decision`, { decision: 'approved', note: 'Approved', expectedVersion: 5 }).expect(409);
      const ok = (await post('gro', `/v1/welfare/requests/${mine.id}/decision`, { decision: 'approved', amountApprovedPaise: R(15_000), note: 'Part award', expectedVersion: 0 }).expect(200)).body;
      expect(ok).toMatchObject({ status: 'approved', amountApprovedPaise: R(15_000), decidedBy: ids.gro });
      await post('gro', `/v1/welfare/requests/${mine.id}/decision`, { decision: 'rejected', note: 'Changed mind' }).expect(409);
      expect((await post('gro', `/v1/welfare/requests/${mine.id}/disburse`).expect(200)).body).toMatchObject({ status: 'disbursed', disbursedOn: '2026-10-20' });
      await post('student', `/v1/welfare/requests/${mine.id}/withdraw`).expect(409);
      await post('parent', `/v1/welfare/requests/${kids.id}/withdraw`).expect(200);
      await post('gro', `/v1/welfare/requests/${kids.id}/review`).expect(409);
      expect(await audited('welfare.approved')).toBe(1);
      const n = (await owner.query("select count(*)::int as n from notifications where tenant_id = $1 and kind = 'welfare'", [t.tenantId])).rows[0].n;
      expect(n).toBeGreaterThan(0);
    });

    it('keeps institutions apart', async () => {
      expect((await get('outsider', '/v1/welfare/requests').expect(200)).body).toHaveLength(0);
      expect((await get('outsider', '/v1/grievances').expect(200)).body).toHaveLength(0);
    });
  });
});
