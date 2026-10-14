import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeIso2709 } from '../src/library/marc.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

const binary = (res: request.Response, cb: (e: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

/**
 * Library depth: the catalogue and accession register as record lists (add with copies, edit with history, bin and
 * restore, import, export), members and categories with their rules, issue and return by code (desk, kit, drop box,
 * self-checkout, wrong branch), fine waivers with approval, fines to fees, acquisitions against budgets, periodicals,
 * the repository, inter-library loans, the gate, MARC21, the OPAC and alerts, no-dues, permissions and isolation.
 */
describe('library depth', () => {
  const owner = ownerPool();
  const clock = new FixedClock(new Date());
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const post = (who: string, path: string, body: object = {}) => http().post(path).set(as(who)).send(body);
  const get = (who: string, path: string) => http().get(path).set(as(who));
  const action = (who: string, entity: string, id: string, name: string, params?: object) => post(who, `/v1/records/${entity}/bulk`, { op: 'action', action: name, target: { ids: [id] }, ...(params && { params }) });

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    const hash = await argon2.hash('pw');
    const { rows } = await owner.query(`insert into users (tenant_id, full_name, email, password_hash) values ($1, 'Lata Librarian', $2, $3) returning id`, [t.tenantId, `lib-${t.slug}@x.in`, hash]);
    await owner.query(`insert into user_roles (tenant_id, user_id, role, campus_id) values ($1, $2, 'librarian', $3)`, [t.tenantId, rows[0].id, t.campus.id]);
    ids.librarian = rows[0].id;
    tokens.lib = await login(t.slug, `lib-${t.slug}@x.in`);
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.student = await login(t.slug, t.studentUser.email!);
    tokens.parent = await login(t.slug, t.guardian.email!);
    tokens.outsider = await login(other.slug, other.principal.email!);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  it('catalogues titles with an accession number per copy, edits with history, duplicates, and guards roles', async () => {
    const meta = (await get('lib', '/v1/records/library-books/meta').expect(200)).body;
    expect(meta).toMatchObject({ key: 'library-books', module: 'library', can: { write: true, import: true, duplicate: true, create: true } });
    await post('lib', '/v1/records/library-books', { title: 'Bad ISBN', isbn: '9780306406158', copies: 1 }).expect(400);
    const main = (await post('lib', '/v1/records/library-branches', { name: 'Main library', isMain: true }).expect(201)).body;
    const annex = (await post('lib', '/v1/records/library-branches', { name: 'Science annex' }).expect(201)).body;
    ids.main = main.id;
    ids.annex = annex.id;
    const b = (await post('lib', '/v1/records/library-books', { title: 'Corporate Accounting', author: 'Maheshwari, S. N.', isbn: '0-306-40615-2', ddc: '657.95', subject: 'Accounting', price: 650, copies: 3 }).expect(201)).body;
    ids.book = b.id;
    expect(b).toMatchObject({ isbn: '9780306406157', copies: 3, available: 3, onLoan: 0, priceRupees: 650 });
    const copies = (await get('lib', `/v1/records/library-copies?f.book=${b.id}&sort=accession:asc`).expect(200)).body.rows;
    expect(copies.map((c: { accessionNo: string; branchName: string }) => [c.accessionNo, c.branchName])).toEqual([
      ['ACC-0001', 'Main library'],
      ['ACC-0002', 'Main library'],
      ['ACC-0003', 'Main library'],
    ]);
    ids.copy1 = copies[0].id;
    ids.copy2 = copies[1].id;
    ids.copy3 = copies[2].id;
    // Call number from the DDC number and the author; history shows the change.
    expect((await action('lib', 'library-books', b.id, 'assignCallNo').expect(200)).body.rows[0]).toMatchObject({ ok: true, message: '657.95 MAH' });
    await http().patch(`/v1/records/library-books/${b.id}`).set(as('lib')).send({ edition: '7th', price: 700 }).expect(200);
    const h = (await get('lib', `/v1/records/library-books/${b.id}/history`).expect(200)).body.items;
    expect(h[0]).toMatchObject({ action: 'library_book.updated', changes: expect.arrayContaining([{ field: 'price', label: 'Price (₹)', before: 650, after: 700 }]) });
    const dup = (await post('lib', `/v1/records/library-books/${b.id}/duplicate`).expect(201)).body;
    expect(dup).toMatchObject({ title: 'Corporate Accounting (copy)', copies: 0, isbn: null });
    await post('teacher', '/v1/records/library-books', { title: 'x', copies: 1 }).expect(403);
    await get('teacher', '/v1/records/library-books').expect(403);
    expect((await get('outsider', '/v1/records/library-books').expect(200)).body.total).toBe(0);
    // Add copies to another branch.
    expect((await action('lib', 'library-books', b.id, 'addCopies', { count: 1, branchId: annex.id }).expect(200)).body.rows[0].message).toBe('ACC-0004');
    expect((await get('lib', `/v1/records/library-books/${b.id}`).expect(200)).body).toMatchObject({ copies: 4, available: 4 });
  });

  it('keeps member categories and members with their rules, cards and deposits', async () => {
    const staffCat = (await post('lib', '/v1/records/library-member-categories', { name: 'Faculty', kind: 'staff', loanDays: 30, maxBooks: 2, fine: 1, maxRenewals: 3, canReserve: true }).expect(201)).body;
    const stuCat = (await post('lib', '/v1/records/library-member-categories', { name: 'UG students', kind: 'student', loanDays: 14, maxBooks: 1, fine: 2 }).expect(201)).body;
    ids.stuCat = stuCat.id;
    const bbCat = (await post('lib', '/v1/records/library-member-categories', { name: 'Book bank (SC/ST)', kind: 'book_bank', loanDays: 150, maxBooks: 4, fine: 0 }).expect(201)).body;
    ids.bbCat = bbCat.id;
    const staff = (await post('lib', '/v1/records/library-members', { kind: 'staff', userId: t.teacher.id, categoryId: staffCat.id }).expect(201)).body;
    expect(staff).toMatchObject({ kind: 'staff', fullName: expect.any(String), cardNo: 'MEM-0001', categoryName: 'Faculty' });
    await post('lib', '/v1/records/library-members', { kind: 'staff', userId: t.teacher.id }).expect(409);
    const ext = (await post('lib', '/v1/records/library-members', { kind: 'external', fullName: 'Dr. R. Iyer', organisation: 'Alumni association', phone: '9800000000' }).expect(201)).body;
    await post('lib', '/v1/records/library-members', { kind: 'external' }).expect(400);
    ids.staffCard = staff.cardNo;
    ids.extMember = ext.id;
    // Deposit for the external reader.
    await action('lib', 'library-members', ext.id, 'collectDeposit', { amount: 1000, receipt: 'R-77' }).expect(200);
    expect((await action('lib', 'library-members', ext.id, 'collectDeposit', { amount: 1000 }).expect(200)).body.rows[0]).toMatchObject({ ok: false });
    // Enrol the class: every student gets a card in the student category.
    expect((await post('lib', '/v1/library/members/enrol', { sectionId: t.section.id, categoryId: stuCat.id }).expect(200)).body).toEqual({ enrolled: 3 });
    const list = (await get('lib', '/v1/records/library-members?f.kind=student&sort=name:asc').expect(200)).body;
    expect(list.total).toBe(3);
    expect(list.rows[0]).toMatchObject({ fullName: 'Student A', rollNo: 'R1', className: 'BCom Sem 3 A', categoryName: 'UG students' });
    ids.cardA = list.rows[0].cardNo;
    ids.memberA = list.rows[0].id;
    ids.cardC = list.rows[2].cardNo;
    // Move (change category) in bulk.
    const moved = (await post('lib', '/v1/records/library-members/bulk', { op: 'move', target: { ids: [list.rows[1].id] }, to: bbCat.id }).expect(200)).body;
    expect(moved).toMatchObject({ succeeded: 1 });
    ids.cardB = list.rows[1].cardNo;
  });

  it('issues by code under the member’s rules, blocks on dues, returns at the wrong branch, and renews', async () => {
    // Kit "add" is issue: by accession number and card (or roll number).
    const loan = (await post('lib', '/v1/records/library-loans', { copyCode: 'ACC-0001', memberCode: ids.cardA }).expect(201)).body;
    expect(loan).toMatchObject({ title: 'Corporate Accounting', accessionNo: 'ACC-0001', borrower: 'Student A', status: 'out' });
    ids.loanA = loan.id;
    // The UG category allows one book at a time.
    const second = (await post('lib', '/v1/library/desk/issue', { memberCode: 'R1', copyCodes: ['ACC-0002'] }).expect(200)).body;
    expect(second.results[0]).toMatchObject({ ok: false, message: 'This member can borrow 1 books at a time' });
    await post('lib', '/v1/records/library-loans', { copyCode: 'ACC-0001', memberCode: ids.staffCard }).expect(409); // already out
    // Staff member borrows two at the desk; a third is refused.
    const staffIssue = (await post('lib', '/v1/library/desk/issue', { memberCode: ids.staffCard, copyCodes: ['ACC-0002', 'ACC-0003', 'ACC-0004'] }).expect(200)).body.results;
    expect(staffIssue.map((r: { ok: boolean }) => r.ok)).toEqual([true, true, false]);
    // Lookup shows what the member has.
    const look = (await get('lib', `/v1/library/desk/lookup?code=${ids.staffCard}`).expect(200)).body;
    expect(look.member).toMatchObject({ out: 2, loans: expect.arrayContaining([expect.objectContaining({ accessionNo: 'ACC-0002' })]) });
    // Return ACC-0002 at the annex: the copy belongs to the main library, so it is in transit.
    const back = (await post('lib', '/v1/library/desk/return', { copyCodes: ['ACC-0002', 'NOPE'], branchId: ids.annex }).expect(200)).body.results;
    expect(back[0]).toMatchObject({ ok: true, inTransit: true, finePaise: 0 });
    expect(back[1]).toMatchObject({ ok: false });
    await post('lib', '/v1/records/library-loans', { copyCode: 'ACC-0002', memberCode: ids.cardC }).expect(409); // in transit
    expect((await action('lib', 'library-copies', ids.copy2, 'receive').expect(200)).body.succeeded).toBe(1);
    // Renew through the record list.
    const renewed = (await action('lib', 'library-loans', ids.loanA, 'renew').expect(200)).body.rows[0];
    expect(renewed).toMatchObject({ ok: true, message: expect.stringMatching(/^Due \d{4}-\d{2}-\d{2}$/) });
    // A blocked card cannot borrow.
    await action('lib', 'library-members', ids.extMember, 'block', { reason: 'Lost book not replaced' }).expect(200);
    await post('lib', '/v1/records/library-loans', { copyCode: 'ACC-0002', memberCode: (await get('lib', `/v1/records/library-members/${ids.extMember}`)).body.cardNo }).expect(409);
    await action('lib', 'library-members', ids.extMember, 'unblock').expect(200);
  });

  it('fines late returns from the drop box by the time dropped, waives with approval, and collects with fees', async () => {
    // Make the loan four days overdue, then return it through the drop box as of yesterday.
    const due = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
    await owner.query(`update library_loans set issued_at = now() - interval '20 days' where id = $1`, [ids.loanA]);
    await http().patch(`/v1/records/library-loans/${ids.loanA}`).set(as('lib')).send({ dueOn: due }).expect(200);
    expect((await get('lib', `/v1/records/library-loans?f.status=overdue`).expect(200)).body.total).toBe(1);
    const dropped = new Date(Date.now() - 86_400_000).toISOString();
    const r = (await post('lib', '/v1/library/dropbox', { codes: ['ACC-0001'], droppedAt: dropped }).expect(200)).body.results[0];
    expect(r).toMatchObject({ ok: true, finePaise: 4 * 200 }); // ₹2 a day for 4 days (to the drop day)
    const row = (await get('lib', `/v1/records/library-loans/${ids.loanA}`).expect(200)).body;
    expect(row).toMatchObject({ status: 'returned', returnedVia: 'dropbox', fineRupees: 8, unpaidRupees: 8 });
    // Unpaid fines from ₹5 (library settings) block the next issue.
    await http().put('/v1/module-settings/library').set(as('principal')).send({ rules: { blockIssueAtFinePaise: 500 } }).expect(200);
    await post('lib', '/v1/records/library-loans', { copyCode: 'ACC-0001', memberCode: ids.cardA }).expect(409);
    // The librarian asks; only the principal decides.
    await action('lib', 'library-loans', ids.loanA, 'requestWaiver', { amount: 10, reason: 'Hospitalised' }).expect(200).then((x) => expect(x.body.rows[0].ok).toBe(false));
    expect((await action('lib', 'library-loans', ids.loanA, 'requestWaiver', { amount: 3, reason: 'Hospitalised' }).expect(200)).body.succeeded).toBe(1);
    const w = (await get('lib', '/v1/records/library-fine-waivers?f.status=pending').expect(200)).body.rows[0];
    await action('lib', 'library-fine-waivers', w.id, 'approve').expect(403);
    expect((await action('principal', 'library-fine-waivers', w.id, 'approve').expect(200)).body.succeeded).toBe(1);
    expect((await get('lib', `/v1/records/library-loans/${ids.loanA}`).expect(200)).body).toMatchObject({ waivedRupees: 3, unpaidRupees: 5 });
    // The rest goes on the fee account.
    const sent = (await action('lib', 'library-loans', ids.loanA, 'sendToFees').expect(200)).body.rows[0];
    expect(sent).toMatchObject({ ok: true, message: expect.stringContaining('Library fine') });
    const inv = (await owner.query(`select amount_paise from fee_invoices where student_id = $1 and title like 'Library fine%'`, [t.students[0].id])).rows;
    expect(inv.map((x: { amount_paise: string | number }) => Number(x.amount_paise))).toEqual([500]);
    expect((await action('lib', 'library-loans', ids.loanA, 'finePaid').expect(200)).body.rows[0].ok).toBe(false); // already settled
    // Now the student can borrow again; a lost book closes the loan with its price.
    const l2 = (await post('lib', '/v1/records/library-loans', { copyCode: 'ACC-0001', memberCode: ids.cardA }).expect(201)).body;
    const lost = (await action('lib', 'library-loans', l2.id, 'lost', { note: 'Lost on the bus' }).expect(200)).body.rows[0];
    expect(lost).toMatchObject({ ok: true, message: 'Fine ₹650.00' });
    expect((await get('lib', `/v1/records/library-copies/${ids.copy1}`).expect(200)).body.status).toBe('lost');
  });

  it('runs book bank, self-checkout, the gate and no-dues', async () => {
    // Book bank: only for a member in a book bank category, for the whole semester, no renewals.
    await post('lib', '/v1/library/desk/issue', { memberCode: ids.cardC, copyCodes: ['ACC-0002'], bookBank: true }).expect(409);
    const bb = (await post('lib', '/v1/library/desk/issue', { memberCode: ids.cardB, copyCodes: ['ACC-0002'], bookBank: true }).expect(200)).body.results[0];
    expect(bb.ok).toBe(true);
    expect(bb.dueOn > new Date(Date.now() + 140 * 86_400_000).toISOString().slice(0, 10)).toBe(true);
    expect((await action('lib', 'library-loans', bb.loanId, 'renew').expect(200)).body.rows[0].ok).toBe(false);
    // Self-checkout by student C (their own card).
    await post('lib', '/v1/library/self-checkout', { copyCode: 'ACC-0004' }).expect(403);
    const self = (await post('student', '/v1/library/self-checkout', { copyCode: 'ACC-0004' }).expect(201)).body;
    expect(self).toMatchObject({ title: 'Corporate Accounting' });
    // Gate: swipe in and out; the footfall report counts it.
    expect((await post('lib', '/v1/library/gate/swipe', { memberCode: ids.cardA }).expect(200)).body.direction).toBe('in');
    expect((await post('lib', '/v1/library/gate/swipe', { memberCode: ids.cardA }).expect(200)).body.direction).toBe('out');
    await post('lib', '/v1/records/library-gate', { visitorName: 'Inspector', purpose: 'reference' }).expect(201);
    await post('lib', '/v1/records/library-gate', { purpose: 'reading' }).expect(400);
    const foot = (await get('lib', '/v1/ops-reports/library.footfall').expect(200)).body.rows;
    expect(foot[0]).toMatchObject({ visits: 2, members: 1, visitors: 1 });
    // No-dues: student C has a book out; student A owes nothing once the lost-book fine is paid.
    expect((await get('student', `/v1/library/no-dues/${t.students[2].id}`).expect(200)).body).toMatchObject({ clear: false, booksOut: 1 });
    await get('parent', `/v1/library/no-dues/${t.students[2].id}`).expect(404);
    await post('lib', `/v1/library/no-dues/${t.students[0].id}/clear`, { purpose: 'TC' }).expect(409);
    const lostLoan = (await get('lib', `/v1/records/library-loans?f.status=lost`).expect(200)).body.rows[0];
    await action('lib', 'library-loans', lostLoan.id, 'finePaid').expect(200);
    const cleared = (await post('lib', `/v1/library/no-dues/${t.students[0].id}/clear`, { purpose: 'TC' }).expect(201)).body;
    expect(cleared).toMatchObject({ purpose: 'TC' });
    expect((await get('lib', '/v1/records/library-clearances').expect(200)).body.rows[0]).toMatchObject({ fullName: 'Student A', purpose: 'TC' });
  });

  it('acquires against budgets: suggest, approve within budget, order, receive into the register, invoice', async () => {
    const budget = (await post('lib', '/v1/records/library-budgets', { fiscalYear: '2026-27', head: 'books', amount: 1000 }).expect(201)).body;
    await post('lib', '/v1/records/library-budgets', { fiscalYear: '2026', head: 'books', amount: 1 }).expect(400);
    const sug = (await post('teacher', '/v1/library/suggestions', { title: 'Business Law', author: 'Kapoor', reason: 'For BCom 3' }).expect(201)).body;
    expect(sug).toMatchObject({ status: 'suggested', number: 'ACQ-0001' });
    expect((await get('teacher', '/v1/library/suggestions/mine').expect(200)).body).toHaveLength(1);
    await http().patch(`/v1/records/library-acquisitions/${sug.id}`).set(as('lib')).send({ budgetId: budget.id, quantity: 3, estPrice: 400 }).expect(200);
    expect((await action('lib', 'library-acquisitions', sug.id, 'approve').expect(200)).body.rows[0]).toMatchObject({ ok: false, message: expect.stringContaining('The budget has ₹1000.00 left') });
    await http().patch(`/v1/records/library-acquisitions/${sug.id}`).set(as('lib')).send({ quantity: 2 }).expect(200);
    expect((await action('lib', 'library-acquisitions', sug.id, 'approve').expect(200)).body.succeeded).toBe(1);
    expect((await get('lib', `/v1/records/library-budgets/${budget.id}`).expect(200)).body).toMatchObject({ committedRupees: 800, balanceRupees: 200 });
    await action('lib', 'library-acquisitions', sug.id, 'order', { vendor: 'Bookland', orderNo: 'PO-9' }).expect(200);
    const rec = (await action('lib', 'library-acquisitions', sug.id, 'receive', { quantity: 1 }).expect(200)).body.rows[0];
    expect(rec).toMatchObject({ ok: true, message: 'ACC-0005' });
    expect((await get('lib', `/v1/records/library-acquisitions/${sug.id}`).expect(200)).body).toMatchObject({ status: 'ordered', receivedQty: 1 });
    await action('lib', 'library-acquisitions', sug.id, 'receive').expect(200);
    const acq = (await get('lib', `/v1/records/library-acquisitions/${sug.id}`).expect(200)).body;
    expect(acq).toMatchObject({ status: 'received', receivedQty: 2 });
    expect((await get('lib', `/v1/records/library-copies?f.book=${acq.bookId}`).expect(200)).body.total).toBe(2);
    await action('lib', 'library-acquisitions', sug.id, 'invoice', { invoiceNo: 'INV-1', amount: 780 }).expect(200);
    expect((await get('lib', `/v1/records/library-budgets/${budget.id}`).expect(200)).body).toMatchObject({ committedRupees: 0, spentRupees: 780, balanceRupees: 220 });
  });

  it('expects periodical issues, checks them in and claims the missing; publishes the repository; logs inter-library loans', async () => {
    const p = (await post('lib', '/v1/records/library-periodicals', { title: 'Indian Journal of Accounting', issn: '0019-5065', kind: 'journal', frequency: 'quarterly', subscriptionFrom: '2026-04-01', subscriptionTo: '2027-03-31', cost: 2400 }).expect(201)).body;
    expect((await action('lib', 'library-periodicals', p.id, 'generateIssues').expect(200)).body.rows[0].message).toBe('4');
    expect((await action('lib', 'library-periodicals', p.id, 'generateIssues').expect(200)).body.rows[0].message).toBe('0');
    const issues = (await get('lib', `/v1/records/library-issues?f.periodical=${p.id}&sort=expected:asc`).expect(200)).body.rows;
    expect(issues.map((i: { expectedOn: string }) => i.expectedOn)).toEqual(['2026-04-01', '2026-07-01', '2026-10-01', '2027-01-01']);
    await action('lib', 'library-issues', issues[0].id, 'checkIn').expect(200);
    await action('lib', 'library-issues', issues[1].id, 'claim', { note: 'Not received; please resend' }).expect(200);
    expect((await get('lib', `/v1/records/library-periodicals/${p.id}`).expect(200)).body).toMatchObject({ received: 1, expected: 2, missing: 1 });
    await action('lib', 'library-issues', issues[0].id, 'claim').expect(200).then((x) => expect(x.body.rows[0].ok).toBe(false));

    const item = (await post('lib', '/v1/records/library-repository', { title: 'A study of GST', authors: 'Student A', kind: 'project', url: 'https://example.org/gst.pdf', access: 'campus' }).expect(201)).body;
    const restricted = (await post('lib', '/v1/records/library-repository', { title: 'Confidential report', kind: 'other', url: 'https://example.org/c.pdf', access: 'restricted' }).expect(201)).body;
    expect((await get('student', '/v1/library/repository').expect(200)).body).toEqual([]);
    await action('lib', 'library-repository', item.id, 'publish').expect(200);
    await action('lib', 'library-repository', restricted.id, 'publish').expect(200);
    const seen = (await get('student', '/v1/library/repository').expect(200)).body;
    expect(seen.map((x: { title: string }) => x.title)).toEqual(['A study of GST']);
    expect((await post('student', `/v1/library/repository/${item.id}/open`).expect(200)).body.url).toBe('https://example.org/gst.pdf');
    await post('student', `/v1/library/repository/${restricted.id}/open`).expect(404);
    expect((await get('lib', `/v1/records/library-repository/${item.id}`).expect(200)).body.views).toBe(1);

    const ill = (await post('lib', '/v1/records/library-ill', { direction: 'borrow', network: 'delnet', partner: 'IISc Library', title: 'Rare monograph', memberCode: ids.staffCard, requestedOn: '2026-10-01' }).expect(201)).body;
    expect(ill).toMatchObject({ status: 'requested', memberName: expect.any(String) });
    await action('lib', 'library-ill', ill.id, 'returned').expect(200).then((x) => expect(x.body.rows[0].ok).toBe(false));
    await action('lib', 'library-ill', ill.id, 'inHand').expect(200);
    await action('lib', 'library-ill', ill.id, 'returned').expect(200).then((x) => expect(x.body.rows[0].ok).toBe(true));
  });

  it('imports MARC21 and spreadsheets, exports, searches the OPAC and alerts subscribers', async () => {
    const marc = Buffer.concat([
      writeIso2709([{ tag: '020', value: '$a 9780306406157' }, { tag: '245', value: '$a Already here' }]),
      writeIso2709([{ tag: '020', value: '$a 080442957X' }, { tag: '100', value: '$a Gupta, S. P.' }, { tag: '245', value: '$a Statistical methods' }, { tag: '082', value: '$a 519.5' }, { tag: '650', value: '$a Statistics' }]),
    ]);
    const prev = (await http().post('/v1/library/marc/preview').set(as('lib')).attach('file', marc, 'books.mrc').expect(200)).body;
    expect(prev.records).toBe(2);
    expect(prev.books.map((b: { title: string; inCatalogue: boolean }) => [b.title, b.inCatalogue])).toEqual([
      ['Already here', true],
      ['Statistical methods', false],
    ]);
    const imp = (await http().post('/v1/library/marc/import?copies=2').set(as('lib')).attach('file', marc, 'books.mrc').expect(200)).body;
    expect(imp).toEqual({ records: 2, created: 1, skipped: 1 });
    const found = (await get('lib', '/v1/records/library-books?q=statistical').expect(200)).body.rows[0];
    expect(found).toMatchObject({ callNo: '519.5 GUP', copies: 2, subject: 'Statistics' });
    await http().post('/v1/library/marc/preview').set(as('lib')).attach('file', Buffer.from('nothing here'), 'x.mrc').expect(400);
    const exp = await get('lib', '/v1/library/marc/export').buffer(true).parse(binary).expect(200);
    expect(exp.headers['content-type']).toContain('application/marc');
    expect((exp.body as Buffer).includes(Buffer.from('Statistical methods'))).toBe(true);

    // Spreadsheet import: check, then commit; a bad ISBN is reported and nothing is saved before commit.
    const csv = 'Title,Author,ISBN,Copies,Price (₹)\r\nCost Accounting,Jain,,2,400\r\nBad one,X,123,1,\r\n';
    const check = (await http().post('/v1/records/library-books/import').set(as('lib')).attach('file', Buffer.from(csv), 'b.csv').expect(200)).body;
    expect(check.rows.map((r: { status: string }) => r.status)).toEqual(['created', 'error']);
    const done = (await post('lib', `/v1/records/library-books/import/${check.id}/commit`, { skipErrors: true }).expect(200)).body;
    expect(done).toMatchObject({ committed: true, totals: { created: 1, error: 1 } });
    const tpl = await get('lib', '/v1/records/library-books/import/template').buffer(true).parse(binary).expect(200);
    expect((tpl.body as Buffer).length).toBeGreaterThan(1000);
    const out = await get('lib', '/v1/records/library-copies/export?format=csv&columns=accessionNo,title,status').expect(200);
    expect(out.text).toContain('ACC-0001,Corporate Accounting,Lost');

    // OPAC for any reader, with availability; a parent subscribes and hears about new arrivals.
    const opac = (await get('parent', '/v1/library/opac?q=statistical').expect(200)).body;
    expect(opac).toMatchObject({ total: 1, rows: [expect.objectContaining({ title: 'Statistical methods', available: 2, reservable: false })] });
    await http().put('/v1/library/alerts/me').set(as('parent')).send({ topics: 'statistics' }).expect(200);
    expect((await post('lib', '/v1/library/new-arrivals/notify', { days: 7 }).expect(200)).body.notified).toBe(1);
    const notes = (await get('parent', '/v1/notifications').expect(200)).body;
    expect(JSON.stringify(notes)).toContain('Statistical methods');
    await post('parent', '/v1/library/new-arrivals/notify', {}).expect(403);

    // ISBN lookup finds the catalogue's own copy without going outside.
    expect((await get('lib', '/v1/library/isbn/978-0-306-40615-7').expect(200)).body).toMatchObject({ source: 'catalogue', inCatalogue: { title: 'Corporate Accounting' } });
    await get('lib', '/v1/library/isbn/12345').expect(400);
  });

  it('deletes to the bin and restores with copies; refuses titles with loans; runs the library reports', async () => {
    const b = (await post('lib', '/v1/records/library-books', { title: 'Temporary title', copies: 2 }).expect(201)).body;
    const del = (await http().delete(`/v1/records/library-books/${b.id}`).set(as('lib')).expect(200)).body;
    expect(del).toMatchObject({ label: 'Temporary title', rows: 3 });
    expect((await get('lib', `/v1/records/library-copies?f.book=${b.id}`).expect(200)).body.total).toBe(0);
    await post('lib', `/v1/recycle-bin/${del.binId}/restore`).expect(200);
    expect((await get('lib', `/v1/records/library-copies?f.book=${b.id}`).expect(200)).body.total).toBe(2);
    const inUse = (await http().delete(`/v1/records/library-books/${ids.book}`).set(as('lib')).expect(409)).body;
    expect(inUse).toMatchObject({ code: 'RECORD_IN_USE' });
    expect((await http().delete(`/v1/records/library-copies/${ids.copy3}`).set(as('lib')).expect(403)).body).toMatchObject({ code: 'RECORD_DELETE_REFUSED' }); // out on loan
    // Withdraw a copy: the withdrawal register lists it.
    const free = (await get('lib', `/v1/records/library-copies?f.book=${b.id}`).expect(200)).body.rows[0];
    await action('lib', 'library-copies', free.id, 'withdraw', { reason: 'Worn out' }).expect(200);
    const reg = (await get('lib', '/v1/ops-reports/library.withdrawals').expect(200)).body.rows;
    expect(reg[0]).toMatchObject({ title: 'Temporary title', reason: 'Worn out' });
    const acc = (await get('lib', '/v1/ops-reports/library.accession?status=on_loan').expect(200)).body.rows;
    expect(acc.length).toBeGreaterThanOrEqual(2);
    expect((await get('lib', '/v1/ops-reports/library.most-borrowed').expect(200)).body.rows[0]).toMatchObject({ title: 'Corporate Accounting' });
    const dash = (await get('lib', '/v1/library/dashboard').expect(200)).body;
    expect(dash).toMatchObject({ titles: expect.any(Number), onLoan: expect.any(Number), waivers: 0 });
    await get('teacher', '/v1/library/dashboard').expect(403);
  });
});
