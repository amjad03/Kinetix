import { csv, rs, tallyEntries, xml, type TallyTotals } from '../hr/exports.js';
import type { TallyLedgers } from '@kinetix/shared';

/** Ledger names used for fee journals; payroll uses the ledgers set in payroll settings. */
export const FEE_LEDGERS = { cash: 'Cash', bank: 'Bank Account', feeIncome: 'Fee Income', refunds: 'Fee Refunds' } as const;

/** Ledgers for fixed-asset journals. */
export const ASSET_LEDGERS = { expense: 'Depreciation', accumulated: 'Accumulated Depreciation', assets: 'Fixed Assets', bank: 'Bank Account', gain: 'Profit on Sale of Assets', loss: 'Loss on Sale of Assets' } as const;

export interface JournalLine { ledger: string; debitPaise: number; creditPaise: number }
export interface Voucher { date: string; type: 'Receipt' | 'Payment' | 'Journal'; number: string; narration: string; lines: JournalLine[] }

const dr = (ledger: string, paise: number): JournalLine => ({ ledger, debitPaise: paise, creditPaise: 0 });
const cr = (ledger: string, paise: number): JournalLine => ({ ledger, debitPaise: 0, creditPaise: paise });

/** A fee collected: money in (cash for cash, the bank for everything else) against fee income. */
export const feeReceiptVoucher = (p: { date: string; receiptNo: string; method: string; amountPaise: number; student: string }): Voucher => ({
  date: p.date,
  type: 'Receipt',
  number: p.receiptNo,
  narration: `Fee receipt ${p.receiptNo} from ${p.student}`,
  lines: [dr(p.method === 'cash' ? FEE_LEDGERS.cash : FEE_LEDGERS.bank, p.amountPaise), cr(FEE_LEDGERS.feeIncome, p.amountPaise)],
});

/** A fee refunded: the refund expense against the bank. */
export const feeRefundVoucher = (p: { date: string; id: string; amountPaise: number; student: string; reason: string }): Voucher => ({
  date: p.date,
  type: 'Payment',
  number: `REF-${p.id.slice(0, 8)}`,
  narration: `Fee refund to ${p.student}: ${p.reason}`,
  lines: [dr(FEE_LEDGERS.refunds, p.amountPaise), cr(FEE_LEDGERS.bank, p.amountPaise)],
});

/** The month's payroll journal, reusing the payroll Tally entries (they balance by construction). */
export function payrollVoucher(p: { date: string; month: string; totals: TallyTotals; ledgers: TallyLedgers }): Voucher {
  const { debits, credits } = tallyEntries(p.totals, p.ledgers);
  return { date: p.date, type: 'Journal', number: `PAY-${p.month}`, narration: `Salary for ${p.month}`, lines: [...debits.map((e) => dr(e.ledger, e.paise)), ...credits.map((e) => cr(e.ledger, e.paise))] };
}

export const balanced = (v: Voucher) => v.lines.reduce((s, l) => s + l.debitPaise, 0) === v.lines.reduce((s, l) => s + l.creditPaise, 0);

export const glCsv = (vouchers: Voucher[]) =>
  csv([['Date', 'Voucher type', 'Voucher no', 'Ledger', 'Debit', 'Credit', 'Narration'], ...vouchers.flatMap((v) => v.lines.map((l) => [v.date, v.type, v.number, l.ledger, l.debitPaise ? rs(l.debitPaise) : '', l.creditPaise ? rs(l.creditPaise) : '', v.narration]))]);

/** Tally "Import Data → Vouchers": debits are negative amounts with ISDEEMEDPOSITIVE Yes. */
export function glTallyXml(company: string, vouchers: Voucher[]): string {
  const entry = (l: JournalLine) => {
    const debit = l.debitPaise > 0;
    return `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xml(l.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${debit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${debit ? '-' : ''}${rs(debit ? l.debitPaise : l.creditPaise)}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
  };
  return [
    '<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA>',
    `<REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${xml(company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>`,
    '<REQUESTDATA>',
    ...vouchers.map((v) => `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${v.type}" ACTION="Create"><DATE>${v.date.replace(/-/g, '')}</DATE><VOUCHERTYPENAME>${v.type}</VOUCHERTYPENAME><VOUCHERNUMBER>${xml(v.number)}</VOUCHERNUMBER><NARRATION>${xml(v.narration)}</NARRATION>${v.lines.map(entry).join('')}</VOUCHER></TALLYMESSAGE>`),
    '</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>',
  ].join('\n');
}

/** "2026-27" to its first and last day (April to March). */
export function fiscalRange(fy: string): { from: string; to: string } {
  const y = Number(fy.slice(0, 4));
  return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
}

/** Budget less actuals; positive = under budget. */
export const variance = (budgetPaise: number, actualPaise: number) => ({ varianceDeltaPaise: budgetPaise - actualPaise, utilisationPercent: budgetPaise > 0 ? Math.round((actualPaise / budgetPaise) * 1000) / 10 : null });

/** A scholarship's discount on one open balance. */
export const discountFor = (kind: 'percent' | 'fixed', value: number, balancePaise: number, remainingFixedPaise: number) =>
  kind === 'percent' ? Math.floor((balancePaise * value) / 100) : Math.min(balancePaise, remainingFixedPaise);

/** One year's depreciation: expense against the accumulated-depreciation contra account. */
export const depreciationLines = (paise: number): JournalLine[] => [dr(ASSET_LEDGERS.expense, paise), cr(ASSET_LEDGERS.accumulated, paise)];

/**
 * Disposal: the asset leaves at cost, its accumulated depreciation is cleared, the proceeds come
 * in, and the difference from book value (cost less accumulated) is the gain or loss.
 */
export function disposalLines(costPaise: number, accumulatedPaise: number, proceedsPaise: number): JournalLine[] {
  const gain = proceedsPaise - (costPaise - accumulatedPaise);
  return [
    ...(proceedsPaise > 0 ? [dr(ASSET_LEDGERS.bank, proceedsPaise)] : []),
    ...(accumulatedPaise > 0 ? [dr(ASSET_LEDGERS.accumulated, accumulatedPaise)] : []),
    ...(gain < 0 ? [dr(ASSET_LEDGERS.loss, -gain)] : []),
    cr(ASSET_LEDGERS.assets, costPaise),
    ...(gain > 0 ? [cr(ASSET_LEDGERS.gain, gain)] : []),
  ];
}
