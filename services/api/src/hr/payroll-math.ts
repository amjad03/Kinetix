/**
 * Indian payroll arithmetic: proration for loss of pay, PF, ESI, Professional Tax and TDS.
 * Pure functions over integer paise, so they can be tested against known values
 * (payroll-math.spec.ts). The rules and their sources are in docs/architecture/hr-payroll.md.
 */
import type { PtSlab, TaxRegime } from '@kinetix/shared';

/** Rounds paise to the nearest rupee (half up). */
export const roundRupee = (paise: number) => Math.round(paise / 100) * 100;
/** Rounds paise up to the next rupee (ESI). */
export const ceilRupee = (paise: number) => Math.ceil(Math.round(paise) / 100) * 100;
const L = (lakh: number) => lakh * 100_000 * 100;
const R = (rupees: number) => rupees * 100;

export interface PfConfig {
  /** Contributions on min(PF wage, ceiling); the EPS share is always on the capped wage. */
  capAtCeiling: boolean;
  wageCeilingPaise: number;
}

export const DEFAULT_PF: PfConfig = { capAtCeiling: true, wageCeilingPaise: R(15_000) };

/** EPF scheme: employee 12%; employer 12% split into EPS 8.33% (on wages up to ₹15,000) and EPF. */
export function providentFund(pfWagePaise: number, cfg: PfConfig = DEFAULT_PF) {
  const wage = cfg.capAtCeiling ? Math.min(pfWagePaise, cfg.wageCeilingPaise) : pfWagePaise;
  const epsWage = Math.min(pfWagePaise, R(15_000));
  const employee = roundRupee(wage * 0.12);
  const employerTotal = roundRupee(wage * 0.12);
  const eps = Math.min(roundRupee(epsWage * 0.0833), R(1250));
  return { wage, epsWage, employee, eps, epf: employerTotal - eps };
}

/** ESI: on gross wages up to the limit (₹21,000); employee 0.75%, employer 3.25%, rounded up. */
export function esi(grossPaise: number, limitPaise = R(21_000)) {
  if (grossPaise <= 0 || grossPaise > limitPaise) return { applicable: false, employee: 0, employer: 0 };
  return { applicable: true, employee: ceilRupee(grossPaise * 0.0075), employer: ceilRupee(grossPaise * 0.0325) };
}

/** Karnataka (Karnataka Tax on Professions… Act, slabs from 1 April 2023): ₹200 a month from ₹25,000, ₹300 in February. */
export const KARNATAKA_PT: PtSlab[] = [
  { minGrossPaise: 0, amountPaise: 0 },
  { minGrossPaise: R(25_000), amountPaise: R(200), februaryAmountPaise: R(300) },
];

/** Professional tax for a month's gross: the highest slab the gross reaches. */
export function professionalTax(grossPaise: number, month: number, slabs: PtSlab[] = KARNATAKA_PT): number {
  const slab = [...slabs].sort((a, b) => b.minGrossPaise - a.minGrossPaise).find((s) => grossPaise >= s.minGrossPaise);
  if (!slab) return 0;
  return month === 2 && slab.februaryAmountPaise !== undefined ? slab.februaryAmountPaise : slab.amountPaise;
}

export interface TaxSlab {
  /** Upper bound of the slab (paise); null = no upper bound. */
  upTo: number | null;
  rate: number;
}

export interface RegimeRules {
  standardDeduction: number;
  slabs: TaxSlab[];
  /** Section 87A: no tax up to this taxable income… */
  rebateLimit: number;
  /** …with marginal relief above it (new regime): tax never exceeds income above the limit. */
  marginalRelief: boolean;
}

/** FY 2025-26 onwards (Finance Act 2025). */
export const REGIMES: Record<TaxRegime, RegimeRules> = {
  new: {
    standardDeduction: R(75_000),
    slabs: [
      { upTo: L(4), rate: 0 },
      { upTo: L(8), rate: 0.05 },
      { upTo: L(12), rate: 0.1 },
      { upTo: L(16), rate: 0.15 },
      { upTo: L(20), rate: 0.2 },
      { upTo: L(24), rate: 0.25 },
      { upTo: null, rate: 0.3 },
    ],
    rebateLimit: L(12),
    marginalRelief: true,
  },
  old: {
    standardDeduction: R(50_000),
    slabs: [
      { upTo: L(2.5), rate: 0 },
      { upTo: L(5), rate: 0.05 },
      { upTo: L(10), rate: 0.2 },
      { upTo: null, rate: 0.3 },
    ],
    rebateLimit: L(5),
    marginalRelief: false,
  },
};

export const SECTION_80C_LIMIT = L(1.5);

/** Tax on a taxable income by slabs (before rebate and cess). */
export function slabTax(taxablePaise: number, slabs: TaxSlab[]): number {
  let tax = 0;
  let from = 0;
  for (const s of slabs) {
    const top = s.upTo ?? Infinity;
    if (taxablePaise > from) tax += (Math.min(taxablePaise, top) - from) * s.rate;
    from = top;
  }
  return tax;
}

export interface AnnualIncome {
  grossPaise: number;
  /** Old regime only: professional tax paid in the year (sec. 16(iii)). */
  professionalTaxPaise?: number;
  /** Old regime only: 80C investments declared, plus employee PF (capped at ₹1.5 lakh together). */
  section80cPaise?: number;
  /** Old regime only: other declared deductions and exemptions (80D, HRA exemption…). */
  otherDeductionsPaise?: number;
}

/** Taxable income for the year under a regime. */
export function taxableIncome(regime: TaxRegime, inc: AnnualIncome): number {
  const r = REGIMES[regime];
  let deductions = r.standardDeduction;
  if (regime === 'old') deductions += (inc.professionalTaxPaise ?? 0) + Math.min(inc.section80cPaise ?? 0, SECTION_80C_LIMIT) + (inc.otherDeductionsPaise ?? 0);
  return Math.max(0, inc.grossPaise - deductions);
}

/**
 * Income tax for the year: slab tax, the 87A rebate (with marginal relief in the new regime),
 * 4% health and education cess, rounded to the nearest ₹10 (sec. 288B). No surcharge.
 */
export function annualTax(regime: TaxRegime, inc: AnnualIncome): number {
  const r = REGIMES[regime];
  const taxable = taxableIncome(regime, inc);
  let tax = slabTax(taxable, r.slabs);
  if (taxable <= r.rebateLimit) tax = 0;
  else if (r.marginalRelief) tax = Math.min(tax, taxable - r.rebateLimit);
  const withCess = tax * 1.04;
  return Math.round(withCess / 1000) * 1000;
}

/** Months left in the financial year (April–March), counting this one: April 12 … March 1. */
export const monthsLeftInFy = (month: number) => (month >= 4 ? 16 - month : 4 - month);

/** The financial year a YYYY-MM month falls in, as its first calendar year (2026-02 → 2025). */
export const fyStart = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return m >= 4 ? y : y - 1;
};

/**
 * This month's TDS under section 192: the year's tax on projected income (paid so far + this
 * month × months left), less TDS already deducted, spread over the months left.
 */
export function monthlyTds(regime: TaxRegime, p: {
  month: number;
  monthGrossTaxablePaise: number;
  monthPtPaise: number;
  monthEmployeePfPaise: number;
  ytdGrossTaxablePaise: number;
  ytdPtPaise: number;
  ytdEmployeePfPaise: number;
  ytdTdsPaise: number;
  declared80cPaise: number;
  otherDeductionsPaise: number;
}): { annualTaxPaise: number; tdsPaise: number } {
  const left = monthsLeftInFy(p.month);
  const tax = annualTax(regime, {
    grossPaise: p.ytdGrossTaxablePaise + p.monthGrossTaxablePaise * left,
    professionalTaxPaise: p.ytdPtPaise + p.monthPtPaise * left,
    section80cPaise: p.declared80cPaise + p.ytdEmployeePfPaise + p.monthEmployeePfPaise * left,
    otherDeductionsPaise: p.otherDeductionsPaise,
  });
  return { annualTaxPaise: tax, tdsPaise: roundRupee(Math.max(0, tax - p.ytdTdsPaise) / left) };
}

export interface StructureLine {
  code: string;
  name: string;
  kind: 'earning' | 'deduction';
  monthlyPaise: number;
  pfWage: boolean;
  taxable: boolean;
}

export interface PayslipInput {
  /** YYYY-MM. */
  month: string;
  daysInMonth: number;
  lopDays: number;
  lines: StructureLine[];
  pf: PfConfig;
  esiLimitPaise: number;
  ptSlabs: PtSlab[];
  staff: { regime: TaxRegime; pfEnabled: boolean; esiEnabled: boolean; ptEnabled: boolean; tax80cPaise: number; taxOtherDeductionsPaise: number };
  ytd: { grossTaxablePaise: number; ptPaise: number; employeePfPaise: number; tdsPaise: number };
  /** Approved overtime, arrears and bonuses (added in full, not prorated) and recoveries (taken as deductions). */
  extras?: { code: string; name: string; amountPaise: number; taxable: boolean; recovery?: boolean }[];
}

export interface ComputedLine {
  code: string;
  name: string;
  amountPaise: number;
}

export interface ComputedPayslip {
  paidDays: number;
  earnings: ComputedLine[];
  deductions: ComputedLine[];
  grossPaise: number;
  taxableGrossPaise: number;
  deductionsPaise: number;
  netPaise: number;
  pfWagePaise: number;
  employeePfPaise: number;
  employer: { epfPaise: number; epsPaise: number; esiPaise: number };
  esiPaise: number;
  ptPaise: number;
  tdsPaise: number;
  annualTaxPaise: number;
}

/** One staff member's payslip for a month. */
export function computePayslip(i: PayslipInput): ComputedPayslip {
  const lop = Math.min(Math.max(0, i.lopDays), i.daysInMonth);
  const paidDays = i.daysInMonth - lop;
  const prorate = (paise: number) => roundRupee((paise * paidDays) / i.daysInMonth);
  const earnLines = i.lines.filter((l) => l.kind === 'earning');
  const extraEarn = (i.extras ?? []).filter((x) => !x.recovery && x.amountPaise > 0);
  const earnings = [...earnLines.map((l) => ({ code: l.code, name: l.name, amountPaise: prorate(l.monthlyPaise) })), ...extraEarn.map((x) => ({ code: x.code, name: x.name, amountPaise: x.amountPaise }))];
  const gross = earnings.reduce((s, e) => s + e.amountPaise, 0);
  const taxableGross = earnings.filter((_, k) => (k < earnLines.length ? earnLines[k].taxable : extraEarn[k - earnLines.length].taxable)).reduce((s, e) => s + e.amountPaise, 0);
  const pfWage = earnings.filter((_, k) => k < earnLines.length && earnLines[k].pfWage).reduce((s, e) => s + e.amountPaise, 0);

  const pf = i.staff.pfEnabled ? providentFund(pfWage, i.pf) : { employee: 0, eps: 0, epf: 0 };
  const e = i.staff.esiEnabled ? esi(gross, i.esiLimitPaise) : { employee: 0, employer: 0 };
  const month = Number(i.month.slice(5, 7));
  const pt = i.staff.ptEnabled ? professionalTax(gross, month, i.ptSlabs) : 0;
  const tds = monthlyTds(i.staff.regime, {
    month,
    monthGrossTaxablePaise: taxableGross,
    monthPtPaise: pt,
    monthEmployeePfPaise: pf.employee,
    ytdGrossTaxablePaise: i.ytd.grossTaxablePaise,
    ytdPtPaise: i.ytd.ptPaise,
    ytdEmployeePfPaise: i.ytd.employeePfPaise,
    ytdTdsPaise: i.ytd.tdsPaise,
    declared80cPaise: i.staff.tax80cPaise,
    otherDeductionsPaise: i.staff.taxOtherDeductionsPaise,
  });

  const deductions: ComputedLine[] = [];
  if (pf.employee) deductions.push({ code: 'PF', name: 'Provident Fund', amountPaise: pf.employee });
  if (e.employee) deductions.push({ code: 'ESI', name: 'ESI', amountPaise: e.employee });
  if (pt) deductions.push({ code: 'PT', name: 'Professional Tax', amountPaise: pt });
  if (tds.tdsPaise) deductions.push({ code: 'TDS', name: 'Income Tax (TDS)', amountPaise: tds.tdsPaise });
  // Fixed deductions (loan recovery, canteen…) are not prorated, and never take net pay below zero.
  let room = gross - deductions.reduce((s, d) => s + d.amountPaise, 0);
  const fixed = [...i.lines.filter((x) => x.kind === 'deduction'), ...(i.extras ?? []).filter((x) => x.recovery).map((x) => ({ code: x.code, name: x.name, monthlyPaise: x.amountPaise }))];
  for (const l of fixed) {
    const amount = Math.max(0, Math.min(l.monthlyPaise, room));
    if (amount > 0) deductions.push({ code: l.code, name: l.name, amountPaise: amount });
    room -= amount;
  }
  const totalDeductions = deductions.reduce((s, d) => s + d.amountPaise, 0);
  return {
    paidDays,
    earnings,
    deductions,
    grossPaise: gross,
    taxableGrossPaise: taxableGross,
    deductionsPaise: totalDeductions,
    netPaise: gross - totalDeductions,
    pfWagePaise: pfWage,
    employeePfPaise: pf.employee,
    employer: { epfPaise: pf.epf, epsPaise: pf.eps, esiPaise: e.employer },
    esiPaise: e.employee,
    ptPaise: pt,
    tdsPaise: tds.tdsPaise,
    annualTaxPaise: tds.annualTaxPaise,
  };
}

/** Days in a YYYY-MM month. */
export const daysInMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
