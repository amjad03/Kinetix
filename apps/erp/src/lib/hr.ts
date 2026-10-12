// Pure helpers for the HR and payroll pages.

import { rupeesToPaise } from './money';
import type { ApplicantStage, LeaveStatus, PayrollRunStatus, PtSlab } from './hr-types';

export const STAGES: ApplicantStage[] = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'];
/** An applicant in one of these stages cannot be moved again (the API answers 409). */
export const TERMINAL_STAGES: ApplicantStage[] = ['hired', 'rejected', 'withdrawn'];

export const isMonth = (v: string | undefined): v is string => !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** The month before a YYYY-MM month's successor, e.g. 2026-01 → 2025-12. */
export function shiftMonth(ym: string, by: number): string {
  const [y, m] = ym.split('-').map(Number);
  const i = y * 12 + (m - 1) + by;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

export const RUN_TONE: Record<PayrollRunStatus, 'default' | 'info' | 'warning' | 'success'> = { draft: 'default', verified: 'info', approved: 'warning', locked: 'success' };
export const LEAVE_TONE: Record<LeaveStatus, 'default' | 'info' | 'warning' | 'success' | 'error'> = { pending: 'warning', recommended: 'info', approved: 'success', rejected: 'error', cancelled: 'default' };

/**
 * What a person can still do to a run: draft → verify (payroll staff) → approve → lock (principal) → publish payslips.
 * A verified or approved run can be reopened; draft and verified runs can be recomputed.
 */
export function runActions(status: PayrollRunStatus, canApprove: boolean, published = false): { recompute: boolean; verify: boolean; approve: boolean; lock: boolean; reopen: boolean; publish: boolean; exports: boolean } {
  return {
    recompute: status === 'draft' || status === 'verified',
    verify: status === 'draft',
    approve: status === 'verified' && canApprove,
    lock: status === 'approved' && canApprove,
    reopen: (status === 'verified' || status === 'approved') && canApprove,
    publish: status === 'locked' && !published,
    exports: status === 'approved' || status === 'locked',
  };
}

export type StatutoryKind = 'pf' | 'esi' | 'pt' | 'tds';

/** Same-origin download URLs (the route at app/api/download adds the session token). */
export const downloadUrl = {
  bank: (runId: string) => `/api/download?kind=bank&id=${runId}`,
  tally: (runId: string) => `/api/download?kind=tally&id=${runId}`,
  statutory: (runId: string, kind: StatutoryKind) => `/api/download?kind=${kind}&id=${runId}`,
  payslip: (id: string) => `/api/download?kind=payslip&id=${id}`,
};

export interface LineDraft {
  componentId: string;
  /** Rupees as typed. */
  amount: string;
}

/** The structure editor's rows as the API's lines, or the first problem. Blank rows are skipped. */
export function structureLines(rows: LineDraft[]): { ok: true; lines: { componentId: string; monthlyPaise: number }[] } | { ok: false; reason: 'amount' | 'duplicate' | 'empty' } {
  const lines: { componentId: string; monthlyPaise: number }[] = [];
  for (const r of rows) {
    if (!r.componentId && !r.amount.trim()) continue;
    const paise = rupeesToPaise(r.amount);
    if (!r.componentId || paise === null || paise < 100) return { ok: false, reason: 'amount' };
    if (lines.some((l) => l.componentId === r.componentId)) return { ok: false, reason: 'duplicate' };
    lines.push({ componentId: r.componentId, monthlyPaise: paise });
  }
  return lines.length ? { ok: true, lines } : { ok: false, reason: 'empty' };
}

/** Professional Tax slabs typed in rupees to the API's paise; the first slab must start at 0. */
export function ptSlabs(rows: { from: string; amount: string; february: string }[]): { ok: true; slabs: PtSlab[] } | { ok: false } {
  const slabs: PtSlab[] = [];
  for (const r of rows) {
    const from = r.from.trim() === '' ? 0 : rupeesToPaise(r.from);
    const amount = r.amount.trim() === '' ? 0 : rupeesToPaise(r.amount);
    const feb = r.february.trim() === '' ? undefined : rupeesToPaise(r.february);
    if (from === null || amount === null || feb === null) return { ok: false };
    slabs.push({ minGrossPaise: from, amountPaise: amount, ...(feb !== undefined ? { februaryAmountPaise: feb } : {}) });
  }
  slabs.sort((a, b) => a.minGrossPaise - b.minGrossPaise);
  if (!slabs.length || slabs[0].minGrossPaise !== 0 || new Set(slabs.map((s) => s.minGrossPaise)).size !== slabs.length) return { ok: false };
  return { ok: true, slabs };
}

/** "09:05" in the school's time zone for an ISO instant, or an en dash. */
export function clockTime(iso: string | null, timeZone: string): string {
  if (!iso) return '–';
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}
