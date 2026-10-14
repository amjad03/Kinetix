import type { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Mailer, type Mail } from '../src/analytics/mailer.js';
import { inQuietHours, postRefusal } from '../src/chat/chat-groups.js';
import { nextOccurrence } from '../src/comms/comms.logic.js';
import * as s from '../src/db/schema.js';
import { officeRolesOf } from '../src/messages/chat-rules.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool } from './helpers.js';

/**
 * Communication depth: the do-not-contact list (kit entity) holding back campaign deliveries, recurring
 * reminders that schedule their next send, office roles answering office threads in Conversations with a
 * student search, and class groups whose roster follows the class with admins-only posting.
 */
describe('communication depth', () => {
  const owner = ownerPool();
  const start = nextMondayIst('10:30');
  const clock = new FixedClock(start);
  const sent: Mail[] = [];
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const db = drizzle(owner, { schema: s });
    const [acc] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Asha Accounts', email: `asha-${t.slug}@acc.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: acc.id, role: 'accountant' });
    app = await createApp(clock, (b) => b.overrideProvider(Mailer).useValue({ send: async (m: Mail) => void sent.push(m) }));
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.teacher2 = await login(t.slug, t.teacher2.email!);
    tokens.student = await login(t.slug, t.studentUser.email!);
    tokens.parent = await login(t.slug, t.guardian.email!);
    tokens.accountant = await login(t.slug, `asha-${t.slug}@acc.in`);
    tokens.outsider = await login(other.slug, other.principal.email!);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('has pure rules for repeats, office roles and quiet hours', () => {
    const at = new Date('2026-10-19T04:30:00Z');
    expect(nextOccurrence(at, 'weekly', '2026-11-30')?.toISOString()).toBe('2026-10-26T04:30:00.000Z');
    expect(nextOccurrence(at, 'daily', '2026-10-19')).toBeNull();
    expect(nextOccurrence(at, 'none', '2026-12-31')).toBeNull();
    expect(officeRolesOf(undefined)).toEqual(['accountant', 'admissions_officer']);
    expect(officeRolesOf({ officeRoles: [] })).toEqual([]);
    expect(inQuietHours('22:15', '21:00', '07:00')).toBe(true);
    expect(inQuietHours('06:59', '21:00', '07:00')).toBe(true);
    expect(inQuietHours('12:00', '21:00', '07:00')).toBe(false);
    expect(inQuietHours('12:00', null, null)).toBe(false);
    const g = { postPolicy: 'all', quietStart: '21:00', quietEnd: '07:00' };
    expect(postRefusal(g, 'member', new Date('2026-10-19T17:00:00Z'), 'Asia/Kolkata')).toMatch(/quiet until 07:00/);
    expect(postRefusal(g, 'admin', new Date('2026-10-19T17:00:00Z'), 'Asia/Kolkata')).toBeNull();
    expect(postRefusal({ ...g, postPolicy: 'admins' }, 'member', new Date('2026-10-19T06:00:00Z'), 'Asia/Kolkata')).toMatch(/admins/);
  });

  it('keeps a do-not-contact list that campaigns skip, and repeats a reminder until its end date', async () => {
    const R = '/v1/records/contact-suppressions';
    await http().post(R).set(as('teacher')).send({ channel: 'email', address: t.studentUser.email, reason: 'bounced' }).expect(403);
    await http().post(R).set(as('principal')).send({ channel: 'email', address: 'not-an-email', reason: 'bounced' }).expect(400);
    await http().post(R).set(as('principal')).send({ channel: 'sms', address: '12345', reason: 'dnd' }).expect(400);
    const sup = (await http().post(R).set(as('principal')).send({ channel: 'email', address: t.studentUser.email!.toUpperCase(), reason: 'bounced', note: 'Mailbox full' }).expect(201)).body;
    expect(sup.address).toBe(t.studentUser.email!.toLowerCase());
    const list = (await http().get(R).set(as('principal')).expect(200)).body;
    expect(list.rows.map((r: { address: string; personName: string | null }) => [r.address, r.personName])).toEqual([[t.studentUser.email!.toLowerCase(), t.studentUser.fullName]]);
    expect((await http().get(R).set(as('outsider')).expect(200)).body.rows).toEqual([]);

    const CM = '/v1/comms';
    const audience = (await http().post(`${CM}/audiences`).set(as('principal')).send({ name: 'Students', rule: { roles: ['student'] } }).expect(201)).body.id;
    const mail = (await http().post(`${CM}/templates`).set(as('principal')).send({ key: 'closure', channel: 'email', subject: 'Notice', body: 'Dear {{name}}, school is closed.' }).expect(201)).body.id;
    const c = (await http().post(`${CM}/campaigns`).set(as('principal')).send({ title: 'Closure', templateId: mail, audienceId: audience }).expect(201)).body;
    expect(c).toMatchObject({ status: 'sent', sentCount: 0, suppressedCount: 1, delivery: { suppressed: 1 } });
    expect(sent).toHaveLength(0);

    // A weekly in-app reminder: sending it schedules the next one; past the end date nothing more is scheduled.
    const inApp = (await http().post(`${CM}/templates`).set(as('principal')).send({ key: 'library_due', channel: 'in_app', subject: 'Library', body: 'Return your books, {{name}}.' }).expect(201)).body.id;
    await http().post(`${CM}/campaigns`).set(as('principal')).send({ title: 'Library', templateId: inApp, audienceId: audience, repeat: 'weekly' }).expect(400);
    const until = new Date(start.getTime() + 10 * 86400_000).toISOString().slice(0, 10);
    const r = (await http().post(`${CM}/campaigns`).set(as('principal')).send({ title: 'Library', templateId: inApp, audienceId: audience, repeat: 'weekly', repeatUntil: until }).expect(201)).body;
    expect(r).toMatchObject({ status: 'sent', sentCount: 1, suppressedCount: 0 });
    const next = (await http().get(`${CM}/campaigns`).set(as('principal')).expect(200)).body.filter((x: { title: string; status: string }) => x.title === 'Library' && x.status === 'scheduled');
    expect(next).toHaveLength(1);
    expect(new Date(next[0].sendAt).getTime()).toBe(new Date(r.sendAt).getTime() + 7 * 86400_000);
    await http().get(`${CM}/campaigns/${r.id}`).set(as('principal')).expect(200); // a re-count does not schedule twice
    clock.at = new Date(start.getTime() + 8 * 86400_000);
    expect((await http().post(`${CM}/run`).set(as('principal')).expect(200)).body.campaigns).toBe(1);
    const after = (await http().get(`${CM}/campaigns`).set(as('principal')).expect(200)).body.filter((x: { title: string }) => x.title === 'Library');
    expect(after.map((x: { status: string }) => x.status).sort()).toEqual(['sent', 'sent']);
    clock.at = start;
  });

  it('lets office roles answer office threads in Conversations and search students', async () => {
    const s0 = (await http().get('/v1/conversations/settings').set(as('accountant')).expect(200)).body;
    expect(s0.isOffice).toBe(true);
    const office = (await http().post('/v1/conversations').set(as('parent')).send({ studentId: t.students[0].id, office: true }).expect(201)).body.id;
    await http().post(`/v1/conversations/${office}/messages`).set(as('parent')).send({ body: 'Is the fee receipt ready?' }).expect(201);
    const mine = (await http().get('/v1/conversations').set(as('accountant')).expect(200)).body;
    expect(JSON.stringify(mine)).toContain(office);
    await http().post(`/v1/conversations/${office}/messages`).set(as('accountant')).send({ body: 'Yes, collect it at the counter.' }).expect(201);

    // Office roles see every student; a teacher only their own classes.
    expect((await http().get('/v1/conversations/students?q=Student').set(as('accountant')).expect(200)).body).toHaveLength(3);
    expect((await http().get('/v1/conversations/students?q=Student').set(as('teacher2')).expect(200)).body).toHaveLength(0);
    expect((await http().get('/v1/conversations/students?q=Student').set(as('teacher')).expect(200)).body).toHaveLength(3);

    // The principal can take the accounts office off the desk.
    const set = (await http().get('/v1/conversations/settings').set(as('principal')).expect(200)).body;
    expect(set.officeRoleChoices).toContain('accountant');
    await http().put('/v1/conversations/settings').set(as('principal')).send({ officeRoles: ['librarian'] }).expect(200);
    expect((await http().get('/v1/conversations/settings').set(as('accountant')).expect(200)).body.isOffice).toBe(false);
    await http().get(`/v1/conversations/${office}/messages`).set(as('accountant')).expect(404);
    await http().put('/v1/conversations/settings').set(as('principal')).send({ officeRoles: ['not_a_role'] }).expect(400);
  });

  it('opens a class group whose roster follows the class, with admins-only posting', async () => {
    await http().post('/v1/chat/groups/linked').set(as('student')).send({ kind: 'section', id: t.section.id }).expect(403);
    await http().post('/v1/chat/groups/linked').set(as('teacher')).send({ kind: 'section', id: t.section.id, quietStart: '21:00' }).expect(400);
    const g = (await http().post('/v1/chat/groups/linked').set(as('teacher')).send({ kind: 'section', id: t.section.id, postPolicy: 'admins' }).expect(201)).body;
    expect(g.created).toBe(true);
    expect((await http().post('/v1/chat/groups/linked').set(as('teacher')).send({ kind: 'section', id: t.section.id }).expect(201)).body).toEqual({ id: g.id, created: false });
    await http().post('/v1/chat/groups/linked').set(as('outsider')).send({ kind: 'section', id: t.section.id }).expect(404);

    const threads = (await http().get('/v1/chat/threads').set(as('student')).expect(200)).body;
    expect(threads.find((x: { id: string }) => x.id === g.id)).toMatchObject({ linkedKind: 'section', postPolicy: 'admins', myRole: 'member' });
    await http().post(`/v1/chat/threads/${g.id}/messages`).set(as('student')).send({ body: 'Hello' }).expect(403);
    await http().post(`/v1/chat/threads/${g.id}/messages`).set(as('teacher')).send({ body: 'Test on Friday' }).expect(201);
    await http().patch(`/v1/chat/threads/${g.id}/settings`).set(as('student')).send({ postPolicy: 'all' }).expect(403);
    await http().patch(`/v1/chat/threads/${g.id}/settings`).set(as('teacher')).send({ postPolicy: 'all' }).expect(200);
    await http().post(`/v1/chat/threads/${g.id}/messages`).set(as('student')).send({ body: 'Which chapters?' }).expect(201);

    // The student moves to the other class: a sync takes them out.
    await owner.query('update students set section_id = $1 where id = $2', [t.otherSection.id, t.students[2].id]);
    expect((await http().post(`/v1/chat/threads/${g.id}/sync`).set(as('teacher')).expect(200)).body).toMatchObject({ removed: 1 });
    expect((await http().get('/v1/chat/threads').set(as('student')).expect(200)).body.find((x: { id: string }) => x.id === g.id)).toBeUndefined();
    await owner.query('update students set section_id = $1 where id = $2', [t.section.id, t.students[2].id]);
  });
});
