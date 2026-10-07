import { describe, expect, it } from 'vitest';
import { annualTax, computePayslip, esi, KARNATAKA_PT, monthlyTds, professionalTax, providentFund, slabTax, REGIMES, taxableIncome, type PayslipInput } from './payroll-math.js';

const R = (rupees: number) => rupees * 100;

describe('provident fund', () => {
  it('caps the wage at ₹15,000: employee 1,800, EPS 1,250, EPF 550', () => {
    expect(providentFund(R(20_000))).toMatchObject({ wage: R(15_000), employee: R(1_800), eps: R(1_250), epf: R(550) });
  });
  it('12% of a basic below the ceiling, EPS 8.33%', () => {
    expect(providentFund(R(12_000))).toMatchObject({ employee: R(1_440), eps: R(1_000), epf: R(440) });
  });
  it('contributes on the full wage when the cap is off, EPS stays on ₹15,000', () => {
    expect(providentFund(R(20_000), { capAtCeiling: false, wageCeilingPaise: R(15_000) })).toMatchObject({ employee: R(2_400), eps: R(1_250), epf: R(1_150) });
  });
});

describe('ESI', () => {
  it('0.75% and 3.25% of ₹18,000', () => {
    expect(esi(R(18_000))).toEqual({ applicable: true, employee: R(135), employer: R(585) });
  });
  it('rounds each share up to the next rupee', () => {
    expect(esi(R(20_001))).toMatchObject({ employee: R(151), employer: R(651) });
  });
  it('does not apply above ₹21,000', () => {
    expect(esi(R(21_001))).toEqual({ applicable: false, employee: 0, employer: 0 });
    expect(esi(R(21_000)).applicable).toBe(true);
  });
});

describe('Karnataka professional tax', () => {
  it('nil below ₹25,000, ₹200 from ₹25,000, ₹300 in February', () => {
    expect(professionalTax(R(24_999), 10, KARNATAKA_PT)).toBe(0);
    expect(professionalTax(R(25_000), 10, KARNATAKA_PT)).toBe(R(200));
    expect(professionalTax(R(90_000), 1, KARNATAKA_PT)).toBe(R(200));
    expect(professionalTax(R(25_000), 2, KARNATAKA_PT)).toBe(R(300));
    expect(professionalTax(R(10_000), 2, KARNATAKA_PT)).toBe(0);
  });
  it('follows edited slabs', () => {
    const slabs = [{ minGrossPaise: 0, amountPaise: 0 }, { minGrossPaise: R(15_000), amountPaise: R(150) }, { minGrossPaise: R(30_000), amountPaise: R(250) }];
    expect(professionalTax(R(20_000), 5, slabs)).toBe(R(150));
    expect(professionalTax(R(30_000), 5, slabs)).toBe(R(250));
  });
});

describe('income tax (FY 2025-26)', () => {
  it('new regime: no tax up to ₹12.75 lakh salary (87A + ₹75,000 standard deduction)', () => {
    expect(annualTax('new', { grossPaise: R(12_75_000) })).toBe(0);
  });
  it('new regime: marginal relief just above the rebate limit', () => {
    // Taxable ₹12.25 lakh: slab tax 63,750, limited to the ₹25,000 above ₹12 lakh, plus 4% cess.
    expect(annualTax('new', { grossPaise: R(13_00_000) })).toBe(R(26_000));
  });
  it('new regime slabs: ₹15 lakh and ₹25 lakh salaries', () => {
    expect(slabTax(R(14_25_000), REGIMES.new.slabs)).toBe(R(93_750));
    expect(annualTax('new', { grossPaise: R(15_00_000) })).toBe(R(97_500));
    expect(annualTax('new', { grossPaise: R(25_00_000) })).toBe(R(3_19_800));
  });
  it('old regime: standard deduction, professional tax and 80C', () => {
    const inc = { grossPaise: R(8_00_000), professionalTaxPaise: R(2_400), section80cPaise: R(1_50_000) };
    expect(taxableIncome('old', inc)).toBe(R(5_97_600));
    // 12,500 + 20% of 97,600 = 32,020; with cess 33,300.80, rounded to ₹33,300.
    expect(annualTax('old', inc)).toBe(R(33_300));
  });
  it('old regime: 80C is capped at ₹1.5 lakh; rebate up to ₹5 lakh taxable', () => {
    expect(taxableIncome('old', { grossPaise: R(10_00_000), section80cPaise: R(3_00_000) })).toBe(R(10_00_000 - 50_000 - 1_50_000));
    expect(annualTax('old', { grossPaise: R(5_50_000) })).toBe(0);
  });
});

describe('monthly TDS (section 192)', () => {
  const base = { month: 4, monthGrossTaxablePaise: R(2_00_000), monthPtPaise: R(200), monthEmployeePfPaise: R(1_800), ytdGrossTaxablePaise: 0, ytdPtPaise: 0, ytdEmployeePfPaise: 0, ytdTdsPaise: 0, declared80cPaise: 0, otherDeductionsPaise: 0 };
  it('April: the year at ₹2 lakh a month is ₹24 lakh, tax ₹2,92,500, so ₹24,375 a month', () => {
    expect(monthlyTds('new', base)).toEqual({ annualTaxPaise: R(2_92_500), tdsPaise: R(24_375) });
  });
  it('spreads what is left over the months left, net of TDS already deducted', () => {
    // October: 6 months left (Oct–Mar); six months of ₹2 lakh paid with ₹1,46,250 of TDS so far.
    const r = monthlyTds('new', { ...base, month: 10, ytdGrossTaxablePaise: R(12_00_000), ytdTdsPaise: R(1_46_250) });
    expect(r.annualTaxPaise).toBe(R(2_92_500));
    expect(r.tdsPaise).toBe(R(24_375));
    // If less was deducted, the shortfall is recovered over the remaining months.
    expect(monthlyTds('new', { ...base, month: 10, ytdGrossTaxablePaise: R(12_00_000), ytdTdsPaise: R(1_00_000) }).tdsPaise).toBe(R(32_083));
  });
  it('is never negative', () => {
    expect(monthlyTds('new', { ...base, month: 3, ytdTdsPaise: R(5_00_000) }).tdsPaise).toBe(0);
  });
});

describe('computePayslip', () => {
  const lines = (basic: number, hra: number, special: number) => [
    { code: 'BASIC', name: 'Basic pay', kind: 'earning' as const, monthlyPaise: R(basic), pfWage: true, taxable: true },
    { code: 'HRA', name: 'HRA', kind: 'earning' as const, monthlyPaise: R(hra), pfWage: false, taxable: true },
    { code: 'SPL', name: 'Special', kind: 'earning' as const, monthlyPaise: R(special), pfWage: false, taxable: true },
  ];
  const input = (over: Partial<PayslipInput> = {}): PayslipInput => ({
    month: '2026-04',
    daysInMonth: 30,
    lopDays: 0,
    lines: lines(1_00_000, 50_000, 50_000),
    pf: { capAtCeiling: true, wageCeilingPaise: R(15_000) },
    esiLimitPaise: R(21_000),
    ptSlabs: KARNATAKA_PT,
    staff: { regime: 'new', pfEnabled: true, esiEnabled: false, ptEnabled: true, tax80cPaise: 0, taxOtherDeductionsPaise: 0 },
    ytd: { grossTaxablePaise: 0, ptPaise: 0, employeePfPaise: 0, tdsPaise: 0 },
    ...over,
  });

  it('₹2 lakh gross in April: PF 1,800, PT 200, TDS 24,375, net 1,73,625', () => {
    const p = computePayslip(input());
    expect(p).toMatchObject({ grossPaise: R(2_00_000), employeePfPaise: R(1_800), ptPaise: R(200), tdsPaise: R(24_375), deductionsPaise: R(26_375), netPaise: R(1_73_625) });
    expect(p.employer).toEqual({ epfPaise: R(550), epsPaise: R(1_250), esiPaise: 0 });
    expect(p.deductions.map((d) => d.code)).toEqual(['PF', 'PT', 'TDS']);
  });

  it('prorates for loss of pay: 3 days of 31 on ₹31,000 pays ₹28,000', () => {
    const p = computePayslip(input({ month: '2026-10', daysInMonth: 31, lopDays: 3, lines: lines(31_000, 0, 0) }));
    expect(p.paidDays).toBe(28);
    expect(p.grossPaise).toBe(R(28_000));
    expect(p.pfWagePaise).toBe(R(28_000));
    expect(p.employeePfPaise).toBe(R(1_800));
    expect(p.ptPaise).toBe(R(200));
    expect(p.tdsPaise).toBe(0);
    expect(p.netPaise).toBe(R(28_000 - 1_800 - 200));
  });

  it('applies ESI under the limit and not PT below ₹25,000', () => {
    const p = computePayslip(input({ lines: lines(10_000, 4_000, 4_000), staff: { regime: 'new', pfEnabled: true, esiEnabled: true, ptEnabled: true, tax80cPaise: 0, taxOtherDeductionsPaise: 0 } }));
    expect(p.grossPaise).toBe(R(18_000));
    expect(p).toMatchObject({ employeePfPaise: R(1_200), esiPaise: R(135), ptPaise: 0, tdsPaise: 0 });
    expect(p.employer.esiPaise).toBe(R(585));
    expect(p.netPaise).toBe(R(18_000 - 1_200 - 135));
  });

  it('takes fixed deductions without prorating and never below zero net', () => {
    const withLoan = { code: 'LOAN', name: 'Loan recovery', kind: 'deduction' as const, monthlyPaise: R(5_000), pfWage: false, taxable: false };
    const p = computePayslip(input({ month: '2026-10', daysInMonth: 31, lopDays: 3, lines: [...lines(31_000, 0, 0), withLoan] }));
    expect(p.deductions.find((d) => d.code === 'LOAN')?.amountPaise).toBe(R(5_000));
    const tiny = computePayslip(input({ lines: [...lines(1_000, 0, 0), { ...withLoan, monthlyPaise: R(9_000) }] }));
    expect(tiny.netPaise).toBe(0);
  });

  it('honours switches: no PF, no PT', () => {
    const p = computePayslip(input({ staff: { regime: 'new', pfEnabled: false, esiEnabled: false, ptEnabled: false, tax80cPaise: 0, taxOtherDeductionsPaise: 0 } }));
    expect(p.employeePfPaise).toBe(0);
    expect(p.ptPaise).toBe(0);
    expect(p.employer.epfPaise + p.employer.epsPaise).toBe(0);
  });
});
