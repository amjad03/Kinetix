import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Mailer, type Mail } from '../src/analytics/mailer.js';
import { stripQuoted } from '../src/chat/chat.controller.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

const SECRET = 'inbound-secret-for-tests-0123';

describe('Staff chat: direct and group threads, attachments, receipts, external email/WhatsApp threads with inbound replies', () => {
  const owner = ownerPool();
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  const sent: Mail[] = [];
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tok: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tok[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;

  beforeAll(async () => {
    process.env.CHAT_INBOUND_SECRET = SECRET;
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock, (b) => b.overrideProvider(Mailer).useValue({ send: async (m: Mail) => void sent.push(m) }));
    tok.principal = await login(t.slug, t.principal.email!);
    tok.teacher = await login(t.slug, t.teacher.email!);
    tok.teacher2 = await login(t.slug, t.teacher2.email!);
    tok.guardian = await login(t.slug, t.guardian.email!);
    tok.outsider = await login(other.slug, other.principal.email!);
  });

  afterAll(async () => {
    delete process.env.CHAT_INBOUND_SECRET;
    await app.close();
    await owner.end();
  });

  let direct: string;
  let group: string;

  it('lists staff across roles (not families) and opens one direct thread per pair', async () => {
    const people = (await http().get('/v1/chat/people').set(as('principal')).expect(200)).body as { id: string; roles: string[] }[];
    expect(people.map((x) => x.id)).toContain(t.teacher.id);
    expect(people.map((x) => x.id)).not.toContain(t.guardian.id);
    await http().get('/v1/chat/people').set(as('guardian')).expect(403);
    const a = await http().post('/v1/chat/threads').set(as('principal')).send({ kind: 'direct', userId: t.teacher.id }).expect(201);
    const b = await http().post('/v1/chat/threads').set(as('teacher')).send({ kind: 'direct', userId: t.principal.id }).expect(201);
    expect(b.body.id).toBe(a.body.id);
    direct = a.body.id;
    await http().post('/v1/chat/threads').set(as('principal')).send({ kind: 'direct', userId: t.guardian.id }).expect(400);
  });

  it('sends messages with a scanned attachment, counts unread and records read receipts', async () => {
    await http().post(`/v1/chat/threads/${direct}/messages`).set(as('principal')).send({ body: 'Please share the IA marks' }).expect(201);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString('base64');
    const m = await http().post(`/v1/chat/threads/${direct}/messages`).set(as('principal')).send({ body: '', attachment: { filename: 'marks.png', contentType: 'image/png', contentBase64: png } }).expect(201);
    expect(m.body.attachment).toMatchObject({ name: 'marks.png', type: 'image/png' });
    await http().post(`/v1/chat/threads/${direct}/messages`).set(as('principal')).send({ body: '', attachment: { filename: 'x.png', contentType: 'image/png', contentBase64: Buffer.from('not a png').toString('base64') } }).expect(400);
    const list = (await http().get('/v1/chat/threads?filter=unread').set(as('teacher')).expect(200)).body;
    expect(list.find((x: { id: string }) => x.id === direct).unread).toBe(2);
    const file = await http().get(`/v1/chat/threads/${direct}/messages/${m.body.id}/attachment`).set(as('teacher')).expect(200);
    expect(file.headers['content-disposition']).toContain('marks.png');
    await http().post(`/v1/chat/threads/${direct}/typing`).set(as('teacher')).expect(204);
    await http().post(`/v1/chat/threads/${direct}/read`).set(as('teacher')).expect(204);
    const th = (await http().get(`/v1/chat/threads/${direct}`).set(as('principal')).expect(200)).body;
    expect(th.messages).toHaveLength(2);
    expect(th.members.find((x: { id: string }) => x.id === t.teacher.id).lastReadAt).toBeTruthy();
    expect((await http().get('/v1/chat/threads?filter=unread').set(as('teacher')).expect(200)).body).toHaveLength(0);
    // Not a member: not visible, not even to another tenant.
    await http().get(`/v1/chat/threads/${direct}`).set(as('teacher2')).expect(404);
    await http().get(`/v1/chat/threads/${direct}`).set(as('outsider')).expect(404);
  });

  it('runs group threads with pinning and added members', async () => {
    const g = await http().post('/v1/chat/threads').set(as('principal')).send({ kind: 'group', title: 'IQAC committee', userIds: [t.teacher.id] }).expect(201);
    group = g.body.id;
    expect(g.body.memberCount).toBe(2);
    await http().post(`/v1/chat/threads/${group}/members`).set(as('principal')).send({ userIds: [t.teacher2.id] }).expect(200);
    await http().post(`/v1/chat/threads/${group}/messages`).set(as('teacher2')).send({ body: 'Joined' }).expect(201);
    await http().post(`/v1/chat/threads/${group}/pin`).set(as('principal')).send({ pinned: true }).expect(200);
    const all = (await http().get('/v1/chat/threads').set(as('principal')).expect(200)).body;
    expect(all[0]).toMatchObject({ id: group, pinned: true });
    expect((await http().get('/v1/chat/threads?filter=groups').set(as('principal')).expect(200)).body.map((x: { id: string }) => x.id)).toEqual([group]);
  });

  it('emails an external contact with a reply-to address and maps the reply back into the thread', async () => {
    const e = await http().post('/v1/chat/threads').set(as('principal')).send({ kind: 'external', channel: 'email', contactName: 'Mr Rao', contactAddress: 'rao@parent.in', contactKind: 'parent', userIds: [t.teacher.id] }).expect(201);
    const ext = e.body.id as string;
    const out = await http().post(`/v1/chat/threads/${ext}/messages`).set(as('principal')).send({ body: 'Fee concession approved' }).expect(201);
    expect(out.body).toMatchObject({ direction: 'outbound', delivery: 'sent' });
    expect(sent.at(-1)!.to).toEqual(['rao@parent.in']);
    const replyTo = (await http().get(`/v1/chat/threads/${ext}`).set(as('principal')).expect(200)).body.thread.replyTo as string;
    expect(sent.at(-1)!.text).toContain(replyTo);
    // Wrong or missing secret: the endpoint does not exist.
    await http().post('/v1/chat/inbound').send({ channel: 'email', to: replyTo, from: 'rao@parent.in', body: 'Thanks' }).expect(404);
    // A forged token, and a sender who is not the contact.
    await http().post('/v1/chat/inbound').set('x-zynetix-inbound-secret', SECRET).send({ channel: 'email', to: replyTo.replace(/\.[A-Za-z0-9_-]+@/, '.AAAAAAAAAAAAAAAAAAAAAA@'), from: 'rao@parent.in', body: 'x' }).expect(404);
    await http().post('/v1/chat/inbound').set('x-zynetix-inbound-secret', SECRET).send({ channel: 'email', to: replyTo, from: 'someone@else.in', body: 'x' }).expect(403);
    const r = await http().post('/v1/chat/inbound').set('x-zynetix-inbound-secret', SECRET).send({ channel: 'email', to: `Zynetix <${replyTo}>`, from: 'Mr Rao <rao@parent.in>', body: 'Thank you, ma’am.\n\nOn Tue, Principal wrote:\n> Fee concession approved' }).expect(202);
    expect(r.body.threadId).toBe(ext);
    const th = (await http().get(`/v1/chat/threads/${ext}`).set(as('teacher')).expect(200)).body;
    expect(th.messages.at(-1)).toMatchObject({ direction: 'inbound', body: 'Thank you, ma’am.', externalFrom: 'Mr Rao <rao@parent.in>' });
    expect((await http().get('/v1/chat/threads?filter=external').set(as('teacher')).expect(200)).body[0]).toMatchObject({ id: ext, unread: 2, channel: 'email' });
  });

  it('queues WhatsApp messages until an account is connected and accepts inbound by number', async () => {
    const w = await http().post('/v1/chat/threads').set(as('principal')).send({ kind: 'external', channel: 'whatsapp', contactName: 'Book vendor', contactAddress: '+91 98450 12345', contactKind: 'vendor' }).expect(201);
    const out = await http().post(`/v1/chat/threads/${w.body.id}/messages`).set(as('principal')).send({ body: 'Please send the invoice' }).expect(201);
    expect(out.body.delivery).toBe('queued');
    const r = await http().post('/v1/chat/inbound').set('x-zynetix-inbound-secret', SECRET).send({ channel: 'whatsapp', tenantId: t.tenantId, from: '+919845012345', body: 'Sent' }).expect(202);
    expect(r.body.threadId).toBe(w.body.id);
    await http().post('/v1/chat/inbound').set('x-zynetix-inbound-secret', SECRET).send({ channel: 'whatsapp', tenantId: other.tenantId, from: '+919845012345', body: 'x' }).expect(404);
  });

  it('strips quoted history from replies', () => {
    expect(stripQuoted('Yes\n> old\nOn Mon, X wrote:\nmore')).toBe('Yes');
  });
});
