// Pure rules of the fees and accounts desk: numbering series, defaults, concession amounts, cash counts, cheque states and ageing.
import type { FeeHead, PaymentModeSetting, Series } from '../db/schema-fee-accounts.js';

export type SeriesKey = 'receipt' | 'invoice' | 'concession' | 'refund' | 'writeOff' | 'voucher';
export const SERIES_KEYS: SeriesKey[] = ['receipt', 'invoice', 'concession', 'refund', 'writeOff', 'voucher'];

export const DEFAULT_SERIES: Record<SeriesKey, Series> = {
  receipt: { prefix: 'RCPT/{FY}/', next: 1, pad: 5 },
  invoice: { prefix: 'INV/{FY}/', next: 1, pad: 5 },
  concession: { prefix: 'CON/{FY}/', next: 1, pad: 4 },
  refund: { prefix: 'RFD/{FY}/', next: 1, pad: 4 },
  writeOff: { prefix: 'WO/{FY}/', next: 1, pad: 4 },
  voucher: { prefix: 'VR/{FY}/', next: 1, pad: 4 },
};

export const DEFAULT_HEADS: FeeHead[] = [
  { code: 'TUI', name: 'Tuition', gstRate: 0, accountCode: '4000' },
  { code: 'EXM', name: 'Examination', gstRate: 0, accountCode: '4000' },
  { code: 'LAB', name: 'Laboratory', gstRate: 0, accountCode: '4000' },
  { code: 'TRN', name: 'Transport', gstRate: 0, accountCode: '4000' },
  { code: 'UNI', name: 'Uniform and books', gstRate: 12, accountCode: '4100' },
  { code: 'FIN', name: 'Late fee', gstRate: 0, accountCode: '4100' },
];

export const DEFAULT_MODES: PaymentModeSetting[] = [
  { mode: 'cash', enabled: true, accountCode: '1000' },
  { mode: 'cheque', enabled: true, accountCode: '1010' },
  { mode: 'dd', enabled: true, accountCode: '1010' },
  { mode: 'online', enabled: true, accountCode: '1010' },
  { mode: 'bank_transfer', enabled: true, accountCode: '1010' },
  { mode: 'upi', enabled: true, accountCode: '1010' },
];

/** Which account each automatic posting uses. */
export const DEFAULT_MAPPINGS: Record<string, string> = { feeIncome: '4000', otherIncome: '4100', refunds: '5200', cash: '1000', bank: '1010', receivable: '1100' };

/** Approval rules: concessions above this many rupees need the principal; write-offs always need approval. */
export const DEFAULT_APPROVALS: Record<string, number | boolean> = { concessionLimitRupees: 0, writeOffNeedsPrincipal: true, voucherNeedsApproval: true, refundNeedsApproval: true };

/** "2026-27" for a YYYY-MM-DD date (April to March). */
export function fyOf(date: string): string {
  const [y, m] = date.split('-').map(Number);
  const s = m >= 4 ? y : y - 1;
  return `${s}-${String((s + 1) % 100).padStart(2, '0')}`;
}

/** The number a series gives on a date, e.g. RCPT/2026-27/00042. `{FY}`, `{YY}` and `{YYYY}` expand. */
export function formatSeries(s: Series, date: string, n = s.next): string {
  const y = date.slice(0, 4);
  const expand = (x: string) => x.replaceAll('{FY}', fyOf(date)).replaceAll('{YYYY}', y).replaceAll('{YY}', y.slice(2));
  return `${expand(s.prefix)}${String(Math.max(0, Math.trunc(n))).padStart(Math.min(Math.max(s.pad, 1), 10), '0')}${expand(s.suffix ?? '')}`;
}

/** A series a person typed is usable: a short prefix, a positive next number and 1 to 10 digits. */
export function seriesProblem(s: Series): string | null {
  if (s.prefix.length > 30 || (s.suffix ?? '').length > 20) return 'The prefix or suffix is too long';
  if (!Number.isInteger(s.next) || s.next < 1) return 'The next number must be 1 or more';
  if (!Number.isInteger(s.pad) || s.pad < 1 || s.pad > 10) return 'Use 1 to 10 digits';
  return null;
}

/** A concession's rupee value: a percent of the invoice, or a fixed amount, never more than what is still due. */
export function concessionAmount(p: { invoiceAmountPaise?: number; outstandingPaise?: number; percent?: number | null; amountPaise?: number | null }): number {
  const raw = p.percent != null && p.invoiceAmountPaise != null ? Math.round((p.invoiceAmountPaise * p.percent) / 100) : (p.amountPaise ?? 0);
  return p.outstandingPaise != null ? Math.max(0, Math.min(raw, p.outstandingPaise)) : Math.max(0, raw);
}

export const NOTES = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1] as const;

/** Total of a cash count in paise, from note value (rupees) to count. Unknown notes and negative counts are refused. */
export function denominationTotal(d: Record<string, number>): number {
  let total = 0;
  for (const [note, count] of Object.entries(d)) {
    if (!NOTES.includes(Number(note) as (typeof NOTES)[number])) throw new Error(`${note} is not a note or coin value`);
    if (!Number.isInteger(count) || count < 0) throw new Error('Counts must be whole numbers');
    total += Number(note) * 100 * count;
  }
  return total;
}

export type ChequeStatus = 'received' | 'deposited' | 'cleared' | 'bounced';
export type ChequeAction = 'deposit' | 'clear' | 'bounce';
const NEXT: Record<ChequeAction, { from: ChequeStatus[]; to: ChequeStatus }> = {
  deposit: { from: ['received'], to: 'deposited' },
  clear: { from: ['deposited'], to: 'cleared' },
  bounce: { from: ['received', 'deposited'], to: 'bounced' },
};

/** The cheque's next status, or null when the step is not allowed from where it is. */
export function chequeNext(status: string, action: ChequeAction): ChequeStatus | null {
  return NEXT[action].from.includes(status as ChequeStatus) ? NEXT[action].to : null;
}

/** Overdue buckets for the defaulters list. */
export function ageBucket(daysOverdue: number): 'current' | '0-30' | '31-60' | '61-90' | '90+' {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return '0-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  return '90+';
}

/** A GST-inclusive amount split into taxable value and tax (CGST and SGST halves for an intra-state supply). */
export function gstSplit(inclusivePaise: number, rate: number) {
  const taxable = rate > 0 ? Math.round((inclusivePaise * 100) / (100 + rate)) : inclusivePaise;
  const tax = inclusivePaise - taxable;
  const cgst = Math.floor(tax / 2);
  return { taxablePaise: taxable, cgstPaise: cgst, sgstPaise: tax - cgst, taxPaise: tax };
}

/** The fee head an invoice title belongs to: the first head whose name or code appears in it. */
export function headOf(title: string, heads: FeeHead[]): FeeHead | null {
  const t = title.toLowerCase();
  return heads.find((h) => t.includes(h.name.toLowerCase()) || t.split(/\W+/).includes(h.code.toLowerCase())) ?? null;
}

/** A month "YYYY-MM" can be closed once it has ended. */
export function periodClosable(period: string, today: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(period) && period < today.slice(0, 7);
}

/** Cash donations above ₹2,000 do not qualify for an 80G deduction. */
export function eligible80G(mode: string, amountPaise: number): boolean {
  return !(mode === 'cash' && amountPaise > 2000_00);
}
