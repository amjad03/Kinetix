import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('campus depth: library, hostel work orders, canteen stock, retention, mentoring follow-up', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  // Tuesday 20 October 2026, 10:00 IST.
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(as(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(as(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(as(who)).send(body);
  const [A, B, C] = [0, 1, 2];
  const bin = (res: request.Response, cb: (e: Error | null, b: Buffer) => void) => {
    const d: Buffer[] = [];
    res.on('data', (c: Buffer) => d.push(c));
    res.on('end', () => cb(null, Buffer.concat(d)));
  };

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@cd.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
    return u;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    const lib = await addUser('Lata Librarian', 'librarian');
    const warden = await addUser('Wasim Warden', 'hostel_warden');
    const canteen = await addUser('Chandra Canteen', 'canteen_manager');
    const hod = await addUser('Hari Hod', 'hod');
    app = await createApp(clock);
    tokens = {
      lib: await login(t.slug, lib.email!),
      warden: await login(t.slug, warden.email!),
      canteen: await login(t.slug, canteen.email!),
      hod: await login(t.slug, hod.email!),
      principal: await login(t.slug, t.principal.email!),
      teacher: await login(t.slug, t.teacher.email!),
      student: await login(t.slug, t.studentUser.email!),
      parentA: await login(t.slug, t.guardian.email!),
      parentB: await login(t.slug, t.guardian2.email!),
    };
    Object.assign(ids, { warden: warden.id, hod: hod.id });
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('library', () => {
    const loan = async (book: string, student: number) => (await post('lib', '/v1/library/loans', { bookId: ids[book], studentId: t.students[student].id }).expect(201)).body as { id: string; dueOn: string };

    it('renews a loan twice, and not once somebody is waiting for the book', async () => {
      ids.accounts = (await post('lib', '/v1/library/books', { title: 'Corporate Accounting', author: 'Gupta', copies: 1 }).expect(201)).body.id;
      const l = await loan('accounts', C);
      expect(l.dueOn).toBe('2026-11-03');
      const first = (await post('student', `/v1/library/loans/${l.id}/renew`).expect(200)).body;
      expect(first).toMatchObject({ dueOn: '2026-11-17', renewCount: 1 });
      await post('parentA', `/v1/library/loans/${l.id}/renew`).expect(404); // not their child
      ids.loanC = l.id;
    });

    it('queues a reservation and holds the returned copy for the first in line', async () => {
      await post('parentA', '/v1/library/reservations', { bookId: ids.accounts, studentId: t.students[A].id }).expect(201);
      await post('parentA', '/v1/library/reservations', { bookId: ids.accounts, studentId: t.students[A].id }).expect(409);
      await post('parentB', '/v1/library/reservations', { bookId: ids.accounts, studentId: t.students[A].id }).expect(404);
      await post('student', `/v1/library/reservations`, { bookId: ids.accounts, studentId: t.students[C].id }).expect(409); // already has it
      await post('student', `/v1/library/loans/${ids.loanC}/renew`).expect(409); // reserved by another student
      const queue = (await get('lib', '/v1/library/reservations').expect(200)).body;
      expect(queue[0]).toMatchObject({ title: 'Corporate Accounting', status: 'waiting', position: 1 });

      await post('lib', `/v1/library/loans/${ids.loanC}/return`).expect(200);
      expect((await get('parentA', `/v1/library/reservations?studentId=${t.students[A].id}`).expect(200)).body[0]).toMatchObject({ status: 'ready' });
      await post('lib', '/v1/library/loans', { bookId: ids.accounts, studentId: t.students[B].id }).expect(400); // held for the student who reserved
      const mine = (await post('lib', '/v1/library/loans', { bookId: ids.accounts, studentId: t.students[A].id }).expect(201)).body;
      expect(mine.id).toBeTruthy();
      expect((await get('lib', '/v1/library/reservations').expect(200)).body).toHaveLength(0);
      ids.loanA = mine.id;
    });

    it('closes a lost or damaged book with a charge', async () => {
      ids.law = (await post('lib', '/v1/library/books', { title: 'Business Law', author: 'Kapoor', copies: 2 }).expect(201)).body.id;
      const l = await loan('law', B);
      await post('lib', `/v1/library/loans/${l.id}/lost`, { note: 'Lost on the bus' }).expect(400); // no price on record, no charge given
      const lost = (await post('lib', `/v1/library/loans/${l.id}/lost`, { note: 'Lost on the bus', amountPaise: 30_000 }).expect(200)).body;
      expect(lost).toMatchObject({ condition: 'lost', finePaise: 30_000 });
      expect(lost.returnedAt).not.toBeNull();
      expect((await get('lib', '/v1/library/books').expect(200)).body.find((b: { id: string }) => b.id === ids.law)).toMatchObject({ copies: 1 });
      const l2 = await loan('law', A);
      const dam = (await post('lib', `/v1/library/loans/${l2.id}/damaged`, { note: 'Water damage on 12 pages', amountPaise: 5_000 }).expect(200)).body;
      expect(dam).toMatchObject({ condition: 'damaged', finePaise: 5_000 });
      await post('lib', `/v1/library/loans/${l2.id}/damaged`, { note: 'Again' }).expect(409);
      await post('teacher', `/v1/library/loans/${l2.id}/lost`, { note: 'x y z' }).expect(403);
      expect((await get('lib', '/v1/library/fines').expect(200)).body.length).toBeGreaterThanOrEqual(2);
    });

    it('labels books with an accession code and finds a book from a scan', async () => {
      expect((await post('lib', '/v1/library/books/barcodes/assign').expect(200)).body).toEqual({ assigned: 2 });
      expect((await post('lib', '/v1/library/books/barcodes/assign').expect(200)).body).toEqual({ assigned: 0 });
      const doc = (await get('lib', '/v1/library/books/labels.pdf').buffer().parse(bin).expect(200)).body as Buffer;
      expect(doc.subarray(0, 5).toString()).toBe('%PDF-');
      expect(doc.toString('latin1')).toContain('LB000001');
      const scan = (await get('lib', '/v1/library/scan/LB000001').expect(200)).body;
      expect(scan.book.title).toBe('Corporate Accounting');
      expect(scan).toMatchObject({ available: 0 });
      expect(scan.loans[0]).toMatchObject({ student: 'Student A' });
      await get('lib', '/v1/library/scan/NOPE').expect(404);
      await get('student', '/v1/library/scan/LB000001').expect(403);
    });

    it('registers e-resources, limits seats and keeps an access log', async () => {
      const body = { title: 'Indian Journal of Accounting', kind: 'journal', publisher: 'IAA', url: 'https://example.org/ija', seats: 1 };
      await post('student', '/v1/library/eresources', body).expect(403);
      await post('lib', '/v1/library/eresources', { ...body, url: 'not a link' }).expect(400);
      const er = (await post('lib', '/v1/library/eresources', body).expect(201)).body;
      ids.er = er.id;
      const old = (await post('lib', '/v1/library/eresources', { ...body, title: 'Expired database', licenceUntil: '2026-09-30', seats: null }).expect(201)).body;
      expect((await post('student', `/v1/library/eresources/${er.id}/open`).expect(200)).body.url).toBe('https://example.org/ija');
      await post('parentA', `/v1/library/eresources/${er.id}/open`).expect(409); // the one seat is taken
      await post('student', `/v1/library/eresources/${er.id}/open`).expect(200); // the same reader again is fine
      clock.at = new Date('2026-10-20T05:30:00Z');
      await post('parentA', `/v1/library/eresources/${er.id}/open`).expect(200); // an hour later the seat is free
      await post('student', `/v1/library/eresources/${old.id}/open`).expect(409); // licence ended
      clock.at = new Date('2026-10-20T04:30:00Z');

      const log = (await get('lib', `/v1/library/eresources/${er.id}/access`).expect(200)).body;
      expect(log).toHaveLength(3);
      expect(log.map((x: { name: string }) => x.name)).toEqual(expect.arrayContaining([t.studentUser.fullName]));
      await get('student', `/v1/library/eresources/${er.id}/access`).expect(403);
      const desk = (await get('lib', '/v1/library/eresources').expect(200)).body;
      expect(desk.find((x: { id: string }) => x.id === er.id)).toMatchObject({ opens: 3, readers: 2 });
      expect(desk.find((x: { id: string }) => x.id === old.id)).toMatchObject({ licenceExpired: true });
      await post('lib', `/v1/library/eresources/${old.id}/retire`).expect(200);
      const open = (await get('student', '/v1/library/eresources').expect(200)).body;
      expect(open.map((x: { id: string }) => x.id)).toEqual([er.id]);
      expect(open[0].opens).toBeUndefined();
    });

    it('links books and e-resources to curriculum topics, for teachers and students to see', async () => {
      const [topic] = (await owner.query('select id, title from topics limit 1')).rows as { id: string; title: string }[];
      expect(topic).toBeTruthy();
      await post('student', '/v1/library/topic-links', { topicId: topic.id, resourceKind: 'book', resourceId: ids.accounts }).expect(403);
      await post('teacher', '/v1/library/topic-links', { topicId: topic.id, resourceKind: 'book', resourceId: '00000000-0000-4000-8000-000000000000' }).expect(404);
      const link = (await post('teacher', '/v1/library/topic-links', { topicId: topic.id, resourceKind: 'book', resourceId: ids.accounts }).expect(201)).body;
      await post('teacher', '/v1/library/topic-links', { topicId: topic.id, resourceKind: 'book', resourceId: ids.accounts }).expect(409);
      await post('lib', '/v1/library/topic-links', { topicId: topic.id, resourceKind: 'eresource', resourceId: ids.er }).expect(201);
      const res = (await get('student', `/v1/library/topics/${topic.id}/resources`).expect(200)).body;
      expect(res.books.map((b: { title: string }) => b.title)).toEqual(['Corporate Accounting']);
      expect(res.eresources.map((e: { title: string }) => e.title)).toEqual(['Indian Journal of Accounting']);
      expect((await get('lib', `/v1/library/topics?q=${encodeURIComponent(topic.title.slice(0, 4))}`).expect(200)).body.length).toBeGreaterThanOrEqual(1);
      await http().delete(`/v1/library/topic-links/${link.id}`).set(as('teacher')).expect(200);
      expect((await get('student', `/v1/library/topics/${topic.id}/resources`).expect(200)).body.books).toEqual([]);
    });
  });

  describe('hostel work orders', () => {
    it('turns a complaint into a work order, and closes the complaint when the warden accepts the repair', async () => {
      const [c] = await db.insert(s.hostelComplaints).values({ tenantId: t.tenantId, studentId: t.students[C].id, raisedBy: t.studentUser.id, category: 'plumbing', description: 'Tap in room 12 leaks' }).returning();
      await post('student', '/v1/hostel/work-orders', { complaintId: c.id, title: 'Fix the tap' }).expect(403);
      const wo = (await post('warden', '/v1/hostel/work-orders', { complaintId: c.id, title: 'Fix the tap in room 12', category: 'plumbing', priority: 'high', dueOn: '2026-10-22' }).expect(201)).body;
      expect(wo.status).toBe('open');
      await post('warden', '/v1/hostel/work-orders', { complaintId: c.id, title: 'Again' }).expect(409);
      await post('warden', `/v1/hostel/work-orders/${wo.id}/complete`, { costPaise: 0 }).expect(409); // not started
      expect((await post('warden', `/v1/hostel/work-orders/${wo.id}/assign`, { assigneeName: 'Raju Plumber', dueOn: '2026-10-21' }).expect(200)).body).toMatchObject({ status: 'assigned', assigneeName: 'Raju Plumber', dueOn: '2026-10-21' });
      await post('warden', `/v1/hostel/work-orders/${wo.id}/start`).expect(200);
      expect((await get('student', '/v1/hostel/work-orders/mine').expect(200)).body[0]).toMatchObject({ title: 'Fix the tap in room 12', status: 'in_progress' });
      expect((await post('warden', `/v1/hostel/work-orders/${wo.id}/complete`, { costPaise: 45_000, note: 'Washer replaced' }).expect(200)).body).toMatchObject({ status: 'done', costPaise: 45_000 });
      expect((await post('warden', `/v1/hostel/work-orders/${wo.id}/verify`, { ok: false, note: 'Still dripping' }).expect(200)).body.status).toBe('reopened');
      await post('warden', `/v1/hostel/work-orders/${wo.id}/start`).expect(200);
      await post('warden', `/v1/hostel/work-orders/${wo.id}/complete`, { costPaise: 60_000 }).expect(200);
      expect((await post('warden', `/v1/hostel/work-orders/${wo.id}/verify`, { ok: true }).expect(200)).body).toMatchObject({ status: 'verified' });
      const [done] = await db.select().from(s.hostelComplaints).where(eq(s.hostelComplaints.tenantId, t.tenantId));
      expect(done).toMatchObject({ status: 'resolved' });
      expect(done.resolvedAt).not.toBeNull();
      clock.at = new Date('2026-10-30T04:30:00Z');
      expect((await get('warden', '/v1/hostel/work-orders?status=verified').expect(200)).body).toHaveLength(1);
      clock.at = new Date('2026-10-20T04:30:00Z');
    });
  });

  describe('canteen stock and feedback', () => {
    it('ties purchases to vendors, draws use from the store, and reports wastage', async () => {
      const [vendor] = await db.insert(s.invVendors).values({ tenantId: t.tenantId, name: 'Fresh Farms' }).returning();
      const [store] = await db.insert(s.invStores).values({ tenantId: t.tenantId, name: 'Main store' }).returning();
      const [item] = await db.insert(s.invItems).values({ tenantId: t.tenantId, sku: 'RICE', name: 'Rice', unit: 'kg' }).returning();
      await db.insert(s.invStock).values({ tenantId: t.tenantId, storeId: store.id, itemId: item.id, qty: 100 });

      await get('student', '/v1/canteen/ops/options').expect(403);
      const opts = (await get('canteen', '/v1/canteen/ops/options').expect(200)).body;
      expect(opts.vendors.map((v: { name: string }) => v.name)).toEqual(['Fresh Farms']);
      expect(opts.items.map((i: { name: string }) => i.name)).toEqual(['Rice']);
      await post('student', '/v1/canteen/ops/stock', { kind: 'use', loggedOn: '2026-10-19', itemName: 'Rice', quantity: 5 }).expect(403);
      await post('canteen', '/v1/canteen/ops/stock', { kind: 'purchase', loggedOn: '2026-10-18', itemName: 'Rice', quantity: 50, vendorId: vendor.id }).expect(400); // a purchase needs its cost
      await post('canteen', '/v1/canteen/ops/stock', { kind: 'waste', loggedOn: '2026-10-19', itemName: 'Rice', quantity: 2, reason: '' }).expect(400);
      await post('canteen', '/v1/canteen/ops/stock', { kind: 'purchase', loggedOn: '2026-10-18', itemName: 'Rice', quantity: 50, unit: 'kg', costPaise: 300_000, vendorId: vendor.id, invItemId: item.id }).expect(201);
      await post('canteen', '/v1/canteen/ops/stock', { kind: 'use', loggedOn: '2026-10-19', meal: 'lunch', itemName: 'Rice', quantity: 18, invItemId: item.id, issueFromStore: true }).expect(201);
      await post('canteen', '/v1/canteen/ops/stock', { kind: 'waste', loggedOn: '2026-10-19', meal: 'lunch', itemName: 'Rice', quantity: 2, reason: 'Left on plates' }).expect(201);
      await post('canteen', '/v1/canteen/ops/stock', { kind: 'use', loggedOn: '2026-10-19', itemName: 'Rice', quantity: 500, invItemId: item.id, issueFromStore: true }).expect(409); // the store has 82
      await post('canteen', '/v1/canteen/ops/stock', { kind: 'use', loggedOn: '2026-10-19', itemName: 'Rice', quantity: 1.5, invItemId: item.id, issueFromStore: true }).expect(400);
      const [stock] = await db.select().from(s.invStock).where(eq(s.invStock.tenantId, t.tenantId));
      expect(stock.qty).toBe(82); // 100 less the 18 used
      expect((await owner.query("select delta, issued_to from inv_stock_moves where item_id = $1 and ref_type = 'canteen_stock_log'", [item.id])).rows).toEqual([{ delta: -18, issued_to: 'Canteen' }]);

      const sum = (await get('canteen', '/v1/canteen/ops/summary?from=2026-10-01&to=2026-10-31').expect(200)).body;
      expect(sum.items[0]).toMatchObject({ item: 'Rice', purchased: 50, used: 18, wasted: 2, balance: 30, wastePercent: 10, spendPaise: 300_000 });
      expect(sum.meals.find((m: { meal: string }) => m.meal === 'lunch')).toMatchObject({ used: 18, wasted: 2, wastePercent: 10 });
      expect(sum.vendors[0]).toMatchObject({ name: 'Fresh Farms', spendPaise: 300_000 });
    });

    it('collects meal ratings, one per person per meal, and reports them without names', async () => {
      await post('student', '/v1/canteen/ops/feedback', { mealDate: '2026-10-21', meal: 'lunch', rating: 4 }).expect(400); // not served yet
      await post('student', '/v1/canteen/ops/feedback', { mealDate: '2026-10-19', meal: 'lunch', rating: 6 }).expect(400);
      await post('student', '/v1/canteen/ops/feedback', { mealDate: '2026-10-19', meal: 'lunch', rating: 2, comment: 'Rice was undercooked' }).expect(201);
      await post('student', '/v1/canteen/ops/feedback', { mealDate: '2026-10-19', meal: 'lunch', rating: 3, comment: 'Better on the second look' }).expect(201); // replaces
      await post('parentA', '/v1/canteen/ops/feedback', { mealDate: '2026-10-19', meal: 'lunch', rating: 5 }).expect(201);
      const rep = (await get('canteen', '/v1/canteen/ops/feedback').expect(200)).body;
      expect(rep.total).toBe(2);
      expect(rep.meals.find((m: { meal: string }) => m.meal === 'lunch')).toMatchObject({ count: 2, average: 4 });
      expect(rep.comments).toEqual([expect.objectContaining({ comment: 'Better on the second look', rating: 3 })]);
      await get('student', '/v1/canteen/ops/feedback').expect(403);
    });
  });

  describe('retention of sensitive records', () => {
    it('removes health and counselling records past the retention period', async () => {
      await db.insert(s.healthVisits).values([
        { tenantId: t.tenantId, studentId: t.students[A].id, visitedAt: new Date('2024-01-10T05:00:00Z'), complaint: 'Fever', action: 'Rest', recordedBy: t.principal.id },
        { tenantId: t.tenantId, studentId: t.students[A].id, visitedAt: new Date('2026-10-01T05:00:00Z'), complaint: 'Headache', action: 'Water', recordedBy: t.principal.id },
      ]);
      await db.insert(s.counsellingSessions).values({ tenantId: t.tenantId, studentId: t.students[B].id, requestedBy: t.principal.id, reason: 'Exam stress', status: 'completed', confidentialNotes: 'Private notes', createdAt: new Date('2023-12-01T05:00:00Z') });

      await get('teacher', '/v1/retention/rules').expect(403);
      expect((await get('principal', '/v1/retention/rules').expect(200)).body.map((r: { dataClass: string; active: boolean }) => [r.dataClass, r.active])).toEqual([['health_visits', false], ['counselling', false]]);
      await put('principal', '/v1/retention/rules/health_visits', { retainMonths: 3, action: 'delete', active: true }).expect(400); // not shorter than six months
      await put('principal', '/v1/retention/rules/grades', { retainMonths: 12, action: 'delete', active: true }).expect(400);
      await put('principal', '/v1/retention/rules/health_visits', { retainMonths: 24, action: 'delete', active: true }).expect(200);
      await put('principal', '/v1/retention/rules/counselling', { retainMonths: 24, action: 'redact', active: true }).expect(200);
      const rules = (await get('principal', '/v1/retention/rules').expect(200)).body;
      expect(rules.map((r: { dueNow: number }) => r.dueNow)).toEqual([1, 1]);

      expect((await post('principal', '/v1/retention/run').expect(200)).body.processed).toEqual({ health_visits: 1, counselling: 1 });
      expect((await db.select().from(s.healthVisits).where(eq(s.healthVisits.tenantId, t.tenantId))).map((v) => v.complaint)).toEqual(['Headache']);
      const [session] = await db.select().from(s.counsellingSessions).where(eq(s.counsellingSessions.tenantId, t.tenantId));
      expect(session).toMatchObject({ reason: '', confidentialNotes: null, status: 'completed' }); // the session stays, its content goes
      expect((await post('principal', '/v1/retention/run').expect(200)).body.processed).toEqual({ health_visits: 0, counselling: 0 });
      const audit = (await owner.query("select count(*)::int as n from audit_log where tenant_id = $1 and action = 'retention.sensitive_applied'", [t.tenantId])).rows[0].n;
      expect(audit).toBe(2);
    });
  });

  describe('mentoring follow-up', () => {
    it('reads assignments, outcomes and skills into the risk, and measures a plan again at review', async () => {
      await post('hod', '/v1/mentoring/assignments', { studentId: t.students[C].id, mentorUserId: t.teacher.id }).expect(201);
      const [hw1, hw2] = await db.insert(s.homework).values([
        { tenantId: t.tenantId, sectionId: t.section.id, subjectId: t.subject.id, createdBy: t.teacher.id, title: 'Ledger practice', dueOn: '2026-10-10' },
        { tenantId: t.tenantId, sectionId: t.section.id, subjectId: t.subject.id, createdBy: t.teacher.id, title: 'Trial balance', dueOn: '2026-10-12' },
      ]).returning();
      const risk = (await get('hod', '/v1/mentoring/risk?all=true').expect(200)).body as { studentId: string; signals: { kind: string; value: number }[]; score: number }[];
      const mine = risk.find((r) => r.studentId === t.students[C].id)!;
      expect(mine.signals).toEqual(expect.arrayContaining([{ kind: 'assignments', value: 2 }]));

      const plan = (await post('teacher', '/v1/mentoring/plans', { studentId: t.students[C].id, goal: 'Catch up on practice work', actions: ['Daily ledger practice'], reviewOn: '2026-11-03' }).expect(201)).body;
      const prog = (await get('teacher', `/v1/mentoring/plans/${plan.id}/progress`).expect(200)).body;
      expect(prog.reassessment).toMatchObject({ scoreBefore: mine.score, scoreAfter: null, outcome: null });

      await post('student', `/v1/mentoring/plans/${plan.id}/support`, { kind: 'tutoring', title: 'x y z' }).expect(403);
      await post('hod', `/v1/mentoring/plans/${plan.id}/support`, { kind: 'tutoring', title: 'Peer tutoring on Fridays' }).expect(201); // admins may help
      const support = (await post('teacher', `/v1/mentoring/plans/${plan.id}/support`, { kind: 'content', title: 'Revise ledger posting', ref: 'topic:ledger', dueOn: '2026-10-30' }).expect(201)).body;
      expect((await get('student', '/v1/mentoring/my-support').expect(200)).body.map((x: { title: string }) => x.title).sort()).toEqual(['Peer tutoring on Fridays', 'Revise ledger posting']);
      await post('student', `/v1/mentoring/support/${support.id}/done`).expect(403);
      await post('teacher', `/v1/mentoring/support/${support.id}/done`).expect(200);
      expect((await get('student', '/v1/mentoring/my-support').expect(200)).body).toHaveLength(1);

      // The student hands the work in; the next measurement shows the change.
      await db.insert(s.homeworkSubmissions).values([hw1, hw2].map((h) => ({ tenantId: t.tenantId, homeworkId: h.id, studentId: t.students[C].id, text: 'Done', submittedBy: t.studentUser.id, submittedAt: new Date('2026-10-20T03:00:00Z') })));
      const re = (await post('teacher', `/v1/mentoring/plans/${plan.id}/reassess`).expect(200)).body;
      expect(re).toMatchObject({ outcome: 'improved' });
      expect(re.scoreAfter).toBeLessThan(re.scoreBefore);
      const closed = (await post('teacher', `/v1/mentoring/plans/${plan.id}/close`, { outcome: 'Work is up to date again', outcomeRating: 'improved' }).expect(200)).body;
      expect(closed.reassessment).toMatchObject({ outcome: 'improved' });
      await post('teacher', `/v1/mentoring/plans/${plan.id}/support`, { kind: 'other', title: 'Too late for this' }).expect(409);
    });
  });
});
