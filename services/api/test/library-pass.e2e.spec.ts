import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

const binary = (res: request.Response, cb: (e: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

/**
 * The library production pass: the circulation rules matrix (category by material), due dates and late fines that skip
 * the academic calendar's holidays and the library's closed weekday, the grace period and the fine cap, overdue
 * notices once per step, fines on the fee account and the no-dues that waits for the fee, vendors, purchase orders,
 * receipt and invoices passed by someone else, serial claims, binding, e-resource usage, weeding, labels and RFID
 * lists, copy cataloguing, NAAC 4.2, and the role and institution walls around all of it.
 *
 * The clock starts on Monday 5 October 2026 (IST); the library is closed on Sundays (the default) and the calendar has
 * Dasara on 13–14 October for everyone, and a holiday on 16 October for one programme only (which does not count).
 */
describe('library pass', () => {
  const owner = ownerPool();
  const clock = new FixedClock(new Date('2026-10-05T05:00:00Z'));
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
  const at = (iso: string) => {
    clock.at = new Date(iso);
  };
  const addUser = async (name: string, role: string) => {
    const hash = await argon2.hash('pw');
    const email = `${role}-${t.slug}@x.in`;
    const { rows } = await owner.query(`insert into users (tenant_id, full_name, email, password_hash) values ($1, $2, $3, $4) returning id`, [t.tenantId, name, email, hash]);
    await owner.query(`insert into user_roles (tenant_id, user_id, role, campus_id) values ($1, $2, $3, $4)`, [t.tenantId, rows[0].id, role, t.campus.id]);
    return { id: rows[0].id as string, token: await login(t.slug, email) };
  };

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    tokens.lib = (await addUser('Lata Librarian', 'librarian')).token;
    tokens.qo = (await addUser('Quinn Quality', 'quality_officer')).token;
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.student = await login(t.slug, t.studentUser.email!);
    tokens.outsider = await login(other.slug, other.principal.email!);
    await owner.query(
      `insert into calendar_events (tenant_id, kind, title, starts_on, ends_on, program_ids, published, created_by) values
         ($1, 'holiday', 'Dasara', '2026-10-13', '2026-10-14', null, true, $2),
         ($1, 'holiday', 'Programme field trip', '2026-10-16', '2026-10-16', array[$3::uuid], true, $2)`,
      [t.tenantId, t.principal.id, t.program.id],
    );
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  it('keeps a rules matrix of member category by material and previews the rule a member gets', async () => {
    const ug = (await post('lib', '/v1/records/library-member-categories', { name: 'UG students', kind: 'student', loanDays: 14, maxBooks: 3, fine: 2 }).expect(201)).body;
    ids.ug = ug.id;
    expect((await post('lib', '/v1/library/members/enrol', { sectionId: t.section.id, categoryId: ug.id }).expect(200)).body).toEqual({ enrolled: 3 });
    const members = (await get('lib', '/v1/records/library-members?f.kind=student&sort=name:asc').expect(200)).body.rows;
    ids.cardA = members[0].cardNo;
    ids.memberA = members[0].id;
    ids.cardB = members[1].cardNo;
    ids.memberB = members[1].id;

    const cell = (await post('lib', '/v1/records/library-circ-rules', { categoryId: ug.id, material: 'book', loanDays: 6, maxItems: 2, fine: 1, graceDays: 1, maxFine: 10, maxRenewals: 1, canReserve: true }).expect(201)).body;
    expect(cell).toMatchObject({ categoryName: 'UG students', material: 'book', loanDays: 6, fineRupees: 1, maxFineRupees: 10 });
    ids.cell = cell.id;
    await post('lib', '/v1/records/library-circ-rules', { material: 'reference', loanDays: 0, fine: 0, maxRenewals: 0 }).expect(201);
    await post('lib', '/v1/records/library-circ-rules', { categoryId: ug.id, material: 'book', loanDays: 9, fine: 1, maxRenewals: 1 }).expect(409); // that cell exists
    await post('lib', '/v1/records/library-circ-rules', { loanDays: 9, fine: 1, maxRenewals: 1 }).expect(400); // neither category nor material
    await post('teacher', '/v1/records/library-circ-rules', { material: 'cd', loanDays: 3, fine: 1, maxRenewals: 0 }).expect(403);
    await get('student', '/v1/records/library-circ-rules').expect(403);

    const book = (await get('lib', `/v1/library/rules/preview?memberCode=${ids.cardA}&material=book`).expect(200)).body;
    expect(book).toMatchObject({ loanDays: 6, maxItems: 2, finePerDayPaise: 100, graceDays: 1, maxFinePaise: 1000, maxRenewals: 1, maxBooks: 3, ruleId: cell.id, closedWeekdays: '0', skipsHolidays: true });
    const thesis = (await get('lib', `/v1/library/rules/preview?memberCode=${ids.cardA}&material=thesis`).expect(200)).body;
    expect(thesis).toMatchObject({ loanDays: 14, finePerDayPaise: 200, ruleId: null }); // the category's own rules
    expect((await get('outsider', '/v1/records/library-circ-rules').expect(200)).body.total).toBe(0);
    await get('outsider', `/v1/records/library-circ-rules/${cell.id}`).expect(404);
  });

  it('issues under the matrix: reference is read in the library, the per-material limit holds, a Sunday due date moves to Monday', async () => {
    await post('lib', '/v1/records/library-books', { title: 'Financial Accounting', author: 'Jain, S. P.', ddc: '657', price: 500, copies: 3 }).expect(201);
    await post('lib', '/v1/records/library-books', { title: 'Encyclopaedia of Commerce', material: 'reference', copies: 1 }).expect(201);
    const ref = (await post('lib', '/v1/library/desk/issue', { memberCode: ids.cardA, copyCodes: ['ACC-0004'] }).expect(200)).body.results[0];
    expect(ref).toMatchObject({ ok: false, message: 'This material is for reading in the library only' });
    const out = (await post('lib', '/v1/library/desk/issue', { memberCode: ids.cardA, copyCodes: ['ACC-0001', 'ACC-0002', 'ACC-0003'] }).expect(200)).body.results;
    expect(out.map((r: { ok: boolean }) => r.ok)).toEqual([true, true, false]);
    expect(out[2].message).toBe('This member can borrow 2 book items at a time');
    // 5 October + 6 days is Sunday 11 October; the library is closed, so the book is due on Monday 12 October.
    expect(out[0].dueOn).toBe('2026-10-12');
    const b = (await post('lib', '/v1/library/desk/issue', { memberCode: ids.cardB, copyCodes: ['ACC-0003'] }).expect(200)).body.results[0];
    expect(b).toMatchObject({ ok: true, dueOn: '2026-10-12' });
  });

  it('sends each overdue notice once per step and says why SMS did not go', async () => {
    at('2026-10-13T04:00:00Z');
    const run = (await post('lib', '/v1/library/overdue-notices/run').expect(200)).body;
    expect(run).toMatchObject({ today: '2026-10-13', byStep: { due_soon: 0, first: 3, second: 0, final: 0 }, sent: { sms: 0 } });
    expect(run.skipped).toEqual(['No active "library_overdue" SMS template in Communication']);
    expect((await post('lib', '/v1/library/overdue-notices/run').expect(200)).body.byStep.first).toBe(0); // once per step
    const log = (await get('lib', '/v1/library/overdue-notices').expect(200)).body;
    expect(log.total).toBe(3);
    await post('teacher', '/v1/library/overdue-notices/run').expect(403);
  });

  it('fines in open days only: holidays and Sundays are skipped, the grace period and the cap apply', async () => {
    // Back on Thursday 15 October: 13 and 14 were Dasara, so only one open day late, within the one-day grace.
    at('2026-10-15T06:00:00Z');
    const early = (await post('lib', '/v1/library/desk/return', { copyCodes: ['ACC-0002'] }).expect(200)).body.results[0];
    expect(early).toMatchObject({ ok: true, finePaise: 0 });
    // Monday 19 October: the 15th, 16th (a holiday for one programme only), 17th and 19th count; Sunday the 18th does not.
    at('2026-10-19T06:00:00Z');
    const me = (await get('lib', `/v1/library/me?studentId=${t.students[0].id}`).expect(200)).body;
    expect(me.current[0]).toMatchObject({ dueOn: '2026-10-12', lateDays: 4, fineSoFarPaise: 400 });
    const late = (await post('lib', '/v1/library/desk/return', { copyCodes: ['ACC-0001'] }).expect(200)).body.results[0];
    expect(late).toMatchObject({ ok: true, finePaise: 400, fineDays: 4 });
    expect((await post('lib', '/v1/library/overdue-notices/run').expect(200)).body.byStep).toMatchObject({ second: 1 }); // B's loan, 7 days late
    // Monday 2 November: 16 open days late at ₹1, capped at ₹10.
    at('2026-11-02T06:00:00Z');
    const capped = (await post('lib', '/v1/library/desk/return', { copyCodes: ['ACC-0003'] }).expect(200)).body.results[0];
    expect(capped).toMatchObject({ ok: true, finePaise: 1000, fineDays: 16 });
  });

  it('puts fines on the fee account once, and the no-dues waits until the fee is paid', async () => {
    await post('teacher', `/v1/library/members/${ids.memberA}/fines-to-fees`).expect(403);
    await post('outsider', `/v1/library/members/${ids.memberA}/fines-to-fees`).expect(404);
    const sent = (await post('lib', `/v1/library/members/${ids.memberA}/fines-to-fees`).expect(200)).body;
    expect(sent).toMatchObject({ sent: 1, totalPaise: 400 });
    expect((await post('lib', `/v1/library/members/${ids.memberA}/fines-to-fees`).expect(200)).body).toMatchObject({ sent: 0, totalPaise: 0 }); // nothing left to send
    const inv = (await owner.query(`select id, amount_paise from fee_invoices where student_id = $1 and title like 'Library fine%'`, [t.students[0].id])).rows;
    expect(inv.map((x: { amount_paise: string }) => Number(x.amount_paise))).toEqual([400]);
    const dues = (await get('lib', `/v1/library/no-dues/${t.students[0].id}`).expect(200)).body;
    expect(dues).toMatchObject({ booksOut: 0, unpaidPaise: 0, feesPendingPaise: 400, clear: false });
    await post('lib', `/v1/library/no-dues/${t.students[0].id}/clear`, { purpose: 'TC' }).expect(409);
    await owner.query(`update fee_invoices set paid_paise = amount_paise, status = 'paid' where id = $1`, [inv[0].id]);
    expect((await get('lib', `/v1/library/no-dues/${t.students[0].id}`).expect(200)).body).toMatchObject({ feesPendingPaise: 0, clear: true });
    expect((await post('lib', `/v1/library/no-dues/${t.students[0].id}/clear`, { purpose: 'TC' }).expect(201)).body).toMatchObject({ purpose: 'TC' });
    // Student B still owes ₹10; the exits list shows students leaving and staff at clearance.
    await owner.query(`update students set status = 'transferred' where id = $1`, [t.students[1].id]);
    const exits = (await get('lib', '/v1/library/exits').expect(200)).body;
    expect(exits.students).toHaveLength(1);
    expect(exits.students[0]).toMatchObject({ studentId: t.students[1].id, booksOut: 0, unpaidPaise: 1000, clear: false, requestId: null });
    expect(exits.staff).toEqual([]);
    await owner.query(`update students set status = 'active' where id = $1`, [t.students[1].id]);
    await get('teacher', '/v1/library/exits').expect(403);
  });

  it('buys through vendors and purchase orders: approve, order, receive, invoice, pass by another person, pay', async () => {
    await post('lib', '/v1/records/library-vendors', { name: 'Bad GST', kind: 'books', gstin: '29ABCDE1234' }).expect(400);
    const vendor = (await post('lib', '/v1/records/library-vendors', { name: 'Sapna Book House', kind: 'books', gstin: '29abcde1234f1z5', discountPct: 10, phone: '080 4011 4455' }).expect(201)).body;
    expect(vendor).toMatchObject({ gstin: '29ABCDE1234F1Z5', discountPct: 10 });
    await post('lib', '/v1/records/library-vendors', { name: 'sapna book house', kind: 'books' }).expect(409); // the same vendor
    const budget = (await post('lib', '/v1/records/library-budgets', { fiscalYear: '2026-27', head: 'books', amount: 5000 }).expect(201)).body;
    const sug = (await post('teacher', '/v1/library/suggestions', { title: 'Cost Accounting', author: 'Arora', reason: 'BCom Sem 3' }).expect(201)).body;
    await http().patch(`/v1/records/library-acquisitions/${sug.id}`).set(as('lib')).send({ budgetId: budget.id, quantity: 2, estPrice: 450 }).expect(200);
    expect((await action('lib', 'library-acquisitions', sug.id, 'approve').expect(200)).body.succeeded).toBe(1);

    const po = (await post('lib', '/v1/records/library-purchase-orders', { vendorId: vendor.id, expectedBy: '2026-11-20' }).expect(201)).body;
    expect(po).toMatchObject({ number: 'LPO-0001', status: 'draft', discountPct: 10, vendorName: 'Sapna Book House' });
    ids.po = po.id;
    expect((await action('lib', 'library-purchase-orders', po.id, 'send').expect(200)).body.rows[0]).toMatchObject({ ok: false, message: 'Put approved requests on the order first' });
    expect((await action('lib', 'library-acquisitions', sug.id, 'addToOrder', { poId: po.id }).expect(200)).body.rows[0]).toMatchObject({ ok: true, message: 'LPO-0001' });
    expect((await get('lib', `/v1/records/library-purchase-orders/${po.id}`).expect(200)).body).toMatchObject({ lines: 1, copies: 2, grossRupees: 900, netRupees: 810 });
    await action('lib', 'library-purchase-orders', po.id, 'send').expect(200);
    expect((await get('lib', `/v1/records/library-acquisitions/${sug.id}`).expect(200)).body).toMatchObject({ status: 'ordered', orderNo: 'LPO-0001' });
    const pdf = (await get('lib', `/v1/library/purchase-orders/${po.id}/pdf`).buffer().parse(binary).expect(200)).body as Buffer;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1')).toContain('LPO-0001');
    await get('teacher', `/v1/library/purchase-orders/${po.id}/pdf`).expect(403);

    expect((await action('lib', 'library-acquisitions', sug.id, 'receive').expect(200)).body.rows[0]).toMatchObject({ ok: true, message: 'ACC-0005, ACC-0006' });
    expect((await action('lib', 'library-purchase-orders', po.id, 'refresh').expect(200)).body.rows[0]).toMatchObject({ ok: true, message: '2 of 2 copies received' });
    expect((await get('lib', `/v1/records/library-purchase-orders/${po.id}`).expect(200)).body.status).toBe('received');

    const inv = (await post('lib', '/v1/records/library-invoices', { poId: po.id, invoiceNo: 'SBH/221', invoiceDate: '2026-10-28', gross: 900, discount: 90, gst: 0 }).expect(201)).body;
    expect(inv).toMatchObject({ netRupees: 810, vendorName: 'Sapna Book House', poNumber: 'LPO-0001', status: 'recorded' });
    await post('lib', '/v1/records/library-invoices', { poId: po.id, invoiceNo: 'SBH/221', invoiceDate: '2026-10-28', gross: 900 }).expect(409);
    expect((await get('lib', `/v1/records/library-acquisitions/${sug.id}`).expect(200)).body).toMatchObject({ status: 'invoiced', invoiceNo: 'SBH/221', invoiceRupees: 810 });
    expect((await get('lib', `/v1/records/library-budgets/${budget.id}`).expect(200)).body).toMatchObject({ spentRupees: 810, committedRupees: 0 });
    await action('lib', 'library-invoices', inv.id, 'pass').expect(403); // the principal passes it
    expect((await action('principal', 'library-invoices', inv.id, 'paid', { paymentRef: 'UTR-1' }).expect(200)).body.rows[0]).toMatchObject({ ok: false, message: 'Pass the invoice for payment first' });
    expect((await action('principal', 'library-invoices', inv.id, 'pass').expect(200)).body.succeeded).toBe(1);
    await action('principal', 'library-invoices', inv.id, 'paid', { paymentRef: 'x' }).expect(400);
    expect((await action('principal', 'library-invoices', inv.id, 'paid', { paymentRef: 'UTR 2026110211', paidOn: '2026-11-02' }).expect(200)).body.succeeded).toBe(1);
    expect((await get('lib', `/v1/records/library-invoices/${inv.id}`).expect(200)).body).toMatchObject({ status: 'paid', paidOn: '2026-11-02', paymentRef: 'UTR 2026110211' });
    await http().delete(`/v1/records/library-invoices/${inv.id}`).set(as('lib')).expect(403); // a paid invoice stays
    await get('outsider', `/v1/records/library-purchase-orders/${po.id}`).expect(404);
  });

  it('expects serial issues, checks them in, and claims a missing one more than once', async () => {
    const j = (await post('lib', '/v1/records/library-periodicals', { title: 'Indian Journal of Commerce', issn: '0019-512X', kind: 'journal', frequency: 'quarterly', subscriptionFrom: '2026-04-01', subscriptionTo: '2027-03-31', cost: 1500 }).expect(201)).body;
    expect((await action('lib', 'library-periodicals', j.id, 'generateIssues').expect(200)).body.rows[0]).toMatchObject({ ok: true, message: '4' });
    const issues = (await get('lib', `/v1/records/library-issues?q=${encodeURIComponent('Indian Journal')}&sort=expected:asc`).expect(200)).body.rows;
    expect(issues).toHaveLength(4);
    await action('lib', 'library-issues', issues[0].id, 'checkIn', { receivedOn: '2026-04-20' }).expect(200);
    await action('lib', 'library-issues', issues[1].id, 'claim', { note: 'Not received' }).expect(200);
    await action('lib', 'library-issues', issues[1].id, 'claim', { note: 'Second claim' }).expect(200);
    expect((await get('lib', `/v1/records/library-issues/${issues[1].id}`).expect(200)).body).toMatchObject({ status: 'claimed', claimCount: 2 });
    expect((await get('lib', `/v1/records/library-issues/${issues[0].id}`).expect(200)).body.status).toBe('received');
  });

  it('sends copies to the binder and brings them back to the shelf', async () => {
    const binder = (await post('lib', '/v1/records/library-vendors', { name: 'Sri Ganesh Binders', kind: 'binder' }).expect(201)).body;
    const batch = (await post('lib', '/v1/records/library-binding', { vendorId: binder.id, expectedOn: '2026-11-16', cost: 240 }).expect(201)).body;
    expect(batch).toMatchObject({ number: 'LBB-0001', status: 'draft', vendorName: 'Sri Ganesh Binders' });
    await action('lib', 'library-binding', batch.id, 'send').expect(200).then((r) => expect(r.body.rows[0]).toMatchObject({ ok: false, message: 'Add copies to the batch first' }));
    expect((await action('lib', 'library-binding', batch.id, 'addCopies', { codes: 'ACC-0002 NOPE', instructions: 'Full cloth' }).expect(200)).body.rows[0]).toMatchObject({ ok: true, message: '1 added; not on the shelf: NOPE' });
    const copy = (await get('lib', '/v1/records/library-copies?q=ACC-0002').expect(200)).body.rows[0];
    expect(copy.status).toBe('binding');
    await post('lib', '/v1/library/desk/issue', { memberCode: ids.cardB, copyCodes: ['ACC-0002'] }).expect(200).then((r) => expect(r.body.results[0].ok).toBe(false));
    await action('lib', 'library-binding', batch.id, 'send', { sentOn: '2026-11-02' }).expect(200);
    await http().delete(`/v1/records/library-binding/${batch.id}`).set(as('lib')).expect(403); // at the binder
    expect((await action('lib', 'library-binding', batch.id, 'receive', { receivedOn: '2026-11-02', cost: 260 }).expect(200)).body.rows[0]).toMatchObject({ ok: true, message: '1 back on the shelf' });
    expect((await get('lib', `/v1/records/library-copies/${copy.id}`).expect(200)).body.status).toBe('available');
    expect((await get('lib', `/v1/records/library-binding/${batch.id}`).expect(200)).body).toMatchObject({ status: 'received', items: 1, costRupees: 260 });
  });

  it('registers DELNET and N-LIST with their cost, takes provider usage, and works out cost per use', async () => {
    const delnet = (await post('lib', '/v1/records/library-eresources', { title: 'DELNET', kind: 'database', provider: 'delnet', url: 'https://delnet.in', accessMode: 'remote', cost: 20000, subscriptionFrom: '2026-04-01', licenceUntil: '2027-03-31' }).expect(201)).body;
    expect(delnet).toMatchObject({ provider: 'delnet', costRupees: 20000 });
    await post('lib', '/v1/records/library-eresources', { title: 'N-LIST e-journals', kind: 'journal', provider: 'nlist', url: 'https://nlist.inflibnet.ac.in', accessMode: 'remote', cost: 5900, subscriptionFrom: '2026-04-01' }).expect(201);
    await post('lib', '/v1/records/library-eresource-usage', { resourceId: delnet.id, month: '2026-09', sessions: 40, searches: 120, downloads: 25 }).expect(201);
    await post('lib', '/v1/records/library-eresource-usage', { resourceId: delnet.id, month: '2026-09', sessions: 1 }).expect(409); // that month is in
    await post('lib', '/v1/records/library-eresource-usage', { resourceId: delnet.id, month: '2026-13' }).expect(400);
    await post('student', `/v1/library/eresources/${delnet.id}/open`).expect(200);
    const use = (await get('lib', '/v1/library/eresources/usage?from=2026-09&to=2026-11').expect(200)).body;
    const d = use.resources.find((r: { id: string }) => r.id === delnet.id);
    expect(d).toMatchObject({ provider: 'delnet', sessions: 40, downloads: 25, opens: 1, costPerUsePaise: Math.round(2_000_000 / 26) });
    expect(d.months.map((m: { month: string }) => m.month)).toEqual(['2026-09', '2026-10', '2026-11']);
    await get('lib', '/v1/library/eresources/usage?from=2026-11&to=2026-09').expect(400);
    await get('student', '/v1/library/eresources/usage').expect(403);
  });

  it('copy-catalogues a MARC record, prints copy labels, lists RFID tags to encode, and finds copies to weed', async () => {
    const rec = { '020': ['   $a 9780070146259'], '082': ['04 $a 332.1'], '100': ['1  $a Natarajan, S.'], '245': ['10 $a Modern banking $c S. Natarajan'], '264': [' 1 $b Himalaya $c 2021'] };
    const made = (await post('lib', '/v1/library/copy-catalogue/import', { record: rec, copies: 1, pricePaise: 39500 }).expect(201)).body;
    expect(made).toMatchObject({ title: 'Modern banking', isbn: '9780070146259', accession: ['ACC-0007'] });
    await post('lib', '/v1/library/copy-catalogue/import', { record: rec, copies: 1 }).expect(409);
    await post('lib', '/v1/library/copy-catalogue/import', { record: { '100': ['1  $a Nobody'] } }).expect(400);

    const pdf = (await get('lib', '/v1/library/copies/labels.pdf?from=ACC-0001&to=ACC-0003').buffer().parse(binary).expect(200)).body as Buffer;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1')).toContain('ACC-0001');
    expect(pdf.toString('latin1')).not.toContain('ACC-0004');
    const csv = (await get('lib', '/v1/library/copies/rfid.csv?from=ACC-0005&to=ACC-0007').expect(200)).text;
    expect(csv.split('\n').filter(Boolean)).toHaveLength(4);
    expect(csv).toContain('Item id (write to tag)');
    expect(csv).toContain('Modern banking');
    await get('student', '/v1/library/copies/rfid.csv').expect(403);

    const old = (await post('lib', '/v1/records/library-books', { title: 'Old Ledger Practice', copies: 1 }).expect(201)).body;
    await owner.query(`update library_copies set acquired_on = '2015-06-01', created_at = '2015-06-01' where book_id = $1`, [old.id]);
    const weed = (await get('lib', '/v1/library/weeding?years=5').expect(200)).body;
    expect(weed).toMatchObject({ years: 5, cutoff: '2021-11-02' });
    expect(weed.rows.find((r: { title: string }) => r.title === 'Old Ledger Practice')).toMatchObject({ reason: 'never_issued', issues: 0 });
    expect(weed.rows.find((r: { title: string }) => r.title === 'Financial Accounting')).toBeUndefined();
  });

  it('reports NAAC 4.2 by financial year: spending, footfall, logins and usage', async () => {
    const staff = (await post('lib', '/v1/records/library-members', { kind: 'staff', userId: t.teacher.id }).expect(201)).body;
    await post('lib', '/v1/library/gate/swipe', { memberCode: ids.cardA }).expect(200);
    await post('lib', '/v1/library/gate/swipe', { memberCode: staff.cardNo }).expect(200);
    await get('student', '/v1/library/naac').expect(403);
    const naac = (await get('qo', '/v1/library/naac?years=2').expect(200)).body;
    expect(naac.years).toHaveLength(2);
    const y = naac.years[0];
    // Books: 3 copies at ₹500 and the copy-catalogued one at ₹395 bought directly, plus the ₹810 invoice; journals: ₹1,500 + ₹20,000 + ₹5,900.
    expect(y).toMatchObject({ year: '2026-27', booksPaise: 150_000 + 39_500 + 81_000, journalsPaise: 150_000 + 2_000_000 + 590_000, footfallStudents: 1, footfallTeachers: 1, openDays: 1, footfallPerDay: 2, onlineLogins: 1 });
    expect(y.totalPaise).toBe(y.booksPaise + y.journalsPaise);
    expect(y.totalLakhs).toBe(Math.round(y.totalPaise / 1e5) / 100);
    expect(naac.years[1]).toMatchObject({ year: '2025-26', totalPaise: 0 });
    expect((await get('outsider', '/v1/library/naac?years=1').expect(200)).body.years[0]).toMatchObject({ totalPaise: 0, footfallStudents: 0 });
  });
});
