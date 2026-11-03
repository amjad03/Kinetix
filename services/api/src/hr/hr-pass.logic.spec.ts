import { describe, expect, it } from 'vitest';
import { canaraFile, hdfcFile, sbiFile } from './bank-files.js';
import { cadreEligibility } from './cadre-eligibility.js';
import { vacationProblem } from './leave-math.js';
import { cellAtOrAbove, fixOnPromotion, hraPercent, incrementDue, matrixCells, round100 } from './pay-matrix.logic.js';
import { gratuityEligible, gratuityYears, settlementLines, settlementNet } from './settlement.js';
import { declarationFigures, hraExemption } from './tax-declaration.logic.js';

const R = (rupees: number) => rupees * 100;

describe('7th CPC pay matrix', () => {
  it('builds the UGC academic level 10 cells to the nearest ₹100', () => {
    // The published Level 10 column: 57,700 59,400 61,200 63,000 64,900 66,800 68,800 70,900.
    expect(matrixCells(R(57_700), 8)).toEqual([57_700, 59_400, 61_200, 63_000, 64_900, 66_800, 68_800, 70_900].map(R));
    expect(round100(R(68_804))).toBe(R(68_800));
  });

  it('fixes pay on promotion one notional increment up, never below the entry of the new level', () => {
    expect(fixOnPromotion(R(66_800), matrixCells(R(68_900), 5))).toEqual({ cell: 1, basicPaise: R(68_900) });
    // 79,800 × 1.03 = 82,194 → 82,200; Level 13A starts at 1,31,400.
    expect(fixOnPromotion(R(79_800), matrixCells(R(1_31_400), 3)).cell).toBe(1);
    expect(cellAtOrAbove([R(100), R(200)], R(500))).toBe(2);
  });

  it('gives the increment after six months of service and not at the top of the level', () => {
    expect(incrementDue({ on: '2026-07-01', since: '2026-01-01', cell: 3, cellCount: 40 }).due).toBe(true);
    expect(incrementDue({ on: '2026-07-01', since: '2026-01-02', cell: 3, cellCount: 40 })).toEqual({ due: false, reason: 'Less than six months of service on this pay' });
    expect(incrementDue({ on: '2026-07-01', since: '2010-01-01', cell: 40, cellCount: 40 }).reason).toBe('At the top of the level (stagnation)');
  });

  it('sets HRA by city class, lower until DA reaches 50%', () => {
    expect([hraPercent('X', 55), hraPercent('Y', 55), hraPercent('Z', 55)]).toEqual([30, 20, 10]);
    expect([hraPercent('X', 46), hraPercent('Y', 46), hraPercent('Z', 46)]).toEqual([27, 18, 9]);
  });
});

describe('investment declarations', () => {
  it('works the HRA exemption as the least of the three limbs', () => {
    // Salary 6,00,000; HRA 2,40,000; rent 1,80,000 → rent − 10% = 1,20,000; 50% (metro) = 3,00,000.
    expect(hraExemption({ hraPaise: R(2_40_000), salaryPaise: R(6_00_000), rentPaise: R(1_80_000), metro: true })).toBe(R(1_20_000));
    expect(hraExemption({ hraPaise: R(60_000), salaryPaise: R(6_00_000), rentPaise: R(3_00_000), metro: false })).toBe(R(60_000));
    expect(hraExemption({ hraPaise: R(60_000), salaryPaise: R(6_00_000), rentPaise: R(50_000), metro: false })).toBe(0);
  });

  it('caps each section and gives nothing under the new regime', () => {
    const items = [
      { section: '80C', amountPaise: R(2_00_000) },
      { section: '80D_SENIOR_PARENTS', amountPaise: R(60_000) },
      { section: '80TTA', amountPaise: R(14_000) },
      { section: '24B', amountPaise: R(2_40_000) },
      { section: 'BOGUS', amountPaise: R(9_999) },
    ];
    // 80C stays uncapped here (capped with PF in payroll-math); 50,000 + 10,000 + 2,00,000 = 2,60,000.
    expect(declarationFigures('old', items, null)).toMatchObject({ section80cPaise: R(2_00_000), otherDeductionsPaise: R(2_60_000), hraExemptPaise: 0 });
    expect(declarationFigures('new', items, null)).toMatchObject({ section80cPaise: 0, otherDeductionsPaise: 0 });
  });
});

describe('full and final settlement', () => {
  it('counts gratuity years with more than six months as a full year and needs nearly five years', () => {
    expect(gratuityYears('2015-07-01', '2026-12-15').years).toBe(11);
    expect(gratuityYears('2015-07-01', '2027-01-15').years).toBe(12); // 11 years 6 months 15 days
    expect(gratuityYears('2015-07-01', '2026-12-31').years).toBe(11); // exactly 11 years 6 months
    expect(gratuityEligible('2021-07-01', '2026-02-25')).toBe(true); // 4 years and 240 days
    expect(gratuityEligible('2021-07-01', '2026-02-24')).toBe(false);
  });

  it('caps gratuity at ₹20 lakh, encashes at most 300 days and nets recoveries', () => {
    const lines = settlementLines({ joinedOn: '1990-06-01', lastWorkingDay: '2026-05-31', monthlyBasicDaPaise: R(2_00_000), monthlyGrossPaise: R(2_40_000), unpaidDays: 0, daysInLastMonth: 31, encashableDays: 320, noticeShortfallDays: 10, waiveNotice: false, loanOutstandingPaise: R(5_000), clearanceDuesPaise: 0, reimbursementsDuePaise: 0 });
    expect(lines.map((l) => [l.code, l.amountPaise])).toEqual([
      ['LEAVE', R(20_00_000)], // 300 × 2,00,000 / 30
      ['GRATUITY', R(20_00_000)], // 15/26 × 2,00,000 × 36 = 41,53,846 → capped
      ['NOTICE', R(80_000)], // 10 × 2,40,000 / 30
      ['LOAN', R(5_000)],
    ]);
    expect(settlementNet(lines)).toBe(R(39_15_000));
  });
});

describe('bank transfer files', () => {
  const rows = [
    { name: "Asha D'Souza", account: '10000000001', ifsc: 'SBIN0001234', netPaise: R(45_210), narration: 'Salary October 2026' },
    { name: 'Ravi Kumar', account: '50100000002', ifsc: 'HDFC0000123', netPaise: R(30_000.5), narration: 'Salary October 2026' },
  ];
  const o = { debitAccount: '30012345678', valueDate: '2026-10-31', reference: 'SAL-2026-10' };
  it('writes SBI with a header and SBI/NEFT by IFSC', () => {
    expect(sbiFile(rows, o).split('\r\n').slice(0, 3)).toEqual([
      'Beneficiary Account Number,IFSC,Beneficiary Name,Amount,Payment Mode,Debit Account Number,Narration',
      '10000000001,SBIN0001234,ASHA D SOUZA,45210.00,SBI,30012345678,Salary October 2026',
      '50100000002,HDFC0000123,RAVI KUMAR,30000.50,NEFT,30012345678,Salary October 2026',
    ]);
  });
  it('writes Canara pipe separated with the value date', () => {
    expect(canaraFile(rows, o).split('\r\n')[0]).toBe('30012345678|10000000001|ASHA D SOUZA|SBIN0001234|45210.00|NEFT|Salary October 2026|31-10-2026');
  });
  it('writes the HDFC ENet layout: I within HDFC with no IFSC, N for NEFT with it', () => {
    const [a, b] = hdfcFile(rows, o).split('\r\n').map((l) => l.split(','));
    expect(a).toHaveLength(28);
    expect([a[0], a[2], a[3], a[4], a[12], a[22], a[24]]).toEqual(['N', '10000000001', '45210.00', 'ASHA D SOUZA', 'SAL-2026-10-0001', '31/10/2026', 'SBIN0001234']);
    expect([b[0], b[24]]).toEqual(['I', '']);
  });
});

describe('UGC 2018 cadre check and vacation leave', () => {
  const base = { mastersPercent: 58, hasMasters: true, phd: false, netSet: true, experienceYears: 3, publications: 0, relaxed: false };
  it('passes an assistant professor with 55% and NET, and relaxes the marks for reserved categories', () => {
    expect(cadreEligibility({ ...base, cadre: 'assistant_professor' })).toEqual({ cadre: 'Assistant Professor', eligible: true, missing: [] });
    expect(cadreEligibility({ ...base, cadre: 'assistant_professor', mastersPercent: 52, relaxed: true })?.eligible).toBe(true);
    expect(cadreEligibility({ ...base, cadre: 'professor' })?.missing).toEqual(['Ph.D.', '10 years of teaching or research (has 3)', '10 publications in peer-reviewed or UGC-listed journals (has 0)']);
    expect(cadreEligibility({ ...base, cadre: 'lab_staff' })).toBeNull();
  });
  it('keeps vacation leave inside a declared vacation and for teaching staff', () => {
    const v = [{ name: 'Summer', from: '2027-04-15', to: '2027-05-31' }];
    expect(vacationProblem(v, { fromDate: '2027-04-20', toDate: '2027-05-10', staffCategory: 'teaching' })).toBeNull();
    expect(vacationProblem(v, { fromDate: '2027-04-10', toDate: '2027-04-20', staffCategory: 'teaching' })).toContain('Summer 2027-04-15 to 2027-05-31');
    expect(vacationProblem(v, { fromDate: '2027-04-20', toDate: '2027-04-21', staffCategory: 'non_teaching' })).toBe('Vacation leave is for teaching staff');
    expect(vacationProblem([], { fromDate: '2027-04-20', toDate: '2027-04-21', staffCategory: 'teaching' })).toContain('No vacation period');
  });
});
