/** Staff attendance, leave, salary structures and payroll runs (computed by the payroll module), recruitment. */
import { eq } from 'drizzle-orm';
import { PayrollService } from '../../hr/payroll.service.js';
import { payrollRuns } from '../schema.js';
import type { UserPrincipal } from '../../auth/principal.js';
import { STAFF } from './data.js';
import type { Ctx } from './ctx.js';
import { addDays, at, J, weekday } from './kit.js';
import { service, withTenant } from './nest.js';

export async function staffAttendanceAndLeave(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const hr = c.byEmail.hr.id;
  const types = await k.ins<{ id: string; code: string }>('leave_types', [
    { code: 'CL', name: 'Casual leave', paid: true, annualDays: 12, accrual: 'monthly', carryForwardMax: 0 },
    { code: 'SL', name: 'Sick leave', paid: true, annualDays: 10, accrual: 'yearly', carryForwardMax: 0 },
    { code: 'EL', name: 'Earned leave', paid: true, annualDays: 15, accrual: 'monthly', carryForwardMax: 30, encashable: true },
    { code: 'ML', name: 'Maternity leave', paid: true, annualDays: 182, accrual: 'yearly', carryForwardMax: 0 },
    { code: 'LOP', name: 'Leave without pay', paid: false, annualDays: 0, accrual: 'yearly', carryForwardMax: 0 },
  ]);
  const tid = (code: string) => types.find((t) => t.code === code)!.id;
  await k.ins('leave_balances', c.staff.flatMap((s) => types.filter((t) => t.code !== 'LOP' && t.code !== 'ML').map((t) => ({ userId: s.id, leaveTypeId: t.id, year: 2026, opening: t.code === 'EL' ? r.int(2, 14) : 0 }))), { returning: false });

  // Leave requests in every state. Approved ones fall on days the register shows as on leave.
  const leave: Record<string, unknown>[] = [];
  const onLeave = new Map<string, Set<string>>();
  const pickDay = (i: number) => c.workingDays.filter((d) => weekday(d) < 6)[8 + ((i * 5) % 30)];
  const people = c.staff.filter((s) => STAFF.find((x) => x.email === s.email)!.roles.includes('teacher') || ['accounts', 'library'].includes(s.email));
  for (let i = 0; i < 26; i++) {
    const s = people[i % people.length];
    const from = i < 8 ? pickDay(i) : addDays(c.today, 3 + i);
    const days = i % 5 === 0 ? 2 : 1;
    const to = addDays(from, days - 1);
    const status = i < 14 ? 'approved' : i < 20 ? 'pending' : i < 23 ? 'rejected' : 'cancelled';
    leave.push({ userId: s.id, leaveTypeId: tid(['CL', 'SL', 'EL', 'CL'][i % 4]), fromDate: from, toDate: to, halfDay: false, days, reason: r.pick(['Fever and cold', 'Family function', 'Personal work', 'Sister’s engagement', 'Dental treatment', 'Native place visit', 'Parent-teacher meeting at child’s school']), status, decidedBy: status === 'pending' ? null : hr, decidedAt: status === 'pending' ? null : at(addDays(from, -2)), decisionNote: status === 'rejected' ? 'Valuation duty on those dates' : null });
    if (status === 'approved' && from <= c.today) {
      const set = onLeave.get(s.id) ?? new Set<string>();
      for (let d = from; d <= to; d = addDays(d, 1)) set.add(d);
      onLeave.set(s.id, set);
    }
  }
  await k.ins('leave_requests', leave, { returning: false });

  // Daily register for everybody: mostly present, some half days, two unpaid absences (shown as loss of pay).
  const rows: Record<string, unknown>[] = [];
  c.staff.forEach((s, si) => {
    c.workingDays.forEach((d, di) => {
      let status = 'present';
      if (onLeave.get(s.id)?.has(d)) status = 'on_leave';
      else if ((si * 31 + di * 7) % 97 === 0) status = 'half_day';
      else if ((si === 9 && di === 12) || (si === 14 && di === 20)) status = 'absent';
      rows.push({ userId: s.id, date: d, status, checkInAt: status === 'present' || status === 'half_day' ? at(d, `0${8 + ((si + di) % 2)}:${String(5 + ((si * 7 + di) % 50)).padStart(2, '0')}`) : null, checkOutAt: status === 'present' ? at(d, `17:${String(((si + di) * 3) % 50).padStart(2, '0')}`) : null, source: si % 3 === 0 ? 'biometric' : 'manual', markedBy: hr });
    });
  });
  await k.ins('staff_attendance', rows, { returning: false });
}

export async function payroll(c: Ctx): Promise<void> {
  const svc = await service(PayrollService);
  const p: UserPrincipal = { kind: 'user', tenantId: c.tenantId, userId: c.byEmail.hr.id, roles: ['hr_manager'] };
  await withTenant(c.tenantId, async (tx) => {
    const comps = await svc.components(tx, c.tenantId);
    const id = (code: string) => comps.find((x) => x.code === code)!.id;
    for (const [i, def] of STAFF.entries()) {
      const lines = [
        { componentId: id('BASIC'), monthlyPaise: def.basic * 100 },
        { componentId: id('HRA'), monthlyPaise: Math.round(def.basic * 0.4) * 100 },
        { componentId: id('SPL'), monthlyPaise: Math.round(def.basic * 0.25) * 100 },
      ];
      if (i % 9 === 4) lines.push({ componentId: id('LOAN'), monthlyPaise: 250000 });
      await svc.saveStructure(tx, p, c.staff[i].id, '2026-04-01', lines);
    }
  });
  // August and September went through every step and their payslips are published; October is verified and waits for the principal.
  for (const month of ['2026-08', '2026-09', '2026-10']) {
    await withTenant(c.tenantId, async (tx) => {
      const run = await svc.createRun(tx, p, month);
      const verified = await svc.transition(tx, p, run.id, 'verify', run.version);
      if (month === '2026-10') return;
      const approved = await svc.transition(tx, p, run.id, 'approve', verified.version);
      const locked = await svc.transition(tx, p, run.id, 'lock', approved.version);
      await tx.update(payrollRuns).set({ bankFileAt: new Date(`${month}-28T06:00:00Z`) }).where(eq(payrollRuns.id, run.id));
      await svc.transition(tx, p, run.id, 'publish', locked.version);
    });
  }
}

export async function recruitment(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const hr = c.byEmail.hr.id;
  const openings = await k.ins<{ id: string }>('job_openings', [
    { title: 'Assistant Professor, Commerce (NET/KSET qualified)', departmentId: c.departments['Commerce'], designationId: c.designations['Assistant Professor'], positions: 2, description: 'Teaching BCom and MCom papers; research interest in taxation or accounting preferred.', status: 'open', closesOn: addDays(c.today, 18), createdBy: hr },
    { title: 'Assistant Professor, Computer Applications', departmentId: c.departments['Computer Applications'], designationId: c.designations['Assistant Professor'], positions: 1, description: 'Java, DBMS and cloud computing for BCA Sem 3 and 5.', status: 'open', closesOn: addDays(c.today, 25), createdBy: hr },
    { title: 'Assistant Librarian', designationId: c.designations['Librarian'], positions: 1, description: 'Library automation and e-resources.', status: 'closed', closesOn: addDays(c.today, -20), createdBy: hr },
  ]);
  // A requisition from the Commerce head of department, waiting for the principal.
  await k.ins('job_openings', { title: 'Guest Faculty, Business Analytics', departmentId: c.departments['Commerce'], designationId: c.designations['Assistant Professor'], positions: 1, description: 'Business analytics elective for BCom Sem 5 (4 hours a week).', justification: 'New elective approved by the Board of Studies; no current faculty member can take it.', status: 'requested', closesOn: addDays(c.today, 30), createdBy: c.byEmail['hod.commerce'].id }, { returning: false });
  const stages = ['applied', 'screening', 'interview', 'offered', 'hired', 'rejected'];
  const names = ['Pavithra Rao', 'Madhusudan Gowda', 'Netra Hegde', 'Abdul Rahman', 'Swapna Nair', 'Gururaj Acharya', 'Kruthika Shetty', 'Joseph D’Souza', 'Lakshmi Prasad', 'Hemanth Kumar', 'Sindhu Reddy', 'Ravindra Patil', 'Anjali Menon', 'Satish Naik'];
  await k.ins('job_applicants', names.map((fullName, i) => ({ openingId: openings[i % 3].id, fullName, email: `${fullName.toLowerCase().replace(/[^a-z]+/g, '.')}@applicants.demo.zynetix.in`, phone: `+9190000${40000 + i}`, notes: r.pick(['NET qualified, 4 years of experience', 'PhD submitted, 2 years of experience', 'M.Phil with 6 years of teaching', 'Fresh postgraduate, KSET qualified']), stage: stages[i % stages.length], stageHistory: J([{ stage: 'applied', at: addDays(c.today, -14) }]) })), { returning: false });
}

/**
 * HR module settings (two-step leave approval, numbering), a salary advance being recovered, a pending staff loan,
 * leave encashment and service book entries. Runs before payroll so the recoveries and encashment reach the payslips.
 */
export async function hrWorkflows(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const hr = c.byEmail.hr.id;
  const principal = c.byEmail.principal.id;
  await k.ins('hr_settings', {
    employeeSeries: J({ prefix: 'SIMS-', next: c.staff.length + 1, digits: 3, suffix: '' }),
    payslipSeries: J({ prefix: 'SIMS/PS/{FY}/', next: 1, digits: 5, suffix: '' }),
    leaveLevels: 2,
    encashment: J({ maxDaysPerYear: 15, minBalanceAfter: 5 }),
    attendance: J({ officeStart: '09:00', graceMinutes: 10, halfDayAfterMinutes: 120, minHoursFullDay: 6 }),
    loans: J({ maxInstallments: 24, maxAdvancePaise: 50_000_00, maxLoanPaise: 5_00_000_00 }),
  }, { returning: false });

  const deepa = c.byEmail['deepa.nair'].id;
  const sudhir = c.byEmail['sudhir.kamath'].id;
  const sowmya = c.byEmail['sowmya.reddy'].id;
  const [adv] = await k.ins<{ id: string }>('staff_loans', { loanNo: 'ADV/2026-27/0001', userId: deepa, kind: 'advance', amountPaise: 30_000_00, installments: 3, emiPaise: 10_000_00, startMonth: '2026-09', purpose: 'Medical expenses for a family member', status: 'approved', decidedBy: principal, decidedAt: at(addDays(c.today, -50), '11:00'), decisionNote: 'Approved; recover over three months', createdBy: deepa });
  await k.ins('payroll_adjustments', ['2026-09', '2026-10', '2026-11'].map((m) => ({ userId: deepa, kind: 'recovery', payMonth: m, amountPaise: 10_000_00, reason: 'ADV/2026-27/0001 instalment', status: 'approved', loanId: adv.id, createdBy: deepa, decidedBy: principal, decidedAt: at(addDays(c.today, -50), '11:00') })), { returning: false });
  await k.ins('staff_loans', { loanNo: 'LN/2026-27/0002', userId: sudhir, kind: 'loan', amountPaise: 2_40_000_00, installments: 12, emiPaise: 20_000_00, startMonth: '2026-11', purpose: 'Two-wheeler purchase', status: 'pending', createdBy: sudhir }, { returning: false });

  const el = (await k.q<{ id: string }>(`select id from leave_types where code = 'EL' and tenant_id = $1`, [c.tenantId]))[0].id;
  const [enc] = await k.ins<{ id: string }>('payroll_adjustments', { userId: sowmya, kind: 'encashment', payMonth: '2026-10', amountPaise: 12_000_00, reason: 'Leave encashment: 4 days', status: 'approved', createdBy: hr, decidedBy: principal, decidedAt: at(addDays(c.today, -6), '12:00') });
  await k.ins('leave_encashments', [
    { userId: sowmya, leaveTypeId: el, year: 2026, days: 4, amountPaise: 12_000_00, payMonth: '2026-10', status: 'approved', adjustmentId: enc.id, decidedBy: principal, decidedAt: at(addDays(c.today, -6), '12:00'), createdBy: hr },
    { userId: deepa, leaveTypeId: el, year: 2026, days: 3, amountPaise: 8_100_00, payMonth: '2026-11', status: 'pending', createdBy: deepa },
  ], { returning: false });

  await k.ins('service_book_entries', [
    { userId: deepa, kind: 'award', onDate: '2025-09-05', title: 'Best Teacher Award (Teachers\' Day)', details: 'For the BCom Sem 5 taxation results', orderNo: 'SIMS/ADM/2025/118', createdBy: hr },
    { userId: deepa, kind: 'increment', onDate: '2026-04-01', title: 'Annual increment', details: 'One increment in the pay band', orderNo: 'SIMS/HR/2026/041', createdBy: hr },
    { userId: sudhir, kind: 'deputation', onDate: '2026-02-10', title: 'Deputed as university valuation examiner', details: 'Bengaluru City University, two weeks', orderNo: 'BCU/EXM/2026/77', createdBy: hr },
    { userId: sowmya, kind: 'remark', onDate: '2026-07-15', title: 'Completed NAAC criterion 3 documentation', details: '', createdBy: hr },
  ], { returning: false });
}
