import { describe, expect, it } from 'vitest';
import { dayFromPunches, DEFAULT_ATTENDANCE_RULES, lateLop } from './attendance-rules.js';
import { ecrText } from './exports.js';
import { scoreTotal } from './hiring.controller.js';
import { cadreRatio, retirementDate, serviceYears, sfr } from './hr-master.logic.js';
import { compOffAccrued, leaveRuleProblem } from './leave-math.js';
import { annualTax, computePayslip, KARNATAKA_PT, resolveLines, supplementaryTds } from './payroll-math.js';
import { rateIn } from './payroll.service.js';

const R = (rupees: number) => rupees * 100;

describe('staff master', () => {
  it('retires on the last day of the month of the birthday, or the month before for the 1st', () => {
    expect(retirementDate('1985-03-15', 60)).toBe('2045-03-31');
    expect(retirementDate('1985-03-01', 60)).toBe('2045-02-28');
    expect(retirementDate('1966-01-01', 60)).toBe('2025-12-31');
    expect(retirementDate('1964-02-29', 62)).toBe('2026-02-28');
  });

  it('counts overlapping service once and teaching apart', () => {
    expect(serviceYears([{ from: '2015-06-01', to: '2020-05-31', kind: 'teaching' }])).toEqual({ total: 5, teaching: 5 });
    expect(serviceYears([{ from: '2010-01-01', to: '2011-12-31', kind: 'industry' }, { from: '2011-01-01', to: '2012-12-31', kind: 'teaching' }])).toEqual({ total: 3, teaching: 2 });
    expect(serviceYears([])).toEqual({ total: 0, teaching: 0 });
  });

  it('checks the AICTE 1:2:6 cadre ratio and the student-faculty ratio', () => {
    expect(cadreRatio({ professor: 1, associate: 2, assistant: 6 })).toEqual({ required: { professor: 1, associate: 2, assistant: 6 }, meets: true });
    expect(cadreRatio({ professor: 0, associate: 0, assistant: 3 }).meets).toBe(false);
    expect(cadreRatio({ professor: 2, associate: 1, assistant: 6 }).meets).toBe(true); // a professor may fill an associate post
    expect(sfr(300, 15)).toBe(20);
    expect(sfr(10, 0)).toBeNull();
  });
});

describe('leave and attendance rules', () => {
  const t = { kind: 'regular', maxPerRequest: 3, minNoticeDays: 2, gender: 'any', halfDayAllowed: true };
  it('refuses requests that break the type rules', () => {
    expect(leaveRuleProblem(t, { days: 2, halfDay: false, noticeDays: 5, gender: 'male', onBehalf: false })).toBeNull();
    expect(leaveRuleProblem(t, { days: 4, halfDay: false, noticeDays: 5, gender: 'male', onBehalf: false })).toMatch(/At most 3/);
    expect(leaveRuleProblem(t, { days: 1, halfDay: false, noticeDays: 1, gender: 'male', onBehalf: false })).toMatch(/2 days ahead/);
    expect(leaveRuleProblem(t, { days: 1, halfDay: false, noticeDays: 0, gender: 'male', onBehalf: true })).toBeNull();
    expect(leaveRuleProblem({ ...t, gender: 'female' }, { days: 1, halfDay: false, noticeDays: 5, gender: 'male', onBehalf: false })).toMatch(/female/);
    expect(leaveRuleProblem({ ...t, halfDayAllowed: false }, { days: 0.5, halfDay: true, noticeDays: 5, gender: null, onBehalf: false })).toMatch(/half day/);
  });

  it('lets compensatory off lapse only where it was not used', () => {
    expect(compOffAccrued(1, 0, 0)).toBe(1);
    expect(compOffAccrued(1, 2, 0)).toBe(1); // two lapsed, none used
    expect(compOffAccrued(1, 2, 1)).toBe(2); // one of the lapsed was used before it lapsed
  });

  it('marks late arrivals past the grace period and half days from punches', () => {
    const r = DEFAULT_ATTENDANCE_RULES;
    expect(dayFromPunches(r, '09:08', '17:05')).toEqual({ status: 'present', lateMinutes: 0, earlyMinutes: 0 });
    expect(dayFromPunches(r, '09:20', null)).toEqual({ status: 'present', lateMinutes: 20, earlyMinutes: null });
    expect(dayFromPunches(r, '11:05', '17:00')).toMatchObject({ status: 'half_day', lateMinutes: 125 });
    expect(dayFromPunches(r, '09:00', '13:30')).toEqual({ status: 'half_day', lateMinutes: 0, earlyMinutes: 210 });
    expect(dayFromPunches(r, null, null)).toEqual({ status: 'present', lateMinutes: null, earlyMinutes: null });
    expect(lateLop(7, 3)).toBe(1);
    expect(lateLop(2, 3)).toBe(0);
    expect(lateLop(9, 0)).toBe(0);
  });
});

describe('payroll depth', () => {
  const base = { code: 'BASIC', name: 'Basic', kind: 'earning' as const, monthlyPaise: R(20_000), pfWage: true, taxable: true };
  it('works out percentage components from their base at the month rate', () => {
    const lines = resolveLines([base, { code: 'DA', name: 'DA', kind: 'earning', monthlyPaise: 1, pfWage: true, taxable: true, calc: 'percent', percent: 50, baseCode: 'BASIC' }], (c) => (c === 'DA' ? 55 : null));
    expect(lines.map((l) => [l.code, l.monthlyPaise])).toEqual([['BASIC', R(20_000)], ['DA', R(11_000)]]);
    const noRate = resolveLines([base, { code: 'HRA', name: 'HRA', kind: 'earning', monthlyPaise: 1, pfWage: false, taxable: true, calc: 'percent', percent: 8.5, baseCode: 'BASIC' }], () => null);
    expect(noRate[1].monthlyPaise).toBe(R(1_700));
    const rates = [{ componentId: 'da', effectiveMonth: '2026-01', percent: 50 }, { componentId: 'da', effectiveMonth: '2026-07', percent: 55 }];
    expect(rateIn(rates, 'da', '2026-06')).toBe(50);
    expect(rateIn(rates, 'da', '2026-09')).toBe(55);
    expect(rateIn(rates, 'da', '2025-12')).toBeNull();
  });

  const input = {
    month: '2026-12',
    daysInMonth: 31,
    lopDays: 0,
    lines: [base],
    pf: { capAtCeiling: true, wageCeilingPaise: R(15_000) },
    esiLimitPaise: R(21_000),
    ptSlabs: KARNATAKA_PT,
    staff: { regime: 'new' as const, pfEnabled: true, esiEnabled: false, ptEnabled: true, tax80cPaise: 0, taxOtherDeductionsPaise: 0 },
    ytd: { grossTaxablePaise: 0, ptPaise: 0, employeePfPaise: 0, tdsPaise: 0 },
  };
  it('deducts the Labour Welfare Fund in its month and adds the employer share', () => {
    const p = computePayslip({ ...input, lwf: { employeePaise: R(50), employerPaise: R(100) } });
    expect(p.deductions).toEqual(expect.arrayContaining([{ code: 'LWF', name: 'Labour Welfare Fund', amountPaise: R(50) }]));
    expect(p.employer.lwfPaise).toBe(R(100));
    expect(p.netPaise).toBe(R(20_000) - R(1_800) - R(50));
  });

  it('taxes a supplementary payment by the extra tax it adds to the year', () => {
    const tds = supplementaryTds('new', { month: 12, extraTaxablePaise: R(2_00_000), regularMonthTaxablePaise: R(1_50_000), ytdGrossTaxablePaise: R(13_50_000), ytdPtPaise: 0, ytdEmployeePfPaise: 0, declared80cPaise: 0, otherDeductionsPaise: 0 });
    const without = annualTax('new', { grossPaise: R(13_50_000 + 1_50_000 * 3) });
    const withExtra = annualTax('new', { grossPaise: R(13_50_000 + 1_50_000 * 3 + 2_00_000) });
    expect(tds).toEqual({ annualTaxPaise: withExtra, tdsPaise: Math.round((withExtra - without) / 100) * 100 });
    const p = computePayslip({ ...input, lines: [], extras: [{ code: 'BONUS', name: 'Bonus', amountPaise: R(10_000), taxable: true }], supplementary: { regularMonthTaxablePaise: R(20_000) }, lwf: { employeePaise: R(50), employerPaise: R(100) } });
    expect(p.deductions.map((d) => d.code)).toEqual([]); // no PF on a bonus, no PT or LWF twice, income under the rebate
    expect(p.netPaise).toBe(R(10_000));
  });

  it('writes the ECR with #~# separators in whole rupees', () => {
    const line = ecrText([{ uan: '100200300400', name: 'Asha Rao', grossPaise: R(30_000), pfWagePaise: R(30_000), pfCeilingPaise: R(15_000), pfCapAtCeiling: true, employeePfPaise: R(1_800), epsPaise: R(1_250), epfPaise: R(550), ncpDays: 1.5 }]);
    expect(line).toBe('100200300400#~#ASHA RAO#~#30000#~#15000#~#15000#~#15000#~#1800#~#1250#~#550#~#2#~#0');
  });

  it('scores an interview as a percentage of the maximum', () => {
    expect(scoreTotal({ subject_knowledge: 10, teaching_ability: 10, communication: 10, research: 10, attitude: 10 })).toBe(100);
    expect(scoreTotal({ subject_knowledge: 8, teaching_ability: 9, communication: 8, research: 6, attitude: 9 })).toBe(80);
  });
});
