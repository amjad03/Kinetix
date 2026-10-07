import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

const R = (rupees: number) => rupees * 100;

describe('HR and payroll', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  // Tuesday 20 October 2026, 10:00 IST.
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
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
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(auth(who)).send(body);
  const audited = async (action: string) => (await owner.query('select count(*)::int as n from audit_log where tenant_id = $1 and action = $2', [t.tenantId, action])).rows[0].n as number;

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@hr.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
    return u;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const hr = await addUser('Hema HR', 'hr_manager');
    const acct = await addUser('Anil Accounts', 'accountant');
    const hod = await addUser('Hari Hod', 'hod');
    app = await createApp(clock);
    tokens = {
      hr: await login(t.slug, hr.email!),
      accountant: await login(t.slug, acct.email!),
      hod: await login(t.slug, hod.email!),
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      parent: await login(t.slug, t.guardian.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
    Object.assign(ids, { hr: hr.id, hod: hod.id, teacher: t.teacher.id, teacher2: t.teacher2.id, principal: t.principal.id });
    // A whole-institution holiday on Friday 2 October.
    await db.insert(s.calendarEvents).values({ tenantId: t.tenantId, kind: 'holiday', title: 'Gandhi Jayanti', startsOn: '2026-10-02', endsOn: '2026-10-02', createdBy: t.principal.id });
    await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Commerce', headUserId: hod.id });
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('staff records', () => {
    const profile = (code: string, over: object = {}) => ({ employeeCode: code, employmentType: 'permanent', dateOfJoining: '2026-04-01', status: 'active', taxRegime: 'new', pan: 'ABCDE1234F', uan: '100200300400', expectedVersion: 0, ...over });

    it('is closed to people who are not HR, and students and parents are not staff', async () => {
      await get('teacher', '/v1/hr/staff').expect(403);
      await get('parent', '/v1/hr/me').expect(403);
      await put('teacher', `/v1/hr/staff/${ids.teacher}`, profile('T001')).expect(403);
    });

    it('lists the staff, including those with no HR record yet', async () => {
      const staff = (await get('hr', '/v1/hr/staff').expect(200)).body as { userId: string; employeeCode: string | null }[];
      expect(staff.map((x) => x.userId)).toEqual(expect.arrayContaining([ids.teacher, ids.teacher2, ids.principal, ids.hr]));
      expect(staff.find((x) => x.userId === ids.teacher)?.employeeCode).toBeNull();
      expect(staff.some((x) => x.userId === t.studentUser.id || x.userId === t.guardian.id)).toBe(false);
    });

    it('creates and updates a record with optimistic concurrency, validated and audited', async () => {
      const des = (await post('hr', '/v1/hr/designations', { name: 'Senior Lecturer', grade: 'L3' }).expect(201)).body;
      await post('hr', '/v1/hr/designations', { name: 'Senior Lecturer' }).expect(409);
      const [dept] = await db.select().from(s.departments);
      await put('hr', `/v1/hr/staff/${ids.teacher}`, profile('T001', { pan: 'bad' })).expect(400);
      const created = (await put('hr', `/v1/hr/staff/${ids.teacher}`, profile('T001', { designationId: des.id, departmentId: dept.id })).expect(200)).body;
      expect(created).toMatchObject({ employeeCode: 'T001', version: 1, designation: { name: 'Senior Lecturer' }, department: { name: 'Commerce' }, bank: null });
      // A second create or a stale update is refused; a matching version succeeds.
      await put('hr', `/v1/hr/staff/${ids.teacher}`, profile('T001')).expect(409);
      const updated = (await put('hr', `/v1/hr/staff/${ids.teacher}`, profile('T001', { expectedVersion: 1, taxRegime: 'old', tax80cPaise: R(50_000), designationId: des.id, departmentId: dept.id })).expect(200)).body;
      expect(updated).toMatchObject({ version: 2, taxRegime: 'old', tax80cPaise: R(50_000) });
      await put('hr', `/v1/hr/staff/${ids.teacher}`, profile('T001', { expectedVersion: 1 })).expect(409);
      // Employee codes are unique per institution.
      await put('hr', `/v1/hr/staff/${ids.teacher2}`, profile('T001')).expect(409);
      await put('hr', `/v1/hr/staff/${ids.teacher2}`, profile('T002', { pan: null, uan: null })).expect(200);
      await put('hr', `/v1/hr/staff/${ids.principal}`, profile('P001', { pfEnabled: false, ptEnabled: false })).expect(200);
      await put('hr', `/v1/hr/staff/${t.studentUser.id}`, profile('S001')).expect(404);
      expect(await audited('hr.staff_created')).toBe(3);
      expect(await audited('hr.staff_updated')).toBe(1);
    });

    it('encrypts the bank account at rest and shows only the last four digits', async () => {
      await put('hr', `/v1/hr/staff/${ids.hod}/bank`, { accountHolder: 'Hari', bankName: 'HDFC', ifsc: 'HDFC0001234', accountNumber: '123456789012' }).expect(409);
      await put('hr', `/v1/hr/staff/${ids.teacher}/bank`, { accountHolder: 'Teacher', bankName: 'HDFC Bank', ifsc: 'hdfc0001234', accountNumber: '12ab' }).expect(400);
      const bank = (await put('hr', `/v1/hr/staff/${ids.teacher}/bank`, { accountHolder: 'Teacher', bankName: 'HDFC Bank', ifsc: 'hdfc0001234', accountNumber: '501001234567' }).expect(200)).body;
      expect(bank).toEqual({ accountHolder: 'Teacher', bankName: 'HDFC Bank', ifsc: 'HDFC0001234', accountLast4: '4567' });
      const row = (await owner.query('select bank_account_enc, bank_account_last4 from staff_profiles where user_id = $1', [ids.teacher])).rows[0];
      expect(row.bank_account_enc).toMatch(/^v1\./);
      expect(row.bank_account_enc).not.toContain('501001234567');
      expect(row.bank_account_last4).toBe('4567');
      const mine = (await get('teacher', '/v1/hr/me').expect(200)).body;
      expect(JSON.stringify(mine)).not.toContain('501001234567');
      expect(mine.bank).toMatchObject({ accountLast4: '4567' });
      const log = (await owner.query("select data from audit_log where tenant_id = $1 and action = 'hr.bank_updated'", [t.tenantId])).rows;
      expect(JSON.stringify(log)).not.toContain('501001234567');
      // Staff cannot read another person's record.
      await get('teacher2', `/v1/hr/staff/${ids.teacher}`).expect(403);
    });

    it('keeps institutions apart', async () => {
      await get('outsider', `/v1/hr/staff/${ids.teacher}`).expect(404);
      const theirs = (await get('outsider', '/v1/hr/staff').expect(200)).body as { userId: string }[];
      expect(theirs.some((x) => x.userId === ids.teacher)).toBe(false);
    });
  });

  describe('staff attendance', () => {
    it('checks in from the app once, keeps the first time, and checks out', async () => {
      const first = (await post('teacher', '/v1/hr/attendance/check-in').expect(200)).body;
      expect(first).toMatchObject({ date: '2026-10-20', status: 'present', source: 'app', checkInAt: '2026-10-20T04:30:00.000Z', checkOutAt: null });
      clock.at = new Date('2026-10-20T06:00:00Z');
      expect((await post('teacher', '/v1/hr/attendance/check-in').expect(200)).body.checkInAt).toBe('2026-10-20T04:30:00.000Z');
      clock.at = new Date('2026-10-20T11:30:00Z');
      expect((await post('teacher', '/v1/hr/attendance/check-out').expect(200)).body.checkOutAt).toBe('2026-10-20T11:30:00.000Z');
      await post('teacher2', '/v1/hr/attendance/check-out').expect(409);
      const me = (await get('teacher', '/v1/hr/attendance/me').expect(200)).body;
      expect(me.today.status).toBe('present');
      expect(me.days).toHaveLength(1);
      clock.at = new Date('2026-10-20T04:30:00Z');
    });

    it('lets HR mark by hand, never in the future, and lists everyone for the day', async () => {
      await put('hr', '/v1/hr/attendance', { date: '2026-10-05', entries: [{ userId: ids.teacher2, status: 'absent', note: 'No call' }] }).expect(200);
      await put('hr', '/v1/hr/attendance', { date: '2026-10-06', entries: [{ userId: ids.teacher2, status: 'half_day' }] }).expect(200);
      await put('hr', '/v1/hr/attendance', { date: '2026-10-21', entries: [{ userId: ids.teacher2, status: 'present' }] }).expect(400);
      await put('teacher', '/v1/hr/attendance', { date: '2026-10-05', entries: [{ userId: ids.teacher2, status: 'present' }] }).expect(403);
      const rows = (await get('hr', '/v1/hr/attendance?date=2026-10-05').expect(200)).body as { userId: string; status: string | null; source: string | null }[];
      expect(rows.find((r) => r.userId === ids.teacher2)).toMatchObject({ status: 'absent', source: 'manual' });
      expect(rows.find((r) => r.userId === ids.principal)?.status).toBeNull();
    });

    it('imports a biometric CSV, reports bad lines and never overwrites a manual mark', async () => {
      const csv = ['employee_code,date,in_time,out_time', 'T001,2026-10-07,09:10,17:20', 'T001,07-10-2026,08:58,12:00', 'T002,2026-10-05,09:00,17:00', 'ZZZ,2026-10-07,09:00,17:00', 'T001,not-a-date,09:00,17:00'].join('\n');
      const r = (await post('hr', '/v1/hr/attendance/import', { csv }).expect(200)).body;
      expect(r.imported).toBe(1);
      expect(r.errors.map((e: { line: number }) => e.line)).toEqual([4, 5, 6]);
      expect(r.errors[0].error).toMatch(/Already marked by hand/);
      const day = (await get('hr', '/v1/hr/attendance?date=2026-10-07').expect(200)).body as { userId: string; source: string; checkInAt: string }[];
      // 08:58 IST is 03:28 UTC.
      expect(day.find((d) => d.userId === ids.teacher)).toMatchObject({ source: 'biometric', checkInAt: '2026-10-07T03:28:00.000Z' });
      await post('teacher', '/v1/hr/attendance/import', { csv }).expect(403);
      expect(await audited('hr.attendance_imported')).toBe(1);
    });
  });

  describe('leave', () => {
    let clId: string;
    let lopId: string;
    let req1: string;

    it('creates the default leave types and shows balances accrued to date', async () => {
      const types = (await get('teacher', '/v1/hr/leave-types').expect(200)).body as { id: string; code: string }[];
      expect(types.map((x) => x.code)).toEqual(['CL', 'EL', 'LOP', 'SL']);
      clId = types.find((x) => x.code === 'CL')!.id;
      lopId = types.find((x) => x.code === 'LOP')!.id;
      const bal = (await get('teacher', '/v1/hr/leave/balances/me').expect(200)).body as { leaveType: { code: string }; accrued: number; available: number }[];
      // Joined in April: April to October is 7 months of 1 day.
      expect(bal.find((b) => b.leaveType.code === 'CL')).toMatchObject({ accrued: 7, available: 7 });
      expect(bal.find((b) => b.leaveType.code === 'SL')).toMatchObject({ accrued: 10, available: 10 });
    });

    it('applies for working days only: weekly offs and holidays are excluded', async () => {
      // Thu 1 – Mon 5 October: the 2nd is a holiday and the 4th a Sunday.
      const r = (await post('teacher', '/v1/hr/leave/requests', { leaveTypeId: clId, fromDate: '2026-10-01', toDate: '2026-10-05', reason: 'Family' }).expect(201)).body;
      expect(r).toMatchObject({ days: 3, status: 'pending', user: { id: ids.teacher } });
      req1 = r.id;
      const bal = (await get('teacher', '/v1/hr/leave/balances/me').expect(200)).body as { leaveType: { code: string }; pending: number; available: number }[];
      expect(bal.find((b) => b.leaveType.code === 'CL')).toMatchObject({ pending: 3, available: 4 });
      // Only non-working days: nothing to apply for. A half day must be a single day.
      await post('teacher', '/v1/hr/leave/requests', { leaveTypeId: clId, fromDate: '2026-10-04', toDate: '2026-10-04' }).expect(400);
      await post('teacher', '/v1/hr/leave/requests', { leaveTypeId: clId, fromDate: '2026-10-12', toDate: '2026-10-13', halfDay: true }).expect(400);
      await post('teacher', '/v1/hr/leave/requests', { leaveTypeId: clId, fromDate: '2026-10-05', toDate: '2026-10-06' }).expect(409); // overlaps
      await post('teacher', '/v1/hr/leave/requests', { leaveTypeId: clId, fromDate: '2026-11-02', toDate: '2026-11-13' }).expect(409); // 10 days with 4 left
    });

    it('is approved by HR or the head of department, never by the applicant', async () => {
      await post('teacher', `/v1/hr/leave/requests/${req1}/approve`).expect(403);
      await post('teacher2', `/v1/hr/leave/requests/${req1}/approve`).expect(403);
      // The head of Commerce is not the head of the applicant's department until they head it: Hari does (seeded department).
      await db.update(s.departments).set({ headUserId: ids.hod });
      expect((await get('hod', '/v1/hr/leave/requests?status=pending').expect(200)).body).toHaveLength(1);
      const approved = (await post('hod', `/v1/hr/leave/requests/${req1}/approve`, { note: 'Enjoy' }).expect(200)).body;
      expect(approved).toMatchObject({ status: 'approved', decidedBy: { id: ids.hod }, decisionNote: 'Enjoy' });
      await post('hr', `/v1/hr/leave/requests/${req1}/reject`).expect(409);
      const inbox = (await get('teacher', '/v1/notifications').expect(200)).body.items as { kind: string; title: string }[];
      expect(inbox.find((n) => n.kind === 'leave')?.title).toBe('Your leave was approved');
      const used = (await get('teacher', '/v1/hr/leave/balances/me').expect(200)).body as { leaveType: { code: string }; used: number; pending: number }[];
      expect(used.find((b) => b.leaveType.code === 'CL')).toMatchObject({ used: 3, pending: 0 });
      await post('hr', '/v1/hr/leave/requests', {}).expect(400);
      expect(await audited('leave.approved')).toBe(1);
    });

    it('lets the applicant cancel a pending request but not someone else’s', async () => {
      const r = (await post('teacher2', '/v1/hr/leave/requests', { leaveTypeId: lopId, fromDate: '2026-10-08', toDate: '2026-10-09', reason: 'Personal' }).expect(201)).body;
      await post('teacher', `/v1/hr/leave/requests/${r.id}/cancel`).expect(404);
      await post('principal', `/v1/hr/leave/requests/${r.id}/approve`).expect(200);
      // An approved leave that has not started can still be cancelled; this one is over.
      await post('teacher2', `/v1/hr/leave/requests/${r.id}/cancel`).expect(409);
      const again = (await post('teacher2', '/v1/hr/leave/requests', { leaveTypeId: lopId, fromDate: '2026-12-07', toDate: '2026-12-07' }).expect(201)).body;
      expect((await post('teacher2', `/v1/hr/leave/requests/${again.id}/cancel`).expect(200)).body.status).toBe('cancelled');
      expect((await get('teacher2', '/v1/hr/leave/requests/me').expect(200)).body).toHaveLength(2);
    });

    it('carries forward up to the cap, repeatably', async () => {
      await post('teacher', '/v1/hr/leave/carry-forward', { fromYear: 2026 }).expect(403);
      await post('hr', '/v1/hr/leave/carry-forward', { fromYear: 2026 }).expect(200);
      await post('hr', '/v1/hr/leave/carry-forward', { fromYear: 2026 }).expect(200);
      const next = (await get('hr', `/v1/hr/leave/balances?userId=${ids.teacher}&year=2027`).expect(200)).body as { leaveType: { code: string }; opening: number }[];
      // Earned leave: 15 a year from April is 9 months = 11.25, to the half day 11.5; casual leave does not carry.
      expect(next.find((b) => b.leaveType.code === 'EL')?.opening).toBe(11.5);
      expect(next.find((b) => b.leaveType.code === 'CL')?.opening).toBe(0);
    });

    it('lists the institution holidays from the calendar', async () => {
      const h = (await get('teacher', '/v1/hr/holidays?from=2026-10-01&to=2026-10-31').expect(200)).body;
      expect(h).toEqual([{ date: '2026-10-02', title: 'Gandhi Jayanti' }]);
    });
  });

  describe('recruitment', () => {
    it('runs an opening through to a hire', async () => {
      await get('teacher', '/v1/hr/openings').expect(403);
      const o = (await post('hr', '/v1/hr/openings', { title: 'Physics lecturer', positions: 2, closesOn: '2026-11-30' }).expect(201)).body;
      expect(o).toMatchObject({ title: 'Physics lecturer', status: 'open', pipeline: {} });
      const a = (await post('hr', `/v1/hr/openings/${o.id}/applicants`, { fullName: 'Ravi K', email: 'ravi@example.com' }).expect(201)).body;
      expect(a.stage).toBe('applied');
      await put('hr', `/v1/hr/applicants/${a.id}/stage`, { stage: 'interview', note: 'Panel on Friday' }).expect(200);
      const hired = (await put('hr', `/v1/hr/applicants/${a.id}/stage`, { stage: 'hired' }).expect(200)).body;
      expect(hired.stageHistory.map((h: { stage: string }) => h.stage)).toEqual(['applied', 'interview', 'hired']);
      await put('hr', `/v1/hr/applicants/${a.id}/stage`, { stage: 'rejected' }).expect(409);
      expect((await get('hr', '/v1/hr/openings').expect(200)).body[0].pipeline).toEqual({ hired: 1 });
      await put('hr', `/v1/hr/openings/${o.id}`, { title: 'Physics lecturer', positions: 2, status: 'closed' }).expect(200);
      await post('hr', `/v1/hr/openings/${o.id}/applicants`, { fullName: 'Late Applicant' }).expect(409);
    });
  });

  describe('payroll', () => {
    let aprilRun: { id: string; version: number };
    let octRun: { id: string; version: number };
    const slip = (run: { payslips: { user: { id: string } }[] }, userId: string) => run.payslips.find((p) => p.user.id === userId) as unknown as { grossPaise: number; netPaise: number; deductions: { code: string; amountPaise: number }[]; lopDays: number; paidDays: number; earnings: { amountPaise: number }[]; employer: { epfPaise: number; epsPaise: number } };

    it('sets salary structures from components, only for payroll staff', async () => {
      await owner.query("update staff_profiles set tax_regime = 'new' where user_id = $1", [ids.teacher]);
      const comps = (await get('accountant', '/v1/payroll/components').expect(200)).body as { id: string; code: string }[];
      const c = Object.fromEntries(comps.map((x) => [x.code, x.id]));
      await put('teacher', `/v1/payroll/structures/${ids.teacher}`, { effectiveFrom: '2026-04-01', lines: [{ componentId: c.BASIC, monthlyPaise: R(1) }] }).expect(403);
      await put('accountant', `/v1/payroll/structures/${ids.teacher}`, { effectiveFrom: '2026-04-01', lines: [{ componentId: c.LOAN, monthlyPaise: R(1_000) }] }).expect(409); // no earning
      const st = (await put('accountant', `/v1/payroll/structures/${ids.teacher}`, { effectiveFrom: '2026-04-01', lines: [{ componentId: c.BASIC, monthlyPaise: R(1_00_000) }, { componentId: c.HRA, monthlyPaise: R(50_000) }, { componentId: c.SPL, monthlyPaise: R(50_000) }] }).expect(200)).body;
      expect(st.monthlyGrossPaise).toBe(R(2_00_000));
      await put('accountant', `/v1/payroll/structures/${ids.teacher2}`, { effectiveFrom: '2026-04-01', lines: [{ componentId: c.BASIC, monthlyPaise: R(20_000) }, { componentId: c.HRA, monthlyPaise: R(8_000) }] }).expect(200);
      const read = (await get('hr', `/v1/payroll/structures/${ids.teacher}`).expect(200)).body;
      expect(read.current.lines.map((l: { code: string }) => l.code)).toEqual(['BASIC', 'HRA', 'SPL']);
      expect(await audited('payroll.structure_saved')).toBe(2);
    });

    it('computes April: PF 1,800, PT 200 and TDS 24,375 on ₹2 lakh a month; the principal has no PF or PT', async () => {
      const run = (await post('accountant', '/v1/payroll/runs', { month: '2026-04' }).expect(201)).body;
      aprilRun = run;
      expect(run).toMatchObject({ month: '2026-04', status: 'draft', staffCount: 2 });
      expect(run.skipped.map((x: { reason: string }) => x.reason)).toEqual(expect.arrayContaining(['No salary structure', 'No HR record']));
      const p = slip(run, ids.teacher);
      expect(p.deductions).toEqual([{ code: 'PF', name: 'Provident Fund', amountPaise: R(1_800) }, { code: 'PT', name: 'Professional Tax', amountPaise: R(200) }, { code: 'TDS', name: 'Income Tax (TDS)', amountPaise: R(24_375) }]);
      expect(p).toMatchObject({ grossPaise: R(2_00_000), netPaise: R(1_73_625) });
      expect(p.employer).toMatchObject({ epfPaise: R(550), epsPaise: R(1_250) });
      await post('accountant', '/v1/payroll/runs', { month: '2026-04' }).expect(409);
      await post('accountant', '/v1/payroll/runs', { month: '2026-11' }).expect(409);
    });

    it('needs the principal to approve and lock, with the version the approver saw', async () => {
      await post('accountant', `/v1/payroll/runs/${aprilRun.id}/approve`, { expectedVersion: aprilRun.version }).expect(403);
      await post('hr', `/v1/payroll/runs/${aprilRun.id}/lock`, { expectedVersion: aprilRun.version }).expect(403);
      await get('hr', `/v1/payroll/runs/${aprilRun.id}/tally.xml`).expect(409); // still a draft
      await post('principal', `/v1/payroll/runs/${aprilRun.id}/approve`, { expectedVersion: aprilRun.version + 5 }).expect(409);
      const approved = (await post('principal', `/v1/payroll/runs/${aprilRun.id}/approve`, { expectedVersion: aprilRun.version }).expect(200)).body;
      expect(approved).toMatchObject({ status: 'approved', version: aprilRun.version + 1 });
      await post('accountant', `/v1/payroll/runs/${aprilRun.id}/recompute`).expect(409);
      await post('principal', `/v1/payroll/runs/${aprilRun.id}/lock`, { expectedVersion: aprilRun.version }).expect(409);
      const locked = (await post('principal', `/v1/payroll/runs/${aprilRun.id}/lock`, { expectedVersion: approved.version }).expect(200)).body;
      expect(locked.status).toBe('locked');
      await post('principal', `/v1/payroll/runs/${aprilRun.id}/reopen`, { expectedVersion: locked.version }).expect(409);
      await put('hr', '/v1/hr/attendance', { date: '2026-04-06', entries: [{ userId: ids.teacher, status: 'absent' }] }).expect(409); // locked month
      expect(await audited('payroll.run_approved')).toBe(1);
      expect(await audited('payroll.run_locked')).toBe(1);
    });

    it('carries the year to date forward: May TDS is still ₹24,375, and months lock in order', async () => {
      const may = (await post('accountant', '/v1/payroll/runs', { month: '2026-05' }).expect(201)).body;
      expect(slip(may, ids.teacher).deductions.find((d) => d.code === 'TDS')?.amountPaise).toBe(R(24_375));
      const oct = (await post('accountant', '/v1/payroll/runs', { month: '2026-10' }).expect(201)).body;
      const octApproved = (await post('principal', `/v1/payroll/runs/${oct.id}/approve`, { expectedVersion: oct.version }).expect(200)).body;
      expect((await post('principal', `/v1/payroll/runs/${oct.id}/lock`, { expectedVersion: octApproved.version }).expect(409)).body.message).toBe('Lock 2026-05 first');
      const mayApproved = (await post('principal', `/v1/payroll/runs/${may.id}/approve`, { expectedVersion: may.version }).expect(200)).body;
      await post('principal', `/v1/payroll/runs/${may.id}/lock`, { expectedVersion: mayApproved.version }).expect(200);
      await post('principal', `/v1/payroll/runs/${oct.id}/reopen`, { expectedVersion: octApproved.version }).expect(200);
      await owner.query('delete from payroll_runs where id = $1', [oct.id]);
    });

    it('computes October with loss of pay from attendance and unpaid leave', async () => {
      const run = (await post('accountant', '/v1/payroll/runs', { month: '2026-10' }).expect(201)).body;
      octRun = run;
      // 5 Oct absent (1), 6 Oct half day (0.5), 8–9 Oct unpaid leave (2); 2 Oct is a holiday: 3.5 days of 31.
      const p = slip(run, ids.teacher2);
      expect(p).toMatchObject({ lopDays: 3.5, paidDays: 27.5, grossPaise: R(17_742 + 7_097) });
      expect(p.deductions).toEqual([{ code: 'PF', name: 'Provident Fund', amountPaise: R(1_800) }]);
      expect(p.netPaise).toBe(R(24_839 - 1_800));
      // Teacher: five days of approved paid casual leave and attendance: no loss of pay.
      expect(slip(run, ids.teacher)).toMatchObject({ lopDays: 0, grossPaise: R(2_00_000) });
      expect(await audited('payroll.run_created')).toBeGreaterThanOrEqual(3);
    });

    it('recomputes a draft when the records change', async () => {
      await put('hr', '/v1/hr/attendance', { date: '2026-10-07', entries: [{ userId: ids.teacher2, status: 'absent' }] }).expect(200);
      const r = (await post('accountant', `/v1/payroll/runs/${octRun.id}/recompute`, { expectedVersion: octRun.version }).expect(200)).body;
      expect(slip(r, ids.teacher2).lopDays).toBe(4.5);
      await post('accountant', `/v1/payroll/runs/${octRun.id}/recompute`, { expectedVersion: octRun.version }).expect(409); // stale
      octRun = r;
    });

    it('exports bank, statutory and Tally files from an approved run, audited', async () => {
      const approved = (await post('principal', `/v1/payroll/runs/${octRun.id}/approve`, { expectedVersion: octRun.version }).expect(200)).body;
      const bank = await get('accountant', `/v1/payroll/runs/${octRun.id}/bank-transfer.csv`).expect(200);
      expect(bank.headers['content-type']).toContain('text/csv');
      expect(decodeURIComponent(bank.headers['x-missing-bank'])).toBe('teacher2-' + t.teacher2.email!.match(/teacher2-(\d+)/)![1]);
      const net = slip((await get('hr', `/v1/payroll/runs/${octRun.id}`).expect(200)).body, ids.teacher).netPaise;
      expect(bank.text.trim().split('\r\n')).toEqual(['Beneficiary Name,Account Number,IFSC,Amount,Narration', `Teacher,501001234567,HDFC0001234,${(net / 100).toFixed(2)},Salary October 2026`]);
      const pf = (await get('hr', `/v1/payroll/runs/${octRun.id}/statutory.csv?kind=pf`).expect(200)).text.trim().split('\r\n');
      expect(pf[1]).toBe(`100200300400,${t.teacher.fullName},200000,15000,15000,15000,1800,1250,550,0,0`);
      await get('hr', `/v1/payroll/runs/${octRun.id}/statutory.csv?kind=nope`).expect(400);
      expect((await get('hr', `/v1/payroll/runs/${octRun.id}/statutory.csv?kind=pt`).expect(200)).text).toContain('200.00');
      const tally = (await get('accountant', `/v1/payroll/runs/${octRun.id}/tally.xml`).expect(200)).text;
      expect(tally).toContain('<DATE>20261031</DATE>');
      expect(tally).toContain('<NARRATION>Salary for October 2026</NARRATION>');
      expect(tally).toContain('<LEDGERNAME>Salary Payable</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>');
      await get('teacher', `/v1/payroll/runs/${octRun.id}/bank-transfer.csv`).expect(403);
      expect(await audited('payroll.export_bank')).toBe(1);
      expect(await audited('payroll.export_tally')).toBe(1);
      const reopened = (await post('principal', `/v1/payroll/runs/${octRun.id}/reopen`, { expectedVersion: approved.version }).expect(200)).body;
      expect(reopened.status).toBe('draft');
      octRun = (await post('principal', `/v1/payroll/runs/${octRun.id}/approve`, { expectedVersion: reopened.version }).expect(200)).body;
    });

    it('publishes payslips to their owners when the run is locked, with a PDF', async () => {
      expect((await get('teacher', '/v1/payroll/payslips/me').expect(200)).body.map((p: { month: string }) => p.month)).toEqual(['2026-05', '2026-04']);
      const locked = (await post('principal', `/v1/payroll/runs/${octRun.id}/lock`, { expectedVersion: octRun.version }).expect(200)).body;
      const mine = (await get('teacher', '/v1/payroll/payslips/me').expect(200)).body as { id: string; month: string; runStatus: string }[];
      expect(mine.map((p) => p.month)).toEqual(['2026-10', '2026-05', '2026-04']);
      const pdf = await get('teacher', `/v1/payroll/payslips/${mine[0].id}/pdf`).buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      }).expect(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect((pdf.body as Buffer).subarray(0, 8).toString()).toBe('%PDF-1.4');
      expect((pdf.body as Buffer).toString('latin1')).toContain('Net pay');
      // Not someone else's, and a staff member who is not in payroll sees none.
      const theirs = (await get('teacher2', '/v1/payroll/payslips/me').expect(200)).body as { id: string }[];
      await get('teacher2', `/v1/payroll/payslips/${mine[0].id}`).expect(404);
      await get('accountant', `/v1/payroll/payslips/${mine[0].id}`).expect(200);
      expect(theirs).toHaveLength(3);
      expect((await get('teacher', '/v1/notifications').expect(200)).body.items.some((n: { kind: string }) => n.kind === 'payslip')).toBe(true);
      expect(locked.status).toBe('locked');
      await get('outsider', `/v1/payroll/runs/${octRun.id}`).expect(404);
    });

    it('edits statutory settings only as principal, with validation', async () => {
      const cur = (await get('accountant', '/v1/payroll/settings').expect(200)).body;
      expect(cur.ptSlabs).toEqual([{ minGrossPaise: 0, amountPaise: 0 }, { minGrossPaise: R(25_000), amountPaise: R(200), februaryAmountPaise: R(300) }]);
      await put('accountant', '/v1/payroll/settings', cur).expect(403);
      await put('principal', '/v1/payroll/settings', { ...cur, ptSlabs: [{ minGrossPaise: R(1), amountPaise: 0 }] }).expect(400);
      expect((await put('principal', '/v1/payroll/settings', { ...cur, pfCapAtCeiling: false }).expect(200)).body.pfCapAtCeiling).toBe(false);
      expect(await audited('payroll.settings_updated')).toBe(1);
    });
  });
});
