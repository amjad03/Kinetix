import { describe, expect, it } from 'vitest';
import { canApprovePayroll, canSee, homeFor, landingFor, sectionOf } from './access';
import { clockTime, downloadUrl, isMonth, ptSlabs, runActions, shiftMonth, structureLines } from './hr';

describe('payroll access', () => {
  it('gives HR the HR and payroll pages but not approval', () => {
    const r = ['hr_manager'];
    expect(canSee(r, 'hr')).toBe(true);
    expect(canSee(r, 'payroll')).toBe(true);
    expect(canApprovePayroll(r)).toBe(false);
    expect(homeFor(r)).toBe('/');
    expect(landingFor(r, '/fees')).toBe('/');
  });
  it('keeps the accounts office out of HR records but in payroll', () => {
    expect(canSee(['accountant'], 'hr')).toBe(false);
    expect(canSee(['accountant'], 'payroll')).toBe(true);
    expect(canApprovePayroll(['accountant'])).toBe(false);
    expect(canApprovePayroll(['principal'])).toBe(true);
  });
  it('opens own payslips to staff in the ERP, not payroll to them', () => {
    expect(sectionOf('/payroll/payslips')).toBe('payslips');
    expect(sectionOf('/payroll/runs/abc')).toBe('payroll');
    expect(sectionOf('/hr/leave')).toBe('hr');
    expect(canSee(['hod'], 'payslips')).toBe(true);
    expect(canSee(['hod'], 'payroll')).toBe(false);
    expect(canSee(['teacher'], 'payslips')).toBe(false);
  });
});

describe('runs', () => {
  it('allows only the next step of draft → approved → locked', () => {
    expect(runActions('draft', true)).toEqual({ recompute: true, approve: true, lock: false, reopen: false, exports: false });
    expect(runActions('draft', false).approve).toBe(false);
    expect(runActions('approved', true)).toEqual({ recompute: false, approve: false, lock: true, reopen: true, exports: true });
    expect(runActions('locked', true)).toEqual({ recompute: false, approve: false, lock: false, reopen: false, exports: true });
  });
  it('shifts months across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(isMonth('2026-13')).toBe(false);
    expect(isMonth('2026-04')).toBe(true);
  });
  it('builds download links', () => {
    expect(downloadUrl.statutory('r1', 'pf')).toBe('/api/download?kind=pf&id=r1');
    expect(downloadUrl.payslip('p1')).toBe('/api/download?kind=payslip&id=p1');
  });
});

describe('structure lines', () => {
  it('converts rupees to paise and skips blank rows', () => {
    expect(structureLines([{ componentId: 'a', amount: '1,00,000' }, { componentId: '', amount: '' }, { componentId: 'b', amount: '50000.50' }])).toEqual({ ok: true, lines: [{ componentId: 'a', monthlyPaise: 10_000_000 }, { componentId: 'b', monthlyPaise: 5_000_050 }] });
  });
  it('refuses bad amounts, repeats and nothing at all', () => {
    expect(structureLines([{ componentId: 'a', amount: 'abc' }])).toEqual({ ok: false, reason: 'amount' });
    expect(structureLines([{ componentId: '', amount: '100' }])).toEqual({ ok: false, reason: 'amount' });
    expect(structureLines([{ componentId: 'a', amount: '100' }, { componentId: 'a', amount: '200' }])).toEqual({ ok: false, reason: 'duplicate' });
    expect(structureLines([])).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('Professional Tax slabs', () => {
  it('sorts the slabs and keeps the February amount', () => {
    const r = ptSlabs([{ from: '25000', amount: '200', february: '300' }, { from: '', amount: '0', february: '' }]);
    expect(r).toEqual({ ok: true, slabs: [{ minGrossPaise: 0, amountPaise: 0 }, { minGrossPaise: 2_500_000, amountPaise: 20_000, februaryAmountPaise: 30_000 }] });
  });
  it('needs a slab from zero and no repeats', () => {
    expect(ptSlabs([{ from: '100', amount: '5', february: '' }]).ok).toBe(false);
    expect(ptSlabs([{ from: '0', amount: '0', february: '' }, { from: '0', amount: '5', february: '' }]).ok).toBe(false);
    expect(ptSlabs([{ from: 'x', amount: '5', february: '' }]).ok).toBe(false);
  });
});

describe('clock time', () => {
  it('shows the school’s clock', () => {
    expect(clockTime('2026-10-20T04:30:00Z', 'Asia/Kolkata')).toBe('10:00');
    expect(clockTime(null, 'Asia/Kolkata')).toBe('–');
  });
});
