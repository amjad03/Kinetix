// Shapes of v1/finance (services/api/src/finance).

export interface Scheme { id: string; name: string; kind: 'percent' | 'fixed'; value: number; minPercentage: number | null; maxIncomePaise: number | null; validUntil: string | null; active: boolean }
export interface Application { id: string; scheme: string; fullName: string; rollNo: string; status: 'pending' | 'approved' | 'rejected' | 'cancelled'; incomePaise: number | null; note: string; awardedPaise: number; decisionNote: string | null; createdAt: string }
export interface BudgetRow { departmentId: string; department: string; budgetPaise: number; purchaseOrdersPaise: number; payrollPaise: number; expensesPaise: number; actualPaise: number; varianceDeltaPaise: number; utilisationPercent: number | null }
export interface BudgetReport { fiscalYear: string; rows: BudgetRow[] }
export interface Voucher { date: string; type: string; number: string; narration: string; lines: { ledger: string; debitPaise: number; creditPaise: number }[] }

/** The Indian financial year (April to March) for a date, "2026-27". */
export function fiscalYearOf(d: Date): string {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

/** This year and the two before, newest first. */
export const recentFiscalYears = (now = new Date()): string[] => [0, 1, 2].map((i) => fiscalYearOf(new Date(now.getFullYear() - i, now.getMonth(), 15)));
