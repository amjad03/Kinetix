import type { StudentRow } from './admissions';
import type { FeeInvoice, Structure } from './types';
import { naturalCompare } from '@/lib/natural';

/** Where a student stands on fees: the worst open invoice wins. `none` = nothing billed yet. */
export type FeeState = 'overdue' | 'due' | 'partial' | 'paid' | 'none';
export const FEE_STATES: readonly FeeState[] = ['paid', 'partial', 'due', 'overdue', 'none'];
export const FEE_TONE: Record<FeeState, 'green' | 'blue' | 'amber' | 'red' | 'slate'> = { paid: 'green', partial: 'blue', due: 'amber', overdue: 'red', none: 'slate' };

export interface RosterRow extends StudentRow {
  programId: string | null;
  programName: string;
  term: number | null;
  /** Overall attendance after condonation; null when not marked yet or not visible to this role. */
  attendancePct: number | null;
  fee: FeeState | null;
  duePaise: number;
}

export function feeStates(invoices: readonly FeeInvoice[], today: string): Map<string, { state: FeeState; duePaise: number }> {
  const acc = new Map<string, { due: number; overdue: boolean; paidSome: boolean; open: boolean }>();
  for (const i of invoices) {
    if (i.status === 'cancelled') continue;
    const a = acc.get(i.student.id) ?? { due: 0, overdue: false, paidSome: false, open: false };
    if (i.paidPaise > 0) a.paidSome = true;
    if (i.status === 'due') {
      a.open = true;
      a.due += i.amountPaise - i.paidPaise;
      if (i.dueOn < today) a.overdue = true;
    }
    acc.set(i.student.id, a);
  }
  const out = new Map<string, { state: FeeState; duePaise: number }>();
  for (const [id, a] of acc) out.set(id, { state: a.overdue ? 'overdue' : a.open ? (a.paidSome ? 'partial' : 'due') : 'paid', duePaise: a.due });
  return out;
}

/** The student list with programme, semester, attendance and fee state joined in. */
export function buildRoster(students: readonly StudentRow[], structure: Structure | null, invoices: readonly FeeInvoice[] | null, attendance: ReadonlyMap<string, number | null> | null, today: string): RosterRow[] {
  const sections = new Map((structure?.sections ?? []).map((s) => [s.id, s]));
  const programs = new Map((structure?.programs ?? []).map((p) => [p.id, p]));
  const fees = invoices ? feeStates(invoices, today) : null;
  return students.map((s) => {
    const sec = sections.get(s.sectionId);
    const prog = sec ? programs.get(sec.programId) : undefined;
    const f = fees?.get(s.id);
    return {
      ...s,
      programId: prog?.id ?? null,
      programName: prog?.name ?? '',
      term: sec?.term ?? null,
      attendancePct: attendance?.get(s.id) ?? null,
      fee: fees ? (f?.state ?? 'none') : null,
      duePaise: f?.duePaise ?? 0,
    };
  });
}

/** Two-letter initials for an avatar ("Dr. Savitha Hegde" → "SH"). */
export function initials(name: string): string {
  const parts = name.replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '').split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/** The last `n` months up to the one containing `today`, oldest first ("2026-05" … "2026-10"). */
export function lastMonths(today: string, n: number): string[] {
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

export interface Receipt {
  id: string | null;
  receiptNo: string;
  amountPaise: number;
  method: string;
  /** The school-local day, YYYY-MM-DD. */
  day: string;
  student: string;
  className: string | null;
}

export function monthlyTotals(receipts: readonly Receipt[], months: readonly string[]): { month: string; paise: number; count: number }[] {
  return months.map((month) => {
    const r = receipts.filter((x) => x.day.startsWith(month));
    return { month, paise: r.reduce((s, x) => s + x.amountPaise, 0), count: r.length };
  });
}

export interface Defaulter {
  studentId: string;
  fullName: string;
  rollNo: string | null;
  className: string;
  overduePaise: number;
  invoices: number;
  oldestDue: string;
}

/** Students with money past its due date, most owed first. */
export function defaulters(invoices: readonly FeeInvoice[], today: string): Defaulter[] {
  const by = new Map<string, Defaulter>();
  for (const i of invoices) {
    if (i.status !== 'due' || i.dueOn >= today) continue;
    const d = by.get(i.student.id) ?? { studentId: i.student.id, fullName: i.student.fullName, rollNo: i.student.rollNo, className: i.className, overduePaise: 0, invoices: 0, oldestDue: i.dueOn };
    d.overduePaise += i.amountPaise - i.paidPaise;
    d.invoices += 1;
    if (i.dueOn < d.oldestDue) d.oldestDue = i.dueOn;
    by.set(i.student.id, d);
  }
  return [...by.values()].sort((a, b) => b.overduePaise - a.overduePaise || naturalCompare(a.fullName, b.fullName));
}

/** GL receipt vouchers as receipts (the fallback when the payments list is not available). */
export function receiptsFromVouchers(vouchers: readonly { date: string; type: string; number: string; narration: string; lines: { ledger: string; debitPaise: number }[] }[]): Receipt[] {
  return vouchers
    .filter((v) => v.type === 'Receipt')
    .map((v) => {
      const debit = v.lines.find((l) => l.debitPaise > 0);
      const m = /\sfrom\s(.+)$/.exec(v.narration);
      return { id: null, receiptNo: v.number, amountPaise: debit?.debitPaise ?? 0, method: debit && /cash/i.test(debit.ledger) ? 'cash' : 'bank', day: v.date, student: m?.[1] ?? '', className: null };
    })
    .sort((a, b) => naturalCompare(b.day, a.day) || naturalCompare(b.receiptNo, a.receiptNo));
}
