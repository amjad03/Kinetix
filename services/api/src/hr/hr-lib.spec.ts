import { describe, expect, it } from 'vitest';
import { A4, latin1, Pdf, textWidth, wrap } from '../common/pdf.js';
import { qrMatrix } from '../common/qr.js';
import { parseBiometricCsv } from './biometric-csv.js';
import { bankTransferCsv, csvCell, statutoryCsv, tallyEntries, tallyXml, type StatRow } from './exports.js';
import { accruedDays, availableDays } from './leave-math.js';
import { lopDays, workingDays } from './lop.js';
import { DEFAULT_LEDGERS } from './hr.service.js';

describe('loss of pay days', () => {
  // October 2026: the 1st is a Thursday; Sundays are the weekly off.
  const base = { month: '2026-10', weeklyOffs: [0], holidays: new Set(['2026-10-02']), attendance: new Map(), leaves: [], dateOfJoining: null, dateOfLeaving: null };
  it('counts absences, half days and unpaid leave; ignores holidays, weekly offs and paid leave', () => {
    const attendance = new Map<string, 'absent' | 'half_day' | 'present'>([['2026-10-05', 'absent'], ['2026-10-06', 'half_day'], ['2026-10-02', 'absent'], ['2026-10-07', 'absent'], ['2026-10-04', 'absent']]);
    const leaves = [
      { from: '2026-10-07', to: '2026-10-07', halfDay: false, paid: true },
      { from: '2026-10-08', to: '2026-10-09', halfDay: false, paid: false },
    ];
    // 5th: 1, 6th: 0.5, 2nd (holiday): 0, 4th (Sunday): 0, 7th (paid leave): 0, 8th and 9th (unpaid): 2.
    expect(lopDays({ ...base, attendance, leaves })).toBe(3.5);
  });
  it('an unpaid leave over an absence counts the day once', () => {
    expect(lopDays({ ...base, attendance: new Map([['2026-10-08', 'absent' as const]]), leaves: [{ from: '2026-10-08', to: '2026-10-08', halfDay: false, paid: false }] })).toBe(1);
  });
  it('treats days before joining and after leaving as unpaid', () => {
    expect(lopDays({ ...base, dateOfJoining: '2026-10-16' })).toBe(15);
    expect(lopDays({ ...base, dateOfLeaving: '2026-10-20' })).toBe(11);
  });
  it('counts working days excluding weekly offs and holidays', () => {
    expect(workingDays('2026-10-01', '2026-10-11', [0], new Set(['2026-10-02']))).toBe(8);
  });
});

describe('leave accrual', () => {
  it('yearly types are credited in full from 1 January', () => {
    expect(accruedDays({ annualDays: 10, accrual: 'yearly' }, 2026, '2026-01-01', null)).toBe(10);
    expect(accruedDays({ annualDays: 10, accrual: 'yearly' }, 2027, '2026-12-31', null)).toBe(0);
  });
  it('monthly types accrue annual/12 for each month started, to the half day', () => {
    expect(accruedDays({ annualDays: 12, accrual: 'monthly' }, 2026, '2026-06-15', null)).toBe(6);
    expect(accruedDays({ annualDays: 15, accrual: 'monthly' }, 2026, '2026-03-31', null)).toBe(4);
    expect(accruedDays({ annualDays: 12, accrual: 'monthly' }, 2026, '2027-02-01', null)).toBe(12);
  });
  it('starts a mid-year joiner in the joining month', () => {
    expect(accruedDays({ annualDays: 12, accrual: 'monthly' }, 2026, '2026-12-31', '2026-07-10')).toBe(6);
  });
  it('available = opening + accrued - used - pending', () => {
    expect(availableDays({ opening: 2, accrued: 6, used: 3.5, pending: 1 })).toBe(3.5);
  });
});

describe('biometric CSV', () => {
  it('collapses punches, accepts both date formats and reports bad lines', () => {
    const r = parseBiometricCsv('employee_code,date,in_time,out_time\nE1,2026-10-05,09:05,17:30\nE1,2026-10-05,08:55,13:00\nE2,06-10-2026,9:00:30,\nE3,2026-13-40,09:00,17:00\n,2026-10-05,09:00,17:00\nE4,2026-10-05,25:00,17:00\n');
    expect(r.days).toEqual([
      { employeeCode: 'E1', date: '2026-10-05', inTime: '08:55:00', outTime: '17:30:00', line: 2 },
      { employeeCode: 'E2', date: '2026-10-06', inTime: '09:00:30', outTime: null, line: 4 },
    ]);
    expect(r.errors.map((e) => e.line)).toEqual([5, 6, 7]);
  });
  it('needs the header', () => {
    expect(parseBiometricCsv('a,b\n1,2').errors[0].line).toBe(1);
  });
});

describe('exports', () => {
  it('neutralises spreadsheet formulas and quotes commas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('A, B')).toBe('"A, B"');
    expect(csvCell(-5)).toBe('-5');
  });
  it('writes the bank file in rupees', () => {
    expect(bankTransferCsv([{ name: 'Asha Rao', account: '1234567890', ifsc: 'HDFC0001234', netPaise: 173_625_00, narration: 'Salary October 2026' }])).toBe('Beneficiary Name,Account Number,IFSC,Amount,Narration\r\nAsha Rao,1234567890,HDFC0001234,173625.00,Salary October 2026\r\n');
  });
  const stat: StatRow = { name: 'Asha', employeeCode: 'E1', uan: '100200300400', esiNumber: '5555', pan: 'ABCDE1234F', regime: 'new', grossPaise: 20_000_00, lopDays: 2, daysInMonth: 30, pfWagePaise: 20_000_00, pfCeilingPaise: 15_000_00, pfCapAtCeiling: true, employeePfPaise: 1_800_00, epsPaise: 1_250_00, epfPaise: 550_00, esiEmployeePaise: 0, esiEmployerPaise: 0, ptPaise: 200_00, tdsPaise: 0 };
  it('writes the ECR rows: EPF wage capped, EPS wage at ₹15,000', () => {
    expect(statutoryCsv('pf', [stat]).split('\r\n')[1]).toBe('100200300400,Asha,20000,15000,15000,15000,1800,1250,550,2,0');
    expect(statutoryCsv('pt', [stat]).split('\r\n')[1]).toBe('E1,Asha,20000.00,200.00');
    expect(statutoryCsv('tds', [stat])).toBe('Employee Code,Employee,PAN,Regime,Gross Salary,TDS\r\n');
  });
  it('balances the Tally journal', () => {
    const totals = { grossPaise: 200_000_00, employeePfPaise: 1_800_00, employerPfPaise: 1_800_00, employeeEsiPaise: 0, employerEsiPaise: 0, ptPaise: 200_00, tdsPaise: 24_375_00, otherDeductionsPaise: 5_000_00, netPaise: 168_625_00 };
    const { debits, credits } = tallyEntries(totals, DEFAULT_LEDGERS);
    expect(debits.reduce((s, e) => s + e.paise, 0)).toBe(201_800_00);
    expect(credits.reduce((s, e) => s + e.paise, 0)).toBe(201_800_00);
    const xml = tallyXml({ company: 'A & B School', month: '2026-04', lastDay: '2026-04-30', narration: 'Salary for April 2026', totals, ledgers: DEFAULT_LEDGERS });
    expect(xml).toContain('<DATE>20260430</DATE>');
    expect(xml).toContain('<SVCURRENTCOMPANY>A &amp; B School</SVCURRENTCOMPANY>');
    expect(xml).toContain('<LEDGERNAME>Salaries &amp; Wages</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-200000.00</AMOUNT>');
    expect(() => tallyEntries({ ...totals, netPaise: 1 }, DEFAULT_LEDGERS)).toThrow(/balance/);
  });
});

describe('QR codes', () => {
  it('picks the smallest version that fits', () => {
    expect(qrMatrix('HELLO')).toHaveLength(21);
    expect(qrMatrix('x'.repeat(62))).toHaveLength(33); // version 4
    expect(qrMatrix('x'.repeat(63))).toHaveLength(37); // version 5
    expect(qrMatrix('x'.repeat(100))).toHaveLength(41); // version 6
    expect(qrMatrix('y'.repeat(190))).toHaveLength(57); // version 10
    expect(() => qrMatrix('z'.repeat(300))).toThrow();
  });
  it('draws the three finder patterns and the timing line', () => {
    const m = qrMatrix('https://kinetix.example/verify/slug/token');
    const n = m.length;
    for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      expect(m[r][c] && m[r + 6][c + 6] && m[r + 3][c + 3]).toBe(true);
      expect(m[r + 1][c + 1]).toBe(false);
    }
    expect(m[6].slice(8, n - 8).every((v, i) => v === (i % 2 === 0))).toBe(true);
  });
  it('is deterministic', () => {
    expect(qrMatrix('same')).toEqual(qrMatrix('same'));
  });
});

describe('PDF writer', () => {
  it('writes a well-formed file whose xref offsets point at the objects', () => {
    const buf = new Pdf('Test (1)').addPage().text('Hello ₹ (world)', 40, 60, { size: 12, bold: true }).rect(10, 10, 50, 20, { fill: '#eeeeee', stroke: '#000000' }).qr('https://x.example/a', 300, 100, 100).addPage(200, 100).build();
    const s = buf.toString('latin1');
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(s).toContain('/Count 2');
    expect(s).toContain('(Hello Rs. \\(world\\)) Tj');
    const xref = s.slice(s.indexOf('xref\n'));
    const offsets = [...xref.matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(s.slice(o, o + 10)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
    expect(Number(/startxref\n(\d+)/.exec(s)![1])).toBe(s.indexOf('xref\n'));
  });
  it('measures and wraps text', () => {
    expect(textWidth('Hello', 10)).toBeCloseTo(((722 + 556 + 222 + 222 + 556) * 10) / 1000);
    expect(wrap('one two three four five six', textWidth('one two three', 10) + 1, 10)).toEqual(['one two three', 'four five six']);
    expect(latin1('₹5 – “x”')).toBe('Rs.5 - "x"');
    expect(A4.w).toBeGreaterThan(595);
  });
});
