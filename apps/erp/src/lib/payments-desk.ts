// Bank-transfer verification queue and sponsor (PO) invoices: row types and the small pure helpers behind the two desks.

export type TransferStatus = 'pending' | 'verified' | 'rejected';
export interface BankTransferRow {
  id: string;
  invoiceId: string;
  amountPaise: number;
  utr: string;
  transferDate: string;
  hasProof: boolean;
  status: TransferStatus;
  reviewNote: string | null;
  createdAt: string;
  invoiceTitle: string;
  student: { id: string; fullName: string; rollNo: string | null };
  className: string;
  balancePaise: number;
}

export type SponsorInvoiceStatus = 'open' | 'partial' | 'paid' | 'cancelled';
export interface SponsorRow {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  gstin: string | null;
}
export interface SponsorInvoiceRow {
  id: string;
  invoiceNo: string;
  poNumber: string | null;
  title: string;
  sponsorId: string;
  sponsorName: string;
  amountPaise: number;
  paidPaise: number;
  balancePaise: number;
  dueOn: string;
  status: SponsorInvoiceStatus;
  overdue: boolean;
}
export interface SponsorOutstanding {
  billedPaise: number;
  paidPaise: number;
  outstandingPaise: number;
  overduePaise: number;
  sponsors: { sponsorId: string; sponsorName: string; invoices: number; billedPaise: number; paidPaise: number; outstandingPaise: number; overduePaise: number }[];
}

export const SPONSOR_PAY_METHODS = ['bank_transfer', 'cheque', 'cash', 'upi'] as const;
/** How many sponsored students one invoice form takes. */
export const SPONSOR_LINE_SLOTS = 3;

export const proofPath = (transferId: string) => `/api/export?path=${encodeURIComponent(`/v1/fees/bank-transfers/${transferId}/proof`)}`;

/**
 * The invoice body from the form: `s1`/`a1` .. `sN`/`aN` are a student and the fee in paise; a student without
 * an amount (or the reverse) is an error, and a student listed twice is counted once.
 */
export function sponsorInvoiceBody(v: Record<string, string>): { ok: true; body: { sponsorId: string; poNumber?: string; title: string; dueOn: string; lines: { studentId: string; description: string; amountPaise: number }[] } } | { ok: false; reason: 'lines' | 'amount' } {
  const lines: { studentId: string; description: string; amountPaise: number }[] = [];
  for (let i = 1; i <= SPONSOR_LINE_SLOTS; i++) {
    const studentId = (v[`s${i}`] ?? '').trim();
    const amount = (v[`a${i}`] ?? '').trim();
    if (!studentId && !amount) continue;
    const amountPaise = Number(amount);
    if (!studentId || !Number.isSafeInteger(amountPaise) || amountPaise < 100) return { ok: false, reason: 'amount' };
    if (lines.some((l) => l.studentId === studentId)) continue;
    lines.push({ studentId, description: (v.description ?? '').trim() || v.title.trim(), amountPaise });
  }
  if (lines.length === 0) return { ok: false, reason: 'lines' };
  const po = (v.poNumber ?? '').trim();
  return { ok: true, body: { sponsorId: v.sponsorId, ...(po ? { poNumber: po } : {}), title: v.title.trim(), dueOn: v.dueOn, lines } };
}
