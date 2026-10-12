import { describe, expect, it } from 'vitest';
import { buildRoster, defaulters, feeStates, initials, lastMonths, monthlyTotals, receiptsFromVouchers } from './roster';
import type { FeeInvoice } from './types';

const inv = (id: string, student: string, amount: number, paid: number, dueOn: string, status: FeeInvoice['status'] = 'due'): FeeInvoice => ({ id, title: 'Fee', amountPaise: amount, paidPaise: paid, dueOn, status, student: { id: student, fullName: student.toUpperCase(), rollNo: `R-${student}` }, className: 'BCA Sem 1 A' });
const today = '2026-10-12';

describe('roster', () => {
  it('works out each student’s fee state from their invoices', () => {
    const m = feeStates([inv('1', 'a', 100, 0, '2026-10-01'), inv('2', 'b', 100, 40, '2026-11-01'), inv('3', 'c', 100, 0, '2026-11-01'), inv('4', 'd', 100, 100, '2026-09-01', 'paid'), inv('5', 'e', 100, 0, '2026-09-01', 'cancelled')], today);
    expect(m.get('a')).toEqual({ state: 'overdue', duePaise: 100 });
    expect(m.get('b')?.state).toBe('partial');
    expect(m.get('c')?.state).toBe('due');
    expect(m.get('d')?.state).toBe('paid');
    expect(m.has('e')).toBe(false);
  });

  it('joins programme, semester, attendance and fees onto the student list', () => {
    const rows = buildRoster(
      [{ id: 'a', fullName: 'A', rollNo: '1', status: 'active', sectionId: 's1', className: 'BCA Sem 3 A' }, { id: 'z', fullName: 'Z', rollNo: '2', status: 'active', sectionId: 's9', className: 'X' }],
      { campuses: [], academicYears: [], rooms: [], subjects: [], programs: [{ id: 'p1', name: 'BCA', level: 'ug', campusId: 'c', termCount: 6 }], sections: [{ id: 's1', displayName: 'BCA Sem 3 A', programId: 'p1', term: 3, students: 1 }] },
      [inv('1', 'a', 100, 0, '2026-10-01')],
      new Map([['a', 82]]),
      today,
    );
    expect(rows[0]).toMatchObject({ programName: 'BCA', term: 3, attendancePct: 82, fee: 'overdue', duePaise: 100 });
    expect(rows[1]).toMatchObject({ programName: '', term: null, attendancePct: null, fee: 'none' });
    expect(buildRoster(rows, null, null, null, today)[0].fee).toBeNull();
  });

  it('lists defaulters by what they owe past the due date', () => {
    const d = defaulters([inv('1', 'a', 100, 0, '2026-10-01'), inv('2', 'b', 500, 100, '2026-09-01'), inv('3', 'b', 50, 0, '2026-08-01'), inv('4', 'c', 100, 0, '2026-11-01')], today);
    expect(d.map((x) => [x.studentId, x.overduePaise, x.invoices, x.oldestDue])).toEqual([['b', 450, 2, '2026-08-01'], ['a', 100, 1, '2026-10-01']]);
  });

  it('builds months, monthly totals and initials', () => {
    expect(lastMonths('2026-02-10', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    const r = receiptsFromVouchers([
      { date: '2026-10-02', type: 'Receipt', number: 'R2', narration: 'Fee receipt R2 from Asha Rao', lines: [{ ledger: 'Cash in Hand', debitPaise: 300 }] },
      { date: '2026-09-02', type: 'Receipt', number: 'R1', narration: 'Fee receipt R1 from Ravi', lines: [{ ledger: 'Bank Account', debitPaise: 200 }] },
      { date: '2026-09-30', type: 'Journal', number: 'PAY-2026-09', narration: 'Salary', lines: [{ ledger: 'Salaries', debitPaise: 9 }] },
    ]);
    expect(r.map((x) => [x.receiptNo, x.student, x.method])).toEqual([['R2', 'Asha Rao', 'cash'], ['R1', 'Ravi', 'bank']]);
    expect(monthlyTotals(r, ['2026-09', '2026-10'])).toEqual([{ month: '2026-09', paise: 200, count: 1 }, { month: '2026-10', paise: 300, count: 1 }]);
    expect([initials('Dr. Savitha Hegde'), initials('asha'), initials('')]).toEqual(['SH', 'A', '?']);
  });
});
