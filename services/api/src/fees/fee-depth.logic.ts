// Pure rules of fee setup, collection and accounts depth: allocation by head priority, splitting across payment
// modes, fine slabs, approval chains, refund slabs, pro-rata, structure matching, reminders, convenience fees,
// bank-statement parsing and matching. No database here; see fee-lines.ts and the controllers.
import type { ChainStep, ConvenienceFee, RefundSlab, ReminderSchedule } from '../db/schema-fee-accounts.js';

/** A line's state for allocation: what is still payable on it. */
export interface LineBalance {
  id: string;
  invoiceId: string;
  headCode: string;
  priority: number;
  balancePaise: number;
}

/** Pays `amount` into the lines in order (lowest priority number first, as given); returns what each line gets. */
export function allocateAcross(lines: LineBalance[], amount: number): { line: LineBalance; paise: number }[] {
  let left = Math.max(0, Math.trunc(amount));
  const out: { line: LineBalance; paise: number }[] = [];
  for (const l of lines) {
    if (left <= 0) break;
    const take = Math.min(left, Math.max(0, l.balancePaise));
    if (take > 0) out.push({ line: l, paise: take });
    left -= take;
  }
  return out;
}

/** Lines in the order a payment settles them: oldest due date first, then the head priority, then the head code. */
export function settleOrder<T extends { dueOn: string; priority: number; headCode: string }>(lines: T[]): T[] {
  return [...lines].sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.priority - b.priority || a.headCode.localeCompare(b.headCode));
}

/** Splits allocation pieces across the payment modes in the order given (cash first, then the cheque…). */
export function splitByModes<P extends { paise: number }>(pieces: P[], modes: { amountPaise: number }[]): (P & { mode: number })[] {
  const left = modes.map((m) => m.amountPaise);
  const out: (P & { mode: number })[] = [];
  let m = 0;
  for (const piece of pieces) {
    let need = piece.paise;
    while (need > 0) {
      while (m < left.length && left[m] <= 0) m++;
      if (m >= left.length) throw new Error('The payment modes add up to less than what is allocated');
      const take = Math.min(need, left[m]);
      out.push({ ...piece, paise: take, mode: m });
      left[m] -= take;
      need -= take;
    }
  }
  return out;
}

/** How a reduction (concession, write-off, waiver) comes off the lines: the named heads only (all when none), lowest priority first. */
export function reductionPlan(lines: { id: string; headCode: string; priority: number; netPaise: number; unpaidPaise: number }[], amount: number, heads: string[] = []): { id: string; paise: number }[] {
  const pool = lines.filter((l) => heads.length === 0 || heads.includes(l.headCode)).sort((a, b) => b.priority - a.priority || a.headCode.localeCompare(b.headCode));
  let left = Math.max(0, Math.trunc(amount));
  const out: { id: string; paise: number }[] = [];
  for (const l of pool) {
    if (left <= 0) break;
    const take = Math.min(left, Math.max(0, l.unpaidPaise));
    if (take > 0) out.push({ id: l.id, paise: take });
    left -= take;
  }
  return out;
}

export interface FineSlab {
  fromDay: number;
  toDay: number | null;
  paise: number;
  /** The amount is per day within the band; otherwise once for reaching it. */
  perDay: boolean;
}

/** The slab fine for so many days late (after grace): each band reached adds its amount (per day or once), up to the cap. */
export function slabFine(slabs: FineSlab[], daysLate: number, capPaise: number | null): number {
  if (daysLate <= 0) return 0;
  let total = 0;
  for (const s of [...slabs].sort((a, b) => a.fromDay - b.fromDay)) {
    if (daysLate < s.fromDay) continue;
    const end = s.toDay === null ? daysLate : Math.min(daysLate, s.toDay);
    total += s.perDay ? s.paise * (end - s.fromDay + 1) : s.paise;
  }
  return capPaise === null ? total : Math.min(total, capPaise);
}

/** Slabs that do not overlap and run upwards from day 1. */
export function slabsProblem(slabs: FineSlab[]): string | null {
  const s = [...slabs].sort((a, b) => a.fromDay - b.fromDay);
  for (let i = 0; i < s.length; i++) {
    if (s[i].fromDay < 1) return 'Slabs start from day 1';
    if (s[i].toDay !== null && s[i].toDay! < s[i].fromDay) return 'A slab ends before it starts';
    if (i > 0 && (s[i - 1].toDay === null || s[i - 1].toDay! >= s[i].fromDay)) return 'Slabs must not overlap';
  }
  return null;
}

/** The default chains: a principal decides alone; a refund also needs the institution admin above ₹50,000. */
export const DEFAULT_CHAINS: Record<string, ChainStep[]> = {
  concession: [{ role: 'principal', limitRupees: null }],
  refund: [
    { role: 'principal', limitRupees: 50_000 },
    { role: 'tenant_admin', limitRupees: null },
  ],
  waiver: [{ role: 'principal', limitRupees: null }],
  customPlan: [{ role: 'principal', limitRupees: null }],
  receiptCancel: [{ role: 'principal', limitRupees: null }],
};
export const CHAIN_KINDS = ['concession', 'refund', 'waiver', 'customPlan', 'receiptCancel'] as const;
export type ChainKind = (typeof CHAIN_KINDS)[number];

/** A chain is one to five levels, the last without a limit (somebody can always decide). */
export function chainProblem(chain: ChainStep[]): string | null {
  if (chain.length < 1 || chain.length > 5) return 'A chain has one to five levels';
  if (chain.at(-1)!.limitRupees !== null) return 'The last level must be able to approve any amount';
  for (let i = 1; i < chain.length; i++) {
    const prev = chain[i - 1].limitRupees;
    const cur = chain[i].limitRupees;
    if (prev === null) return 'Only the last level may approve any amount';
    if (cur !== null && cur <= prev) return 'Each level must be able to approve more than the one before';
  }
  return null;
}

/**
 * What an approval at `level` does: final when the amount is within that level's limit (or it is the last level),
 * otherwise it goes up to the next level.
 */
export function chainStep(chain: ChainStep[], level: number, amountPaise: number): { final: boolean; next: number } {
  const step = chain[Math.min(level, chain.length - 1)];
  const final = level >= chain.length - 1 || step.limitRupees === null || amountPaise <= step.limitRupees * 100;
  return { final, next: final ? level : level + 1 };
}

/** The role that decides at a level. */
export const chainRole = (chain: ChainStep[], level: number) => chain[Math.min(level, chain.length - 1)].role;

/** The UGC-style refund for a withdrawal: the band for the days since the course started, its percent of the refundable paid amount, less its deduction. */
export function refundQuote(slabs: RefundSlab[], daysSinceStart: number, refundablePaidPaise: number): { percent: number; deductionPaise: number; refundPaise: number; band: number } {
  const ordered = [...slabs].sort((a, b) => (a.untilDays ?? Infinity) - (b.untilDays ?? Infinity));
  const band = ordered.findIndex((s) => s.untilDays === null || daysSinceStart <= s.untilDays);
  if (band < 0) return { percent: 0, deductionPaise: 0, refundPaise: 0, band: -1 };
  const s = ordered[band];
  const deductionPaise = Math.round(s.deductionRupees * 100);
  const refundPaise = Math.max(0, Math.round((refundablePaidPaise * s.percent) / 100) - deductionPaise);
  return { percent: s.percent, deductionPaise, refundPaise, band };
}

/** The UGC refund notification's bands (2018): 100% (less up to ₹1,000) before the course starts and so on. */
export const UGC_REFUND_SLABS: RefundSlab[] = [
  { untilDays: 0, percent: 100, deductionRupees: 1000 },
  { untilDays: 15, percent: 90, deductionRupees: 0 },
  { untilDays: 30, percent: 80, deductionRupees: 0 },
  { untilDays: 60, percent: 50, deductionRupees: 0 },
  { untilDays: null, percent: 0, deductionRupees: 0 },
];

/** The share of a term's fee for someone joining on `joined`: whole months left of the term (rounded up) over its months. */
export function prorataPercent(termStart: string, termEnd: string, joined: string): number {
  if (joined <= termStart) return 100;
  if (joined > termEnd) return 0;
  const months = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7)) + 1;
  const total = months(termStart, termEnd);
  const left = months(joined, termEnd);
  return Math.max(0, Math.min(100, Math.round((left / total) * 100)));
}

export interface StudentFeeFacts {
  programId: string | null;
  campusId: string | null;
  term: number | null;
  batch: string | null;
  quota: string | null;
  category: string | null;
}
export interface StructureScope {
  programId: string | null;
  campusId: string | null;
  term: number | null;
  batch: string | null;
  quota: string | null;
  category: string | null;
}

const same = (want: string | number | null, have: string | number | null) => want === null || want === '' || String(want).toLowerCase() === String(have ?? '').toLowerCase();

/** A structure applies to a student when every dimension it names (programme, campus, semester, batch, quota, category) matches. */
export function structureApplies(s: StructureScope, st: StudentFeeFacts): boolean {
  return same(s.programId, st.programId) && same(s.campusId, st.campusId) && same(s.term, st.term) && same(s.batch, st.batch) && same(s.quota, st.quota) && same(s.category, st.category);
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Whether a fee due on `dueOn` is reminded today by the schedule: so many days before, or so many days after. */
export function reminderDue(s: ReminderSchedule, dueOn: string, today: string): boolean {
  if (!s.enabled) return false;
  return (s.daysBefore ?? []).some((d) => addDays(dueOn, -d) === today) || (s.daysAfter ?? []).some((d) => addDays(dueOn, d) === today);
}

/** The convenience fee for an online payment of `amountPaise`. */
export function convenienceFee(c: ConvenienceFee, amountPaise: number): number {
  const pct = Math.max(0, Math.min(10, c.percent ?? 0));
  return Math.round((amountPaise * pct) / 100) + Math.round(Math.max(0, c.flatRupees ?? 0) * 100);
}

/** Splits a CSV line, honouring quoted fields. */
export function csvCells(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** "1,23,456.50" or "₹ 500" → paise; blank → 0. */
export function rupeesToPaise(v: string): number {
  const clean = v.replace(/[₹,\s]/g, '').replace(/^Rs\.?/i, '');
  if (!clean) return 0;
  const n = Number(clean);
  if (!Number.isFinite(n)) throw new Error(`"${v}" is not an amount`);
  return Math.round(n * 100);
}

/** 2026-10-05, 05/10/2026, 05-10-2026 or 05-Oct-2026 → 2026-10-05. */
export function parseDay(v: string): string {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})[/.-](\d{1,2}|[A-Za-z]{3})[/.-](\d{2,4})$/.exec(s);
  if (!m) throw new Error(`"${v}" is not a date`);
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const month = /^\d+$/.test(m[2]) ? Number(m[2]) : months.indexOf(m[2].toLowerCase()) + 1;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (month < 1 || month > 12) throw new Error(`"${v}" is not a date`);
  return `${year}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export interface StatementLine {
  txnDate: string;
  description: string;
  reference: string;
  debitPaise: number;
  creditPaise: number;
  balancePaise: number | null;
}

const HEADER_ALIASES: Record<keyof Omit<StatementLine, 'balancePaise'> | 'balance' | 'amount' | 'type', string[]> = {
  txnDate: ['date', 'txn date', 'transaction date', 'value date', 'posting date'],
  description: ['description', 'narration', 'particulars', 'remarks', 'details'],
  reference: ['reference', 'ref', 'ref no', 'cheque no', 'chq no', 'utr', 'chq/ref no', 'ref no./cheque no.'],
  debitPaise: ['debit', 'withdrawal', 'withdrawals', 'dr', 'withdrawal amt', 'debit amount'],
  creditPaise: ['credit', 'deposit', 'deposits', 'cr', 'deposit amt', 'credit amount'],
  balance: ['balance', 'closing balance', 'running balance'],
  amount: ['amount'],
  type: ['type', 'dr/cr', 'cr/dr'],
};

/** A bank statement exported as CSV (any Indian bank's usual columns): one line per transaction. */
export function parseStatementCsv(text: string): StatementLine[] {
  const rows = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  // The header is the first row naming a date column (banks put account details above it).
  const at = rows.findIndex((r) => csvCells(r).some((c) => HEADER_ALIASES.txnDate.includes(c.toLowerCase())));
  if (at < 0) throw new Error('No header row with a Date column was found');
  const head = csvCells(rows[at]).map((h) => h.toLowerCase());
  const col = (k: keyof typeof HEADER_ALIASES) => head.findIndex((h) => HEADER_ALIASES[k].includes(h));
  const ix = { date: col('txnDate'), desc: col('description'), ref: col('reference'), dr: col('debitPaise'), cr: col('creditPaise'), bal: col('balance'), amt: col('amount'), type: col('type') };
  if (ix.dr < 0 && ix.cr < 0 && ix.amt < 0) throw new Error('The file needs Debit and Credit columns, or an Amount column');
  const out: StatementLine[] = [];
  for (const [i, raw] of rows.slice(at + 1).entries()) {
    const c = csvCells(raw);
    const get = (n: number) => (n >= 0 ? (c[n] ?? '') : '');
    if (!get(ix.date)) continue;
    let txnDate: string;
    try {
      txnDate = parseDay(get(ix.date));
    } catch {
      throw new Error(`Line ${at + i + 2}: "${get(ix.date)}" is not a date`);
    }
    let debit = ix.dr >= 0 ? rupeesToPaise(get(ix.dr)) : 0;
    let credit = ix.cr >= 0 ? rupeesToPaise(get(ix.cr)) : 0;
    if (ix.amt >= 0 && ix.dr < 0 && ix.cr < 0) {
      const amount = rupeesToPaise(get(ix.amt));
      const isDebit = /^d/i.test(get(ix.type)) || amount < 0;
      debit = isDebit ? Math.abs(amount) : 0;
      credit = isDebit ? 0 : Math.abs(amount);
    }
    if (debit === 0 && credit === 0) continue;
    out.push({ txnDate, description: get(ix.desc), reference: get(ix.ref), debitPaise: debit, creditPaise: credit, balancePaise: ix.bal >= 0 && get(ix.bal) ? rupeesToPaise(get(ix.bal)) : null });
  }
  return out;
}

export interface BookEntry {
  voucherId: string;
  date: string;
  /** Money into the bank per the books (a debit to the bank ledger). */
  inPaise: number;
  outPaise: number;
  text: string;
}

const daysApart = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4));

/**
 * Auto-match: a statement line matches a book entry of the same amount and direction within `windowDays`; a shared
 * reference word (cheque number, UTR, receipt number) wins, then the nearest date. Each entry is used once.
 */
export function autoMatch(lines: (StatementLine & { id: string })[], entries: BookEntry[], windowDays = 5): { lineId: string; voucherId: string }[] {
  const used = new Set<string>();
  const out: { lineId: string; voucherId: string }[] = [];
  for (const l of [...lines].sort((a, b) => a.txnDate.localeCompare(b.txnDate))) {
    const lw = words(`${l.reference} ${l.description}`);
    const candidates = entries
      .filter((e) => !used.has(e.voucherId) && (l.creditPaise > 0 ? e.inPaise === l.creditPaise : e.outPaise === l.debitPaise) && daysApart(e.date, l.txnDate) <= windowDays)
      .map((e) => ({ e, shared: [...words(e.text)].some((w) => lw.has(w)), gap: daysApart(e.date, l.txnDate) }))
      .sort((a, b) => Number(b.shared) - Number(a.shared) || a.gap - b.gap);
    const best = candidates[0];
    if (!best) continue;
    // Two equally good candidates with no shared reference: leave it for a person.
    if (!best.shared && candidates[1] && !candidates[1].shared && candidates[1].gap === best.gap) continue;
    used.add(best.e.voucherId);
    out.push({ lineId: l.id, voucherId: best.e.voucherId });
  }
  return out;
}

export interface ChallanPaid {
  number: string;
  amountPaise: number;
  paidOn: string;
  bankRef: string;
}

/** The bank's paid-challan file: challan number, amount, date and the bank's reference. */
export function parseChallanCsv(text: string): ChallanPaid[] {
  const rows = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!rows.length) return [];
  const head = csvCells(rows[0]).map((h) => h.toLowerCase());
  const find = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const ix = { no: find('challan', 'challan no', 'challan number', 'number'), amt: find('amount', 'amount paid'), date: find('date', 'paid on', 'payment date'), ref: find('reference', 'bank ref', 'bank reference', 'journal no', 'utr') };
  if (ix.no < 0 || ix.amt < 0 || ix.date < 0) throw new Error('The file needs Challan, Amount and Date columns');
  return rows.slice(1).map((r, i) => {
    const c = csvCells(r);
    try {
      return { number: c[ix.no] ?? '', amountPaise: rupeesToPaise(c[ix.amt] ?? ''), paidOn: parseDay(c[ix.date] ?? ''), bankRef: ix.ref >= 0 ? (c[ix.ref] ?? '') : '' };
    } catch (e) {
      throw new Error(`Line ${i + 2}: ${(e as Error).message}`);
    }
  });
}

/** Indian-system words for a rupee amount, for receipts and challans ("Twelve Thousand Five Hundred Rupees Only"). */
export function rupeesInWords(paise: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n: number) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`);
  const three = (n: number) => `${n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' : ''}` : ''}${n % 100 ? two(n % 100) : ''}`;
  const r = Math.floor(Math.abs(paise) / 100);
  const p = Math.abs(paise) % 100;
  if (r === 0 && p === 0) return 'Zero Rupees Only';
  const parts: string[] = [];
  const crore = Math.floor(r / 1_00_00_000);
  const lakh = Math.floor((r % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((r % 1_00_000) / 1000);
  const rest = r % 1000;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (rest) parts.push(three(rest));
  const rupees = parts.length ? `${parts.join(' ')} Rupees` : '';
  const ps = p ? `${rupees ? ' and ' : ''}${two(p)} Paise` : '';
  return `${rupees}${ps} Only`;
}
