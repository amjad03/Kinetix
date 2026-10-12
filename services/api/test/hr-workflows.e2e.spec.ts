import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { loanSchedule } from '../src/hr/hr-workflows.controller.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('HR workflows: settings, two-step leave, loans, encashment, service book, requisitions, payroll steps, reports', () => {
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
  const R = (rupees: number) => rupees * 100;

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@wf.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
    return u;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const hr = await addUser('Hema HR', 'hr_manager');
    const hod = await addUser('Hari Hod', 'hod');
    const acc = await addUser('Anu Accounts', 'accountant');
    app = await createApp(clock);
    tokens = {
      hr: await login(t.slug, hr.email!),
      hod: await login(t.slug, hod.email!),
      accountant: await login(t.slug, acc.email!),
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
    Object.assign(ids, { hr: hr.id, hod: hod.id, teacher: t.teacher.id, teacher2: t.teacher2.id });
    const [dept] = await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Commerce', headUserId: hod.id }).returning();
    ids.dept = dept.id;
    await db.insert(s.staffProfiles).values({ tenantId: t.tenantId, userId: t.teacher.id, employeeCode: 'E100', departmentId: dept.id, dateOfJoining: '2020-06-01', gender: 'female' });
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('keeps module settings and numbers new employees from the series', async () => {
    const s0 = (await get('hr', '/v1/hr/module-settings').expect(200)).body;
    expect(s0).toMatchObject({ leaveLevels: 1, preview: { employeeCode: 'EMP/0001' } });
    await get('teacher', '/v1/hr/module-settings').expect(403);
    await put('hr', '/v1/hr/module-settings', { ...s0, preview: undefined, leaveLevels: 3 }).expect(400);
    const saved = (await put('hr', '/v1/hr/module-settings', { ...s0, preview: undefined, leaveLevels: 2, employeeSeries: { prefix: 'SVK/', next: 41, digits: 3, suffix: '' } }).expect(200)).body;
    expect(saved.preview.employeeCode).toBe('SVK/041');
    const prof = (await put('hr', `/v1/hr/staff/${ids.teacher2}`, { dateOfJoining: '2026-07-01' }).expect(200)).body;
    expect(prof.employeeCode).toBe('SVK/041');
    expect((await get('hr', '/v1/hr/module-settings').expect(200)).body.preview.employeeCode).toBe('SVK/042');
    await get('outsider', '/v1/hr/module-settings').expect(200).expect((r) => expect(r.body.leaveLevels).toBe(1));
  });

  it('routes leave through the head of department and then the principal', async () => {
    const types = (await get('teacher', '/v1/hr/leave-types').expect(200)).body as { id: string; code: string }[];
    const cl = types.find((x) => x.code === 'CL')!;
    const req = (await post('teacher', '/v1/hr/leave/requests', { leaveTypeId: cl.id, fromDate: '2026-10-22', toDate: '2026-10-22', reason: 'Family function' }).expect(201)).body;
    const rec = (await post('hod', `/v1/hr/leave/requests/${req.id}/approve`, { note: 'Classes covered' }).expect(200)).body;
    expect(rec).toMatchObject({ status: 'recommended', recommendedBy: { id: ids.hod }, recommendNote: 'Classes covered' });
    await post('hod', `/v1/hr/leave/requests/${req.id}/approve`).expect(409);
    const bal = (await get('teacher', '/v1/hr/leave/balances/me').expect(200)).body.find((b: { leaveType: { code: string } }) => b.leaveType.code === 'CL');
    expect(bal.pending).toBe(1);
    const done = (await post('principal', `/v1/hr/leave/requests/${req.id}/approve`).expect(200)).body;
    expect(done.status).toBe('approved');
    expect((await get('teacher', `/v1/hr/leave/requests/${req.id}`).expect(200)).body.recommendedBy.fullName).toBe('Hari Hod');
    await get('teacher2', `/v1/hr/leave/requests/${req.id}`).expect(404);
    const hist = (await get('hr', `/v1/hr/history/leave_request/${req.id}`).expect(200)).body as { action: string }[];
    expect(hist.map((h) => h.action)).toEqual(['leave.approved', 'leave.recommended']);
  });

  it('approves a salary advance into monthly payroll recoveries', async () => {
    expect(loanSchedule(R(10_000), 3, '2026-11')).toEqual([{ month: '2026-11', amountPaise: R(3_334) }, { month: '2026-12', amountPaise: R(3_334) }, { month: '2027-01', amountPaise: R(3_332) }]);
    await post('teacher', '/v1/hr/loans', { kind: 'advance', amountPaise: R(90_000), installments: 3, startMonth: '2026-10', purpose: 'Medical' }).expect(400); // above the advance limit
    await post('teacher', '/v1/hr/loans', { userId: ids.teacher2, kind: 'advance', amountPaise: R(10_000), installments: 3, startMonth: '2026-10', purpose: 'Medical' }).expect(403);
    const loan = (await post('teacher', '/v1/hr/loans', { kind: 'advance', amountPaise: R(10_000), installments: 3, startMonth: '2026-10', purpose: 'Medical bills' }).expect(201)).body;
    expect(loan).toMatchObject({ loanNo: 'ADV/2026-27/0001', status: 'pending', emiPaise: R(3_334) });
    await post('hr', `/v1/hr/loans/${loan.id}/decide`, { decision: 'approve' }).expect(403);
    await post('principal', `/v1/hr/loans/${loan.id}/decide`, { decision: 'reject' }).expect(400); // needs a reason
    const ok = (await post('principal', `/v1/hr/loans/${loan.id}/decide`, { decision: 'approve', note: 'Approved' }).expect(200)).body;
    expect(ok).toMatchObject({ status: 'approved', outstandingPaise: R(10_000) });
    expect(ok.schedule.map((x: { month: string }) => x.month)).toEqual(['2026-10', '2026-11', '2026-12']);
    const adj = (await get('accountant', '/v1/hr/payroll/adjustments?month=2026-10').expect(200)).body as { kind: string; amountPaise: number; status: string }[];
    expect(adj).toEqual([expect.objectContaining({ kind: 'recovery', amountPaise: R(3_334), status: 'approved' })]);
    expect((await get('teacher2', '/v1/hr/loans').expect(200)).body).toEqual([]);
    expect((await get('teacher', '/v1/notifications').expect(200)).body.items.some((n: { kind: string }) => n.kind === 'payslip')).toBe(true);
  });

  it('encashes earned leave at the basic + DA day rate, within the yearly cap', async () => {
    const comps = (await get('hr', '/v1/payroll/components').expect(200)).body as { id: string; code: string }[];
    await put('hr', `/v1/payroll/structures/${ids.teacher}`, { effectiveFrom: '2026-04-01', lines: [{ componentId: comps.find((c) => c.code === 'BASIC')!.id, monthlyPaise: R(30_000) }, { componentId: comps.find((c) => c.code === 'HRA')!.id, monthlyPaise: R(12_000) }] }).expect(200);
    const types = (await get('hr', '/v1/hr/leave-types').expect(200)).body as { id: string; code: string; name: string; paid: boolean; annualDays: number; accrual: string; carryForwardMax: number }[];
    const el = types.find((x) => x.code === 'EL')!;
    await post('teacher', '/v1/hr/leave/encashments', { leaveTypeId: el.id, days: 2, payMonth: '2026-10' }).expect(400); // not encashable yet
    await db.update(s.leaveTypes).set({ encashable: true }).where(eq(s.leaveTypes.id, el.id));
    await post('teacher', '/v1/hr/leave/encashments', { leaveTypeId: el.id, days: 20, payMonth: '2026-10' }).expect(400); // above the cap
    const e = (await post('teacher', '/v1/hr/leave/encashments', { leaveTypeId: el.id, days: 5, payMonth: '2026-10' }).expect(201)).body;
    expect(e).toMatchObject({ status: 'pending', amountPaise: R(5_000) });
    const bal = (await get('teacher', '/v1/hr/leave/balances/me').expect(200)).body.find((b: { leaveType: { code: string } }) => b.leaveType.code === 'EL');
    expect(bal.pending).toBe(5);
    const ok = (await post('principal', `/v1/hr/leave/encashments/${e.id}/decide`, { decision: 'approve' }).expect(200)).body;
    expect(ok.status).toBe('approved');
    const adj = (await get('accountant', '/v1/hr/payroll/adjustments?month=2026-10').expect(200)).body as { kind: string }[];
    expect(adj.map((a) => a.kind).sort()).toEqual(['encashment', 'recovery']);
  });

  it('keeps a service book of manual orders and the derived history', async () => {
    await post('teacher', `/v1/hr/staff/${ids.teacher}/service-book`, { kind: 'award', onDate: '2025-08-15', title: 'Best teacher' }).expect(403);
    await post('hr', `/v1/hr/staff/${ids.teacher}/service-book`, { kind: 'award', onDate: '2025-08-15', title: 'Best teacher award', orderNo: 'O/25/12' }).expect(201);
    const book = (await get('teacher', `/v1/hr/staff/${ids.teacher}/service-book`).expect(200)).body as { kind: string; onDate: string }[];
    expect(book.map((b) => b.kind)).toEqual(['appointment', 'award', 'increment']);
    await get('teacher2', `/v1/hr/staff/${ids.teacher}/service-book`).expect(404);
  });

  it('turns an approved requisition into an open position', async () => {
    const r = (await post('hod', '/v1/hr/openings/requisitions', { title: 'Assistant Professor, Commerce', departmentId: ids.dept, positions: 2, justification: 'Two retirements this year' }).expect(201)).body;
    expect(r.status).toBe('requested');
    await post('hr', `/v1/hr/openings/${r.id}/decide`, { decision: 'approve' }).expect(403);
    expect((await post('principal', `/v1/hr/openings/${r.id}/decide`, { decision: 'approve' }).expect(200)).body.status).toBe('open');
    await post('principal', `/v1/hr/openings/${r.id}/decide`, { decision: 'approve' }).expect(409);
    const o = ((await get('hr', '/v1/hr/openings').expect(200)).body as { id: string; status: string; justification: string }[]).find((x) => x.id === r.id)!;
    expect(o).toMatchObject({ status: 'open', justification: 'Two retirements this year' });
  });

  it('runs payroll prepare → verify → approve → lock → bank file → publish, and reports on it', async () => {
    const run = (await post('accountant', '/v1/payroll/runs', { month: '2026-10' }).expect(201)).body;
    const slip = run.payslips.find((p: { user: { id: string } }) => p.user.id === ids.teacher);
    expect(slip.deductions.find((d: { code: string }) => d.code === 'LADV').amountPaise).toBe(R(3_334));
    expect(slip.earnings.find((d: { code: string }) => d.code === 'LENC').amountPaise).toBe(R(5_000));
    const v = (await post('accountant', `/v1/payroll/runs/${run.id}/verify`, { expectedVersion: run.version }).expect(200)).body;
    expect(v.status).toBe('verified');
    const a = (await post('principal', `/v1/payroll/runs/${run.id}/approve`, { expectedVersion: v.version }).expect(200)).body;
    const l = (await post('principal', `/v1/payroll/runs/${run.id}/lock`, { expectedVersion: a.version }).expect(200)).body;
    await get('accountant', `/v1/payroll/runs/${run.id}/bank-transfer.csv`).expect(200);
    const p = (await post('hr', `/v1/payroll/runs/${run.id}/publish`, { expectedVersion: l.version }).expect(200)).body;
    expect(p).toMatchObject({ status: 'locked', bankFileAt: expect.any(String), publishedAt: expect.any(String) });
    expect((await get('teacher', `/v1/hr/loans`).expect(200)).body[0]).toMatchObject({ recoveredPaise: R(3_334), outstandingPaise: R(6_666) });

    const reg = (await get('accountant', '/v1/hr/reports/payroll-register?month=2026-10').expect(200)).body;
    expect(reg.columns).toContain('netPaise');
    expect(reg.rows.find((r: { code: string }) => r.code === 'E100')).toMatchObject({ grossPaise: slip.grossPaise, netPaise: slip.netPaise });
    const strength = (await get('hr', '/v1/hr/reports/staff-strength').expect(200)).body;
    expect(strength.rows.find((r: { department: string }) => r.department === 'Commerce')).toMatchObject({ total: 1, female: 1 });
    for (const k of ['attendance-register', 'leave-register', 'leave-balances', 'salary-statement', 'pf', 'esi', 'pt', 'tds', 'bank-transfer', 'form16', 'appraisal-summary', 'fdp-summary', 'attrition']) await get('hr', `/v1/hr/reports/${k}?month=2026-10&year=2026`).expect(200);
    await get('hr', '/v1/hr/reports/nope').expect(400);
    await get('teacher', '/v1/hr/reports/staff-strength').expect(403);
    expect((await get('hr', `/v1/hr/history/payroll_run/${run.id}`).expect(200)).body.map((h: { action: string }) => h.action)).toEqual(expect.arrayContaining(['payroll.run_verified', 'payroll.run_published', 'payroll.export_bank']));
  });
});
