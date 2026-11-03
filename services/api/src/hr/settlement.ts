/**
 * Full and final settlement on exit: salary for the days of the last month that payroll has not paid, leave
 * encashment, gratuity (Payment of Gratuity Act 1972, section 4), less notice-period shortfall, loans still owed and
 * the dues the clearance departments reported. Integer paise; every line says how it was worked out.
 */
const R = (rupees: number) => rupees * 100;

/** Gratuity ceiling under section 4(3) of the Act (₹20 lakh since 29 March 2018). */
export const GRATUITY_CEILING_PAISE = R(20_00_000);
/** At most this many days of earned leave are encashed on exit. */
export const ENCASH_MAX_DAYS = 300;

export interface SettlementLine {
  code: string;
  label: string;
  kind: 'earning' | 'recovery';
  amountPaise: number;
  basis: string;
}

export interface SettlementInput {
  joinedOn: string | null;
  lastWorkingDay: string;
  /** Basic pay plus DA a month (gratuity and leave encashment are on this). */
  monthlyBasicDaPaise: number;
  /** Gross pay a month (unpaid salary and the notice recovery are on this). */
  monthlyGrossPaise: number;
  /** Days of the last month worked and not yet paid by a payroll run (0 when the month's run paid them). */
  unpaidDays: number;
  daysInLastMonth: number;
  /** Earned leave left to encash. */
  encashableDays: number;
  noticeShortfallDays: number;
  /** HR waived the notice shortfall. */
  waiveNotice: boolean;
  loanOutstandingPaise: number;
  clearanceDuesPaise: number;
  /** Approved reimbursements not yet paid on a payslip. */
  reimbursementsDuePaise: number;
}

const rs = (p: number) => `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Completed years of service for gratuity: a part year of more than six months counts as a full year. */
export function gratuityYears(joinedOn: string, lastDay: string): { years: number; days: number } {
  const a = new Date(`${joinedOn}T00:00:00Z`);
  // Service runs to the end of the last working day.
  const e = new Date(new Date(`${lastDay}T00:00:00Z`).getTime() + 86_400_000);
  const days = Math.round((e.getTime() - a.getTime()) / 86_400_000);
  const months = (e.getUTCFullYear() - a.getUTCFullYear()) * 12 + (e.getUTCMonth() - a.getUTCMonth()) - (e.getUTCDate() < a.getUTCDate() ? 1 : 0);
  const rest = months % 12;
  const moreThanSix = rest > 6 || (rest === 6 && e.getUTCDate() > a.getUTCDate());
  return { years: Math.floor(months / 12) + (moreThanSix ? 1 : 0), days };
}

/** Whether service qualifies for gratuity: five years, counting four years and 240 days worked as five. */
export function gratuityEligible(joinedOn: string, lastDay: string): boolean {
  const a = new Date(`${joinedOn}T00:00:00Z`);
  const four = new Date(Date.UTC(a.getUTCFullYear() + 4, a.getUTCMonth(), a.getUTCDate()));
  const days = Math.round((new Date(`${lastDay}T00:00:00Z`).getTime() - four.getTime()) / 86_400_000) + 1;
  return days >= 240;
}

export function settlementLines(i: SettlementInput): SettlementLine[] {
  const out: SettlementLine[] = [];
  if (i.unpaidDays > 0 && i.daysInLastMonth > 0) {
    const amount = Math.round((i.monthlyGrossPaise * i.unpaidDays) / i.daysInLastMonth / 100) * 100;
    out.push({ code: 'SALARY', label: 'Salary for the last month', kind: 'earning', amountPaise: amount, basis: `${rs(i.monthlyGrossPaise)} × ${i.unpaidDays}/${i.daysInLastMonth} days` });
  }
  const days = Math.min(Math.max(0, i.encashableDays), ENCASH_MAX_DAYS);
  if (days > 0) {
    const amount = Math.round((i.monthlyBasicDaPaise * days) / 30 / 100) * 100;
    out.push({ code: 'LEAVE', label: 'Leave encashment', kind: 'earning', amountPaise: amount, basis: `${days} days × (basic + DA ${rs(i.monthlyBasicDaPaise)}) / 30` });
  }
  if (i.joinedOn && gratuityEligible(i.joinedOn, i.lastWorkingDay)) {
    const { years } = gratuityYears(i.joinedOn, i.lastWorkingDay);
    const worked = Math.round((i.monthlyBasicDaPaise * 15 * years) / 26 / 100) * 100;
    const amount = Math.min(worked, GRATUITY_CEILING_PAISE);
    out.push({ code: 'GRATUITY', label: 'Gratuity', kind: 'earning', amountPaise: amount, basis: `15/26 × ${rs(i.monthlyBasicDaPaise)} × ${years} years${worked > amount ? ' (capped at ₹20 lakh)' : ''}` });
  }
  if (i.reimbursementsDuePaise > 0) out.push({ code: 'REIMB', label: 'Approved reimbursements not yet paid', kind: 'earning', amountPaise: i.reimbursementsDuePaise, basis: 'Approved claims' });
  if (i.noticeShortfallDays > 0 && !i.waiveNotice) {
    const amount = Math.round((i.monthlyGrossPaise * i.noticeShortfallDays) / 30 / 100) * 100;
    out.push({ code: 'NOTICE', label: 'Notice period shortfall', kind: 'recovery', amountPaise: amount, basis: `${i.noticeShortfallDays} days × ${rs(i.monthlyGrossPaise)} / 30` });
  }
  if (i.loanOutstandingPaise > 0) out.push({ code: 'LOAN', label: 'Loans and advances outstanding', kind: 'recovery', amountPaise: i.loanOutstandingPaise, basis: 'Instalments not yet recovered' });
  if (i.clearanceDuesPaise > 0) out.push({ code: 'DUES', label: 'Dues from clearance', kind: 'recovery', amountPaise: i.clearanceDuesPaise, basis: 'Library, accounts, hostel and other departments' });
  return out;
}

/** Earnings less recoveries (negative: the employee owes the institution). */
export const settlementNet = (lines: SettlementLine[]) => lines.reduce((n, l) => n + (l.kind === 'earning' ? l.amountPaise : -l.amountPaise), 0);
