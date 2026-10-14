import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { inflateRawSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LIBRARY } from '../src/analytics/library.js';
import { LogMailer, Mailer } from '../src/analytics/mailer.js';
import { ReportsService } from '../src/analytics/reports.service.js';
import { DATASETS } from '../src/analytics/semantic.js';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/** The files inside a ZIP (an XLSX workbook), stored or deflated. */
function unzip(buf: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (buf.readUInt32LE(i) === 0x04034b50) {
    const method = buf.readUInt16LE(i + 8);
    const size = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extra = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString('utf8');
    const data = buf.subarray(i + 30 + nameLen + extra, i + 30 + nameLen + extra + size);
    out[name] = (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    i += 30 + nameLen + extra + size;
  }
  return out;
}
const binary = (res: request.Response, cb: (e: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('report studio', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  // 14 October 2026, 11:30 in India: "today" in every relative filter below.
  const clock = new FixedClock(new Date('2026-10-14T06:00:00Z'));
  const mailer = new LogMailer();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const people: Record<string, { id: string; email: string }> = {};
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const get = (who: string, path: string) => http().get(path).set(auth(who));
  const post = (who: string, path: string, body: object) => http().post(path).set(auth(who)).send(body);
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const q = (text: string, values: unknown[] = []) => owner.query(text, values);
  const S = '/v1/analytics/studio';
  const preview = (who: string, dataset: string, definition: object, runtime: object[] = []) => post(who, `${S}/preview`, { dataset, definition, runtime });
  let n = 0;
  const staff = async (tenantId: string, campusId: string, role: (typeof s.roleName.enumValues)[number], name: string = role) => {
    const [u] = await db.insert(s.users).values({ tenantId, fullName: `${name} person`, email: `${name}${++n}-${Math.random().toString(36).slice(2, 6)}@x.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId, userId: u.id, role, campusId });
    return u;
  };
  let deptId: string;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock, (b) => b.overrideProvider(Mailer).useValue(mailer));
    for (const role of ['tenant_admin', 'accountant', 'hr_manager', 'hod', 'librarian'] as const) {
      const u = await staff(t.tenantId, t.campus.id, role);
      people[role] = { id: u.id, email: u.email! };
      tokens[role] = await login(t.slug, u.email!);
    }
    const acc2 = await staff(t.tenantId, t.campus.id, 'accountant', 'cashier');
    people.cashier = { id: acc2.id, email: acc2.email! };
    tokens.cashier = await login(t.slug, acc2.email!);
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.teacher2 = await login(t.slug, t.teacher2.email!);
    tokens.parent = await login(t.slug, t.guardian.email!);
    tokens.outsider = await login(other.slug, other.principal.email!);
    people.principal = { id: t.principal.id, email: t.principal.email! };
    people.teacher = { id: t.teacher.id, email: t.teacher.email! };

    const [A, B, C] = t.students;
    const tid = t.tenantId;
    // Admission applications give students their gender and social category.
    const [cycle] = (await q(`insert into admission_cycles (tenant_id, program_id, academic_year_id, name, seats, opens_on, closes_on) values ($1, $2, $3, 'BCom 2026', 60, '2026-05-01', '2026-07-31') returning id`, [tid, t.program.id, t.section.academicYearId])).rows;
    const apps = [
      [A.id, 'Student A', 'female', 'SC', 'enrolled', 1],
      [B.id, 'Student B', 'male', 'GM', 'enrolled', 2],
      [C.id, 'Student C', 'female', 'obc', 'enrolled', 3],
      [null, 'Applicant D', 'male', 'ST', 'under_review', null],
    ];
    for (const [i, [sid, name, gender, category, status, rank]] of apps.entries()) {
      const [a] = (await q(`insert into applications (tenant_id, cycle_id, application_no, applicant_name, phone, guardian_name, guardian_phone, access_token_hash, gender, category, status, merit_rank, submitted_at) values ($1, $2, $3, $4, '9000000000', 'Parent', '9000000001', $5, $6, $7, $8, $9, '2026-10-10T05:00:00Z') returning id`, [tid, cycle.id, `APP-${i}`, name, `h${i}${Math.random()}`, gender, category, status, rank])).rows;
      if (sid) await q('update students set application_id = $1 where id = $2', [a.id, sid]);
    }
    // Attendance over ten school days: A always present, B six of ten (and absent today), C eight of ten.
    const mark = (sid: string, date: string, status: string) => q(`insert into attendance_records (tenant_id, student_id, section_id, date, status, marked_by, occurred_at) values ($1, $2, $3, $4, $5, $6, now())`, [tid, sid, t.section.id, date, status, t.teacher.id]);
    for (let d = 1; d <= 10; d++) {
      const date = `2026-10-${String(d).padStart(2, '0')}`;
      await mark(A.id, date, 'present');
      await mark(B.id, date, d <= 6 ? 'present' : 'absent');
      await mark(C.id, date, d <= 8 ? 'present' : 'absent');
    }
    await mark(B.id, '2026-10-14', 'absent');
    // Fees: A owes 6,000 since 1 September; B paid in full; C owes a 2,000 lab fee since June and a tuition fee not yet due.
    const inv = async (sid: string, title: string, amount: number, paid: number, due: string, status: string) => (await q(`insert into fee_invoices (tenant_id, student_id, section_id, batch_id, title, amount_paise, paid_paise, due_on, status, created_by) values ($1, $2, $3, gen_random_uuid(), $4, $5, $6, $7, $8, $9) returning id`, [tid, sid, t.section.id, title, amount, paid, due, status, t.principal.id])).rows[0].id as string;
    const invA = await inv(A.id, 'Tuition', 1_000_000, 400_000, '2026-09-01', 'due');
    const invB = await inv(B.id, 'Tuition', 1_000_000, 1_000_000, '2026-09-01', 'paid');
    await inv(C.id, 'Lab', 200_000, 0, '2026-06-01', 'due');
    await inv(C.id, 'Tuition', 1_000_000, 0, '2026-11-01', 'due');
    await q(`insert into fee_payments (tenant_id, invoice_id, student_id, amount_paise, method, status, receipt_no, paid_at, recorded_by) values ($1, $2, $3, 400000, 'cash', 'paid', 'RC-1', '2026-10-14T04:00:00Z', $4), ($1, $5, $6, 1000000, 'upi', 'paid', 'RC-2', '2026-10-10T04:00:00Z', null)`, [tid, invA, A.id, people.accountant.id, invB, B.id]);
    await q(`insert into fee_invoices (tenant_id, student_id, section_id, batch_id, title, amount_paise, paid_paise, due_on, status, created_by) values ($1, $2, $3, gen_random_uuid(), 'Tuition', 9999900, 0, '2026-09-01', 'due', $4)`, [other.tenantId, other.students[0].id, other.section.id, other.principal.id]);
    // Staff and payroll: the teacher in Commerce earns 50,000 gross, the principal 1,00,000.
    deptId = (await q(`insert into departments (tenant_id, name) values ($1, 'Commerce') returning id`, [tid])).rows[0].id;
    await q(`insert into staff_profiles (tenant_id, user_id, employee_code, department_id, employment_type, gender, date_of_joining) values ($1, $2, 'E1', $3, 'permanent', 'female', '2012-06-01'), ($1, $4, 'E2', null, 'permanent', 'male', '2020-06-01')`, [tid, t.teacher.id, deptId, t.principal.id]);
    const [run] = (await q(`insert into payroll_runs (tenant_id, month, status) values ($1, '2026-09', 'locked') returning id`, [tid])).rows;
    await q(`insert into payslips (tenant_id, run_id, user_id, gross_paise, deductions_paise, net_paise, employer_cost_paise, taxable_gross_paise, pt_paise, employee_pf_paise, tds_paise, data) values ($1, $2, $3, 5000000, 500000, 4500000, 5500000, 5000000, 20000, 180000, 300000, '{}'), ($1, $2, $4, 10000000, 1000000, 9000000, 11000000, 10000000, 20000, 180000, 800000, '{}')`, [tid, run.id, t.teacher.id, t.principal.id]);
    await q(`insert into staff_attendance (tenant_id, user_id, date, status, source) values ($1, $2, '2026-10-14', 'absent', 'manual'), ($1, $3, '2026-10-14', 'present', 'manual')`, [tid, t.teacher.id, t.principal.id]);
    // Library, hostel and transport.
    const [book] = (await q(`insert into library_books (tenant_id, title, author) values ($1, 'Accounting Basics', 'R. Rao') returning id`, [tid])).rows;
    await q(`insert into library_loans (tenant_id, book_id, student_id, due_on, issued_by, issued_at, fine_paise) values ($1, $2, $3, '2026-10-01', $4, '2026-09-20T05:00:00Z', 1300)`, [tid, book.id, A.id, people.librarian.id]);
    const [block] = (await q(`insert into hostel_blocks (tenant_id, name, gender) values ($1, 'Kaveri', 'female') returning id`, [tid])).rows;
    const [room] = (await q(`insert into hostel_rooms (tenant_id, block_id, number, floor) values ($1, $2, '101', 1) returning id`, [tid, block.id])).rows;
    const beds = (await q(`insert into hostel_beds (tenant_id, room_id, label) values ($1, $2, 'A'), ($1, $2, 'B') returning id`, [tid, room.id])).rows;
    await q(`insert into hostel_allotments (tenant_id, student_id, bed_id, starts_on, created_by) values ($1, $2, $3, '2026-08-01', $4)`, [tid, A.id, beds[0].id, t.principal.id]);
    const [route] = (await q(`insert into transport_routes (tenant_id, name) values ($1, 'Route 1') returning id`, [tid])).rows;
    const [stop] = (await q(`insert into transport_stops (tenant_id, route_id, name, seq, lat, lng, pickup_time) values ($1, $2, 'Market', 1, 12.9, 77.6, '07:30') returning id`, [tid, route.id])).rows;
    await q(`insert into transport_assignments (tenant_id, student_id, route_id, stop_id, starts_on) values ($1, $2, $3, $4, '2026-08-01'), ($1, $5, $3, $4, '2026-08-01')`, [tid, A.id, route.id, stop.id, B.id]);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('catalogue and library', () => {
    it('offers each role its datasets, and hides fields its people may not see', async () => {
      const cat = (await get('principal', `${S}/catalogue?lang=hi`).expect(200)).body;
      expect(cat.datasets.length).toBeGreaterThanOrEqual(15);
      const payroll = cat.datasets.find((d: { key: string }) => d.key === 'payroll');
      expect(payroll.fields.map((f: { key: string }) => f.key)).not.toContain('net');
      expect(payroll.label).toBe('वेतन');
      const hr = (await get('hr_manager', `${S}/catalogue`).expect(200)).body;
      expect(hr.datasets.find((d: { key: string }) => d.key === 'payroll').fields.map((f: { key: string }) => f.key)).toContain('net');
      expect(hr.datasets.map((d: { key: string }) => d.key)).not.toContain('fees');
      await get('parent', `${S}/catalogue`).expect(403);
    });

    it('ships more than 60 ready-made reports, each a valid builder definition', () => {
      expect(LIBRARY.length).toBeGreaterThanOrEqual(60);
      expect(new Set(LIBRARY.map((r) => r.key)).size).toBe(LIBRARY.length);
      for (const r of LIBRARY) expect(r.roles.length, r.key).toBeGreaterThan(0);
    });

    it('runs every library report and every field of every dataset without a SQL error', async () => {
      for (const r of LIBRARY) {
        const who = r.roles.includes('tenant_admin') ? 'tenant_admin' : r.roles.includes('principal') ? 'principal' : 'hr_manager';
        const res = await post(who, `${S}/library/${r.key}/run`, {});
        expect(res.status, `${r.key}: ${JSON.stringify(res.body)}`).toBe(200);
      }
      for (const ds of DATASETS) {
        for (const f of ds.fields) {
          const res = await preview('tenant_admin', ds.key, { groupBy: [f.key], aggregates: [{ fn: 'count' }] });
          expect(res.status, `${ds.key}.${f.key}: ${JSON.stringify(res.body)}`).toBe(200);
        }
        const detail = await preview('tenant_admin', ds.key, {});
        expect(detail.status, `${ds.key}: ${JSON.stringify(detail.body)}`).toBe(200);
      }
    }, 120_000);

    it('lists the library by role, in the reader’s language', async () => {
      const lib = (await get('accountant', `${S}/library?lang=kn`).expect(200)).body;
      expect(lib.reports.some((r: { key: string }) => r.key === 'fees.defaulters')).toBe(true);
      expect(lib.reports.some((r: { key: string }) => r.key === 'attendance.shortage')).toBe(false);
      expect(lib.reports.find((r: { key: string }) => r.key === 'fees.defaulters').title).toBe('ಶುಲ್ಕ ಬಾಕಿದಾರರು');
      await post('accountant', `${S}/library/attendance.shortage/run`, {}).expect(403);
      await post('accountant', `${S}/library/no.such/run`, {}).expect(404);
    });
  });

  describe('query compilation', () => {
    it('finds attendance shortage below 75% with a condition on totals', async () => {
      const r = (await post('principal', `${S}/library/attendance.shortage/run`, {}).expect(200)).body;
      expect(r.rows).toEqual([{ class: 'BCom Sem 3 A', roll_no: 'R2', student: 'Student B', count: 11, pct_true_is_present: 54.5 }]);
      expect(r.filters[0]).toContain('this academic year');
      const cls = (await post('principal', `${S}/library/attendance.class_wise/run`, {}).expect(200)).body;
      expect(cls.rows[0]).toMatchObject({ class: 'BCom Sem 3 A', pct_true_is_present: 77.4, count: 31 });
    });

    it('pivots dues by ageing bucket in their natural order, with row and column totals', async () => {
      const r = (await post('accountant', `${S}/library/fees.dues_ageing/run`, {}).expect(200)).body;
      expect(r.pivot.column).toBe('ageing');
      expect(r.columns.map((c: { label: string }) => c.label)).toEqual(['Class', 'Not yet due', '31-60 days', 'Over 90 days', 'Total']);
      expect(r.rows[0]).toMatchObject({ class: 'BCom Sem 3 A', sum_balance__p0: 1_000_000, sum_balance__p1: 600_000, sum_balance__p2: 200_000, sum_balance__total: 1_800_000 });
      expect(r.totals.sum_balance__total).toBe(1_800_000);
    });

    it('lists defaulters longest overdue first and totals the balance', async () => {
      const r = (await post('accountant', `${S}/library/fees.defaulters/run`, {}).expect(200)).body;
      expect(r.rows.map((x: { student: string; days_overdue: number }) => [x.student, x.days_overdue])).toEqual([['Student C', 135], ['Student A', 43]]);
      expect(r.totals.balance).toBe(800_000);
      expect(r.formatting[0]).toMatchObject({ column: 'days_overdue', tone: 'red' });
    });

    it('reports today’s collection and category and gender cross-tabs from applications', async () => {
      const daily = (await post('accountant', `${S}/library/collections.daily/run`, {}).expect(200)).body;
      expect(daily.rows).toHaveLength(1);
      expect(daily.rows[0]).toMatchObject({ receipt_no: 'RC-1', amount: 400_000, method: 'cash', collected_by: 'accountant person' });
      const cat = (await post('principal', `${S}/library/students.category_enrolment/run`, {}).expect(200)).body;
      expect(cat.columns.map((c: { label: string }) => c.label)).toEqual(['Program', 'GM', 'OBC', 'SC', 'Total']);
      expect(cat.rows[0]).toMatchObject({ program: 'BCom', count__p0: 1, count__p1: 1, count__p2: 1, count__total: 3 });
      const funnel = (await post('principal', `${S}/library/admissions.funnel/run`, {}).expect(200)).body;
      expect(funnel.rows.map((x: { status: string }) => x.status)).toEqual(['under_review', 'enrolled']);
    });

    it('filters by relative dates, pickers, money in rupees and lists', async () => {
      const count = async (filters: object[], dataset = 'fees') => (await preview('accountant', dataset, { aggregates: [{ fn: 'count' }], filters }).expect(200)).body.rows[0].count;
      expect(await count([{ field: 'due_on', op: 'relative', value: 'last_90_days' }])).toBe(2);
      expect(await count([{ field: 'due_on', op: 'relative', value: 'next_30_days' }])).toBe(1);
      expect(await count([{ field: 'class', op: 'eq', value: t.section.id }])).toBe(4);
      expect(await count([{ field: 'class', op: 'in', value: [t.otherSection.id] }])).toBe(0);
      expect(await count([{ field: 'class', op: 'eq', value: 'BCom Sem 3 A' }])).toBe(4);
      expect(await count([{ field: 'balance', op: 'between', value: [1000, 6000] }])).toBe(2);
      expect(await count([{ field: 'title', op: 'not_in', value: ['Lab'] }])).toBe(3);
      expect(await count([{ field: 'is_overdue', op: 'is_true' }])).toBe(2);
      expect(await count([{ field: 'paid_on', op: 'relative', value: 'this_month' }], 'collections')).toBe(2);
      const named = (await preview('accountant', 'fees', { aggregates: [{ fn: 'count' }], filters: [{ field: 'class', op: 'eq', value: t.section.id }] }).expect(200)).body;
      expect(named.filters).toEqual(['Class is BCom Sem 3 A']);
    });

    it('groups dates by month, computes % of total, and evaluates row and summary formulas', async () => {
      const months = (await preview('accountant', 'fees', { groupBy: ['due_on:month'], aggregates: [{ fn: 'sum', field: 'balance' }, { fn: 'pct', field: 'amount' }] }).expect(200)).body;
      expect(months.rows.map((r: { due_on__month: string }) => r.due_on__month)).toEqual(['2026-06', '2026-09', '2026-11']);
      expect(months.rows.map((r: { pct_amount: number }) => r.pct_amount)).toEqual([6.3, 62.5, 31.3]);
      const calc = (await preview('accountant', 'fees', {
        calculated: [{ key: 'state', label: 'State', expr: "if(balance > 0, 'Owes', 'Clear')" }, { key: 'collected', label: 'Collected %', expr: 'percent(sum(paid), sum(amount))', kind: 'measure' }],
        groupBy: ['state'],
        aggregates: [{ fn: 'count' }, { fn: 'measure', field: 'collected' }],
      }).expect(200)).body;
      expect(calc.rows).toEqual([{ state: 'Clear', count: 1, collected: 100 }, { state: 'Owes', count: 3, collected: 18.2 }]);
      expect(calc.totals).toMatchObject({ count: 4, collected: 43.8 });
    });

    it('checks formulas as they are typed', async () => {
      expect((await post('accountant', `${S}/formula`, { dataset: 'fees', expr: 'balance / 100' }).expect(200)).body).toEqual({ ok: true, type: 'money' });
      expect((await post('accountant', `${S}/formula`, { dataset: 'fees', expr: 'days_between(due_on, today())' }).expect(200)).body).toEqual({ ok: true, type: 'int' });
      const bad = (await post('accountant', `${S}/formula`, { dataset: 'fees', expr: 'sum(balance' }).expect(200)).body;
      expect(bad.ok).toBe(false);
      expect((await post('accountant', `${S}/formula`, { dataset: 'fees', expr: 'pg_sleep(5)' }).expect(200)).body.error).toContain('no function');
      expect((await post('accountant', `${S}/formula`, { dataset: 'fees', expr: 'sum(balance)', kind: 'row' }).expect(200)).body.ok).toBe(false);
    });

    it('drills from a summary cell to its rows', async () => {
      const def = { groupBy: ['title'], aggregates: [{ fn: 'sum', field: 'balance' }] };
      const r = (await post('accountant', `${S}/drill`, { source: { dataset: 'fees', definition: def }, cell: [{ ref: 'title', value: 'Tuition' }] }).expect(200)).body;
      expect(r.rows).toHaveLength(3);
      expect(r.columns.map((c: { key: string }) => c.key)).toContain('balance');
      const m = (await post('accountant', `${S}/drill`, { source: { dataset: 'fees', definition: { groupBy: ['due_on:month'] } }, cell: [{ ref: 'due_on:month', value: '2026-09' }] }).expect(200)).body;
      expect(m.rows).toHaveLength(2);
      await post('accountant', `${S}/drill`, { source: { dataset: 'fees', definition: def }, cell: [{ ref: 'status', value: 'due' }] }).expect(400);
    });

    it('rejects SQL injection and anything outside the catalogue', async () => {
      const bad = (definition: object, dataset = 'fees') => preview('accountant', dataset, definition);
      await bad({ columns: ['balance; drop table fee_invoices'] }).expect(400);
      await bad({ columns: ['password_hash'] }).expect(400);
      await bad({ groupBy: ['due_on:hour'] }).expect(400);
      await bad({ groupBy: ['title:month'] }).expect(400);
      await bad({ sort: [{ field: 'balance desc; --' }] }).expect(400);
      await bad({ filters: [{ field: 'due_on', op: 'relative', value: "today'; drop table students; --" }] }).expect(400);
      await bad({ filters: [{ field: 'due_on', op: 'gt', value: '2026-01-01; select 1' }] }).expect(400);
      await bad({ filters: [{ field: 'balance', op: 'raw', value: '1=1' }] }).expect(400);
      await bad({ calculated: [{ key: 'x', label: 'X', expr: "balance; delete from fee_invoices" }], columns: ['x'] }).expect(400);
      await bad({ calculated: [{ key: 'x', label: 'X', expr: 'current_setting(app.tenant_id)' }], columns: ['x'] }).expect(400);
      await bad({ having: [{ field: 'count) or (1=1', op: 'gt', value: 0 }], groupBy: ['title'] }).expect(400);
      await bad({}, 'fee_invoices i; drop table x').expect(400);
      await get('accountant', `${S}/datasets/fees/values/title%3Bdrop`).expect(400);
      // Values are only ever bound parameters: quotes find nothing and break nothing.
      const r = (await bad({ filters: [{ field: 'title', op: 'eq', value: "x' or '1'='1" }] }).expect(200)).body;
      expect(r.rows).toHaveLength(0);
      const lit = (await bad({ calculated: [{ key: 'x', label: 'X', expr: `concat(title, "'; drop table students; --")` }], columns: ['x'] }).expect(200)).body;
      expect(lit.rows.length).toBeGreaterThan(0);
      expect((await q('select count(*)::int as n from students where tenant_id = $1', [t.tenantId])).rows[0].n).toBe(3);
    });

    it('keeps salaries to HR and finance, and a teacher to their classes', async () => {
      await preview('principal', 'payroll', { aggregates: [{ fn: 'sum', field: 'net' }] }).expect(403);
      await preview('principal', 'payroll', { columns: ['name', 'gross'] }).expect(403);
      await preview('principal', 'payroll', { filters: [{ field: 'net', op: 'gt', value: 1 }] }).expect(403);
      const heads = (await preview('principal', 'payroll', { groupBy: ['department'] }).expect(200)).body;
      expect(heads.rows).toEqual([{ department: 'Commerce', count: 1 }, { department: 'No department', count: 1 }]);
      const hr = (await preview('hr_manager', 'payroll', { aggregates: [{ fn: 'sum', field: 'net' }] }).expect(200)).body;
      expect(hr.rows[0].sum_net).toBe(13_500_000);
      await preview('hr_manager', 'fees', {}).expect(403);
      await preview('teacher', 'fees', {}).expect(403);
      expect((await preview('teacher', 'attendance', { aggregates: [{ fn: 'count' }] }).expect(200)).body.rows[0].count).toBe(31);
      expect((await preview('teacher2', 'attendance', { aggregates: [{ fn: 'count' }] }).expect(200)).body.rows[0].count).toBe(0);
      await preview('teacher', 'students', { columns: ['phone'] }).expect(403);
    });

    it('keeps institutions apart', async () => {
      const mine = (await preview('principal', 'fees', { aggregates: [{ fn: 'sum', field: 'amount' }] }).expect(200)).body.rows[0].sum_amount;
      const theirs = (await preview('outsider', 'fees', { aggregates: [{ fn: 'sum', field: 'amount' }] }).expect(200)).body.rows[0].sum_amount;
      expect(mine).toBe(3_200_000);
      expect(theirs).toBe(9_999_900);
      const values = (await get('principal', `${S}/datasets/fees/values/class`).expect(200)).body;
      expect(values).toEqual([{ value: t.section.id, label: 'BCom Sem 3 A' }]);
    });
  });

  describe('saved reports', () => {
    let id: string;
    const def = { groupBy: ['title'], aggregates: [{ fn: 'sum', field: 'balance' }], chart: { type: 'bar', x: 'title', y: ['sum_balance'] } };

    it('saves, shares with roles that may see the data, and limits editing to the owner and leaders', async () => {
      await post('accountant', `${S}/reports`, { name: 'Dues by head', dataset: 'fees', definition: def, sharedRoles: ['teacher'] }).expect(400);
      id = (await post('accountant', `${S}/reports`, { name: 'Dues by head', folder: 'Fees', dataset: 'fees', definition: def, sharedRoles: ['accountant'] }).expect(201)).body.id;
      const theirs = (await get('cashier', `${S}/reports`).expect(200)).body;
      expect(theirs.find((r: { id: string }) => r.id === id)).toMatchObject({ name: 'Dues by head', mine: false, canEdit: false, folder: 'Fees' });
      expect((await post('cashier', `${S}/reports/${id}/run`, {}).expect(200)).body.rows).toHaveLength(2);
      await http().patch(`${S}/reports/${id}`).set(auth('cashier')).send({ name: 'Mine now' }).expect(403);
      await get('hr_manager', `${S}/reports/${id}`).expect(404);
      await get('outsider', `${S}/reports/${id}`).expect(404);
      expect((await get('principal', `${S}/reports`).expect(200)).body.some((r: { id: string }) => r.id === id)).toBe(true);
    });

    it('renames, moves between folders, duplicates and stars', async () => {
      await http().patch(`${S}/reports/${id}`).set(auth('accountant')).send({ name: 'Dues by fee head', folder: 'Monthly' }).expect(200);
      expect((await get('accountant', `${S}/folders`).expect(200)).body).toEqual([{ name: 'Monthly', count: 1 }]);
      expect((await post('accountant', `${S}/folders/rename`, { from: 'Monthly', to: 'Month end' }).expect(200)).body.moved).toBe(1);
      const copy = (await post('cashier', `${S}/reports/${id}/duplicate`, {}).expect(201)).body;
      expect(copy).toMatchObject({ name: 'Dues by fee head (copy)', createdBy: people.cashier.id, folder: '' });
      await http().put(`${S}/favourites`).set(auth('accountant')).send({ ref: `custom:${id}`, on: true }).expect(204);
      await http().put(`${S}/favourites`).set(auth('accountant')).send({ ref: 'lib:fees.defaulters', on: true }).expect(204);
      await http().put(`${S}/favourites`).set(auth('accountant')).send({ ref: 'lib:attendance.shortage', on: true }).expect(403);
      expect((await get('accountant', `${S}/reports`).expect(200)).body.find((r: { id: string }) => r.id === id).favourite).toBe(true);
      expect((await get('accountant', `${S}/library`).expect(200)).body.reports.find((r: { key: string }) => r.key === 'fees.defaulters').favourite).toBe(true);
      await http().delete(`${S}/reports/${copy.id}`).set(auth('cashier')).expect(204);
      const audited = await q("select action from audit_log where tenant_id = $1 and subject_id = $2 order by at", [t.tenantId, id]);
      expect(audited.rows.map((r) => r.action)).toEqual(expect.arrayContaining(['report.custom_created', 'report.custom_updated', 'report.custom_run']));
    });

    it('exports XLSX, CSV and PDF with the institution header, filters and totals', async () => {
      const xlsx = await post('accountant', `${S}/export`, { source: { libraryKey: 'fees.defaulters' }, format: 'xlsx' }).buffer(true).parse(binary).expect(200);
      expect(xlsx.headers['content-type']).toContain('spreadsheetml');
      expect(xlsx.headers['content-disposition']).toMatch(/fee-defaulters-2026-10-14\.xlsx/);
      const files = unzip(xlsx.body as Buffer);
      expect(Object.keys(files)).toEqual(expect.arrayContaining(['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']));
      const sheet = files['xl/worksheets/sheet1.xml'];
      expect(sheet).toContain(`Tenant `);
      expect(sheet).toContain('Fee defaulters');
      expect(sheet).toContain('Filters: Overdue is yes');
      expect(sheet).toContain('Generated by accountant person on 2026-10-14 11:30');
      expect(sheet).toContain('<v>8000</v>'); // the total, in rupees
      expect(sheet).toContain('state="frozen"');
      expect(sheet).toContain('<autoFilter');

      const csv = await post('accountant', `${S}/export`, { source: { reportId: id }, format: 'csv' }).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text).toContain('Fee head,Sum of Balance');
      expect(csv.text).toContain('Total,18000.00');

      const pdf = await post('accountant', `${S}/export`, { source: { dataset: 'fees', definition: { columns: ['student', 'title', 'balance'] }, title: 'Balances' }, format: 'pdf', lang: 'hi' }).buffer(true).parse(binary).expect(200);
      const text = (pdf.body as Buffer).toString('latin1');
      expect(text.startsWith('%PDF-1.4')).toBe(true);
      expect(text).toContain('/MediaBox [0 0 842 595]');
      expect(text).toContain('Balances');

      const exported = await q("select count(*)::int as n from audit_log where tenant_id = $1 and action = 'report.exported'", [t.tenantId]);
      expect(exported.rows[0].n).toBe(3);
      await post('hr_manager', `${S}/export`, { source: { reportId: id }, format: 'csv' }).expect(404);
    });
  });

  describe('schedules', () => {
    let scheduleId: string;

    it('validates recipients against the report’s data', async () => {
      const body = (recipients: object) => ({ source: { libraryKey: 'fees.defaulters' }, frequency: 'weekly', weekday: 3, hour: 8, format: 'xlsx', recipients });
      await post('accountant', `${S}/schedules`, body({ emails: [people.teacher.email] })).expect(400);
      await post('accountant', `${S}/schedules`, body({ roles: ['teacher'] })).expect(400);
      await post('accountant', `${S}/schedules`, body({ emails: ['nobody@x.in'] })).expect(400);
      await post('accountant', `${S}/schedules`, body({})).expect(400);
      const s1 = (await post('accountant', `${S}/schedules`, body({ emails: [people.principal.email], roles: ['accountant'] })).expect(201)).body;
      scheduleId = s1.id;
      // Next Wednesday at 08:00 in India.
      expect(new Date(s1.nextRunAt).toISOString()).toBe('2026-10-21T02:30:00.000Z');
    });

    it('emails the report when due and records the run', async () => {
      await q("update report_schedules set next_run_at = '2026-10-14T05:00:00Z' where id = $1", [scheduleId]);
      const sent = mailer.sent.length;
      expect(await app.get(ReportsService).runDue()).toBeGreaterThanOrEqual(1);
      const mail = mailer.sent[sent];
      expect(mail.to.sort()).toEqual([people.principal.email, people.accountant.email, people.cashier.email].map((e) => e.toLowerCase()).sort());
      expect(mail.attachments[0].filename).toMatch(/\.xlsx$/);
      expect(mail.subject).toContain('Fee defaulters');
      const runs = (await get('accountant', `${S}/schedules/${scheduleId}/runs`).expect(200)).body;
      expect(runs[0]).toMatchObject({ status: 'ok', rowCount: 2, format: 'xlsx', manual: false });
      const listed = (await get('accountant', `${S}/schedules`).expect(200)).body.find((x: { id: string }) => x.id === scheduleId);
      expect(listed).toMatchObject({ lastStatus: 'ok', active: true, failureCount: 0, title: 'Fee defaulters' });
      expect(new Date(listed.nextRunAt).getTime()).toBeGreaterThan(clock.now().getTime());
    });

    it('records failures and switches a schedule off after five in a row', async () => {
      const s2 = (await post('accountant', `${S}/schedules`, { source: { libraryKey: 'fees.invoice_status' }, frequency: 'daily', format: 'pdf', recipients: { emails: [people.cashier.email] } }).expect(201)).body;
      await q("update users set status = 'disabled' where id = $1", [people.cashier.id]);
      for (let i = 0; i < 5; i++) {
        const r = (await post('accountant', `${S}/schedules/${s2.id}/run-now`, {}).expect(200)).body;
        expect(r).toMatchObject({ ok: false });
        expect(r.error).toContain('Nobody to send to');
      }
      const row = (await q('select active, failure_count, last_status from report_schedules where id = $1', [s2.id])).rows[0];
      expect(row).toEqual({ active: false, failure_count: 5, last_status: 'failed' });
      expect((await get('accountant', `${S}/schedules/${s2.id}/runs`).expect(200)).body).toHaveLength(5);
      await q("update users set status = 'active' where id = $1", [people.cashier.id]);
      await http().patch(`${S}/schedules/${s2.id}`).set(auth('accountant')).send({ active: true }).expect(200);
      expect((await post('accountant', `${S}/schedules/${s2.id}/run-now`, {}).expect(200)).body).toMatchObject({ ok: true, recipients: 1 });
      expect(mailer.sent.at(-1)!.attachments[0].filename).toMatch(/\.pdf$/);
      await get('hr_manager', `${S}/schedules/${s2.id}/runs`).expect(404);
      await http().delete(`${S}/schedules/${s2.id}`).set(auth('accountant')).expect(204);
    });
  });

  describe('dashboards', () => {
    let dashId: string;
    let reportId: string;

    it('composes saved and library reports, and runs each widget as the viewer', async () => {
      reportId = (await post('principal', `${S}/reports`, { name: 'Strength', dataset: 'students', definition: { groupBy: ['class'] }, sharedRoles: ['hod'] }).expect(201)).body.id;
      const widgets = [
        { id: 'w1', ref: 'lib:attendance.class_wise', w: 6 },
        { id: 'w2', ref: 'lib:fees.defaulters', w: 6, chart: 'table' },
        { id: 'w3', ref: `custom:${reportId}`, w: 12, title: 'Students by class' },
      ];
      dashId = (await post('principal', `${S}/dashboards`, { name: 'Principal desk', widgets, sharedRoles: ['hod'] }).expect(201)).body.id;
      const data = (await post('principal', `${S}/dashboards/${dashId}/data`, {}).expect(200)).body.widgets;
      expect(data.map((w: { ok: boolean }) => w.ok)).toEqual([true, true, true]);
      expect(data[2]).toMatchObject({ title: 'Students by class' });
      const hod = (await post('hod', `${S}/dashboards/${dashId}/data`, { period: 'last_7_days' }).expect(200)).body.widgets;
      expect(hod.map((w: { ok: boolean; error?: string }) => w.ok || w.error)).toEqual([true, 'not_allowed', true]);
      await post('accountant', `${S}/dashboards/${dashId}/data`, {}).expect(404);
      await post('hod', `${S}/dashboards`, { name: 'Bad', widgets: [{ id: 'x', ref: 'lib:fees.defaulters' }] }).expect(403);
    });

    it('lets leaders make a dashboard a role’s home, one per role', async () => {
      await post('hod', `${S}/dashboards`, { name: 'Mine', defaultForRoles: ['hod'] }).expect(403);
      await http().put(`${S}/dashboards/${dashId}`).set(auth('principal')).send({ name: 'Principal desk', widgets: [{ id: 'w1', ref: 'lib:attendance.class_wise' }], sharedRoles: [], defaultForRoles: ['hod'] }).expect(200);
      expect((await get('hod', `${S}/dashboards/home`).expect(200)).body.dashboard).toEqual({ id: dashId, name: 'Principal desk' });
      const second = (await post('principal', `${S}/dashboards`, { name: 'HOD view', defaultForRoles: ['hod'] }).expect(201)).body.id;
      expect((await get('hod', `${S}/dashboards/home`).expect(200)).body.dashboard.id).toBe(second);
      expect((await q('select default_for_roles from report_dashboards where id = $1', [dashId])).rows[0].default_for_roles).toEqual([]);
      expect((await get('teacher', `${S}/dashboards/home`).expect(200)).body.dashboard).toBe(null);
    });

    it('drops a deleted report from dashboards', async () => {
      await http().put(`${S}/dashboards/${dashId}`).set(auth('principal')).send({ name: 'Principal desk', widgets: [{ id: 'w3', ref: `custom:${reportId}` }] }).expect(200);
      await http().delete(`${S}/reports/${reportId}`).set(auth('principal')).expect(204);
      expect((await get('principal', `${S}/dashboards/${dashId}`).expect(200)).body.widgets).toEqual([]);
      const dup = (await post('principal', `${S}/dashboards/${dashId}/duplicate`, {}).expect(201)).body;
      expect(dup.name).toBe('Principal desk (copy)');
      await http().delete(`${S}/dashboards/${dup.id}`).set(auth('hod')).expect(404);
      await http().delete(`${S}/dashboards/${dup.id}`).set(auth('principal')).expect(204);
    });
  });
});
