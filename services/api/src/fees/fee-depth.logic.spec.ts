import { describe, expect, it } from 'vitest';
import { allocateAcross, autoMatch, chainProblem, chainStep, convenienceFee, parseChallanCsv, parseDay, parseStatementCsv, prorataPercent, reductionPlan, refundQuote, reminderDue, rupeesInWords, settleOrder, slabFine, slabsProblem, splitByModes, structureApplies, UGC_REFUND_SLABS } from './fee-depth.logic.js';

const line = (id: string, priority: number, balancePaise: number, invoiceId = 'i1', headCode = id) => ({ id, invoiceId, headCode, priority, balancePaise });

describe('fee depth rules', () => {
  it('allocates in order and splits across modes, cash first as given', () => {
    const got = allocateAcross([line('TUI', 10, 5000), line('LAB', 20, 2000)], 6000);
    expect(got.map((g) => [g.line.id, g.paise])).toEqual([
      ['TUI', 5000],
      ['LAB', 1000],
    ]);
    const split = splitByModes(got, [{ amountPaise: 4000 }, { amountPaise: 2000 }]);
    expect(split.map((s) => [s.line.id, s.paise, s.mode])).toEqual([
      ['TUI', 4000, 0],
      ['TUI', 1000, 1],
      ['LAB', 1000, 1],
    ]);
    expect(() => splitByModes(got, [{ amountPaise: 100 }])).toThrow();
    expect(settleOrder([{ dueOn: '2026-10-01', priority: 20, headCode: 'B' }, { dueOn: '2026-09-01', priority: 30, headCode: 'A' }, { dueOn: '2026-10-01', priority: 10, headCode: 'C' }]).map((x) => x.headCode)).toEqual(['A', 'C', 'B']);
  });

  it('reduces the named heads, lowest priority first, never below what is paid', () => {
    const lines = [
      { id: 'a', headCode: 'TUI', priority: 10, netPaise: 1000, unpaidPaise: 400 },
      { id: 'b', headCode: 'FIN', priority: 90, netPaise: 300, unpaidPaise: 300 },
    ];
    expect(reductionPlan(lines, 500)).toEqual([
      { id: 'b', paise: 300 },
      { id: 'a', paise: 200 },
    ]);
    expect(reductionPlan(lines, 500, ['TUI'])).toEqual([{ id: 'a', paise: 400 }]);
  });

  it('charges slab fines and refuses overlapping slabs', () => {
    const slabs = [
      { fromDay: 1, toDay: 10, paise: 1000, perDay: true },
      { fromDay: 11, toDay: null, paise: 20000, perDay: false },
    ];
    expect(slabFine(slabs, 0, null)).toBe(0);
    expect(slabFine(slabs, 4, null)).toBe(4000);
    expect(slabFine(slabs, 44, null)).toBe(30000);
    expect(slabFine(slabs, 44, 25000)).toBe(25000);
    expect(slabsProblem(slabs)).toBeNull();
    expect(slabsProblem([{ fromDay: 1, toDay: null, paise: 1, perDay: false }, { fromDay: 5, toDay: 9, paise: 1, perDay: false }])).toMatch(/overlap/);
  });

  it('walks an approval chain by limits', () => {
    const chain = [
      { role: 'accountant', limitRupees: 1000 },
      { role: 'principal', limitRupees: 50000 },
      { role: 'tenant_admin', limitRupees: null },
    ];
    expect(chainProblem(chain)).toBeNull();
    expect(chainProblem([{ role: 'principal', limitRupees: 10 }])).toMatch(/last level/);
    expect(chainProblem([{ role: 'a', limitRupees: 100 }, { role: 'b', limitRupees: 50 }, { role: 'c', limitRupees: null }])).toMatch(/more than/);
    expect(chainStep(chain, 0, 90000)).toEqual({ final: true, next: 0 });
    expect(chainStep(chain, 0, 200000)).toEqual({ final: false, next: 1 });
    expect(chainStep(chain, 1, 6000000)).toEqual({ final: false, next: 2 });
    expect(chainStep(chain, 2, 6000000)).toEqual({ final: true, next: 2 });
  });

  it('quotes a withdrawal refund by the UGC bands', () => {
    expect(refundQuote(UGC_REFUND_SLABS, 0, 5000000)).toMatchObject({ percent: 100, refundPaise: 4900000 });
    expect(refundQuote(UGC_REFUND_SLABS, 12, 5000000)).toMatchObject({ percent: 90, refundPaise: 4500000 });
    expect(refundQuote(UGC_REFUND_SLABS, 45, 5000000)).toMatchObject({ percent: 50, refundPaise: 2500000 });
    expect(refundQuote(UGC_REFUND_SLABS, 90, 5000000)).toMatchObject({ percent: 0, refundPaise: 0 });
  });

  it('works out pro-rata, structure fit, reminders and convenience fees', () => {
    expect(prorataPercent('2026-08-01', '2027-05-31', '2026-07-15')).toBe(100);
    expect(prorataPercent('2026-08-01', '2027-05-31', '2026-12-05')).toBe(60);
    expect(prorataPercent('2026-08-01', '2027-05-31', '2027-06-01')).toBe(0);
    const st = { programId: 'p', campusId: 'c', term: 3, batch: '2025', quota: 'Government', category: null };
    expect(structureApplies({ programId: 'p', campusId: null, term: null, batch: null, quota: 'government', category: null }, st)).toBe(true);
    expect(structureApplies({ programId: 'p', campusId: null, term: 1, batch: null, quota: null, category: null }, st)).toBe(false);
    expect(reminderDue({ enabled: true, daysBefore: [3], daysAfter: [7] }, '2026-10-20', '2026-10-17')).toBe(true);
    expect(reminderDue({ enabled: true, daysBefore: [3], daysAfter: [7] }, '2026-10-20', '2026-10-27')).toBe(true);
    expect(reminderDue({ enabled: false, daysBefore: [3] }, '2026-10-20', '2026-10-17')).toBe(false);
    expect(convenienceFee({ percent: 1.5, flatRupees: 2 }, 1000000)).toBe(15200);
  });

  it('reads bank statements and challan files, and matches statement lines to the books', () => {
    const lines = parseStatementCsv('Account no 123\r\nTxn Date,Description,Chq/Ref No,Withdrawal,Deposit,Balance\r\n05/10/2026,"NEFT, RCPT/2026-27/00012",UTR88,,"12,500.00",12500\r\n06-Oct-2026,Charges,,59,,12441\r\n');
    expect(lines).toEqual([
      { txnDate: '2026-10-05', description: 'NEFT, RCPT/2026-27/00012', reference: 'UTR88', debitPaise: 0, creditPaise: 1250000, balancePaise: 1250000 },
      { txnDate: '2026-10-06', description: 'Charges', reference: '', debitPaise: 5900, creditPaise: 0, balancePaise: 1244100 },
    ]);
    expect(() => parseStatementCsv('a,b\r\n1,2')).toThrow(/Date/);
    expect(parseDay('5/10/26')).toBe('2026-10-05');
    const matches = autoMatch(
      [{ ...lines[0], id: 'L1' }],
      [
        { voucherId: 'V1', date: '2026-10-04', inPaise: 1250000, outPaise: 0, text: 'R/2026-27/00004 Fee receipt RCPT/2026-27/00012' },
        { voucherId: 'V2', date: '2026-10-05', inPaise: 1250000, outPaise: 0, text: 'Other' },
      ],
    );
    expect(matches).toEqual([{ lineId: 'L1', voucherId: 'V1' }]);
    expect(parseChallanCsv('Challan No,Amount,Date,Bank Ref\r\nCHL/1,"1,000",2026-10-21,X1\r\n')).toEqual([{ number: 'CHL/1', amountPaise: 100000, paidOn: '2026-10-21', bankRef: 'X1' }]);
  });

  it('writes amounts in words the Indian way', () => {
    expect(rupeesInWords(125050)).toBe('One Thousand Two Hundred Fifty Rupees and Fifty Paise Only');
    expect(rupeesInWords(1234567800)).toBe('One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Rupees Only');
  });
});
