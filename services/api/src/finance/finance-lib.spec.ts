import { describe, expect, it } from 'vitest';
import { balanced, discountFor, feeReceiptVoucher, feeRefundVoucher, fiscalRange, glCsv, glTallyXml, payrollVoucher, variance } from './gl.js';

const ledgers = { salaryExpense: 'Salary', employerPfExpense: 'ER PF', employerEsiExpense: 'ER ESI', pfPayable: 'PF', esiPayable: 'ESI', ptPayable: 'PT', tdsPayable: 'TDS', salaryPayable: 'Net', otherDeductions: 'Other' };

describe('finance helpers', () => {
  it('fee vouchers balance and pick cash or bank', () => {
    const a = feeReceiptVoucher({ date: '2026-10-01', receiptNo: 'R-1', method: 'cash', amountPaise: 150000, student: 'Asha' });
    const b = feeReceiptVoucher({ date: '2026-10-01', receiptNo: 'R-2', method: 'upi', amountPaise: 5000, student: 'Ravi' });
    expect(a.lines[0].ledger).toBe('Cash');
    expect(b.lines[0].ledger).toBe('Bank Account');
    expect([a, b, feeRefundVoucher({ date: '2026-10-02', id: 'abcdef12-0000', amountPaise: 100, student: 'Asha', reason: 'Duplicate' })].every(balanced)).toBe(true);
  });
  it('payroll voucher balances', () => {
    const v = payrollVoucher({ date: '2026-10-31', month: '2026-10', ledgers, totals: { grossPaise: 100000, employeePfPaise: 12000, employerPfPaise: 12000, employeeEsiPaise: 0, employerEsiPaise: 0, ptPaise: 200, tdsPaise: 0, otherDeductionsPaise: 0, netPaise: 87800 } });
    expect(balanced(v)).toBe(true);
  });
  it('exports CSV and Tally XML with escaping', () => {
    const v = feeReceiptVoucher({ date: '2026-10-01', receiptNo: 'R-1', method: 'cash', amountPaise: 150050, student: 'A & B' });
    expect(glCsv([v]).split('\r\n')[1]).toBe('2026-10-01,Receipt,R-1,Cash,1500.50,,Fee receipt R-1 from A & B');
    const x = glTallyXml('Demo <College>', [v]);
    expect(x).toContain('<SVCURRENTCOMPANY>Demo &lt;College&gt;</SVCURRENTCOMPANY>');
    expect(x).toContain('<AMOUNT>-1500.50</AMOUNT>');
    expect(x).toContain('<DATE>20261001</DATE>');
  });
  it('fiscal range, variance and discounts', () => {
    expect(fiscalRange('2026-27')).toEqual({ from: '2026-04-01', to: '2027-03-31' });
    expect(variance(100000, 120000)).toEqual({ varianceDeltaPaise: -20000, utilisationPercent: 120 });
    expect(variance(0, 5).utilisationPercent).toBeNull();
    expect(discountFor('percent', 25, 10001, 0)).toBe(2500);
    expect(discountFor('fixed', 0, 3000, 5000)).toBe(3000);
    expect(discountFor('fixed', 0, 9000, 5000)).toBe(5000);
  });
});
