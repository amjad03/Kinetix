// Fees and accounts depth in the ERP: the record-kit lists behind the desk's registers, and the shapes the counter,
// receipts, structures, challans, bank reconciliation and settings pages read from the API.

/** Desk register → its record-kit entity (GET /v1/records/<entity>); "accounts" stays a summary report. */
export const KIT_OF: Record<string, string> = {
  structures: 'fee-structures',
  invoices: 'fee-invoices',
  receipts: 'fee-receipts',
  concessions: 'fee-concessions',
  refunds: 'fee-refunds',
  'write-offs': 'fee-write-offs',
  cheques: 'fee-cheques',
  vouchers: 'acct-vouchers',
  'voucher-requests': 'acct-voucher-requests',
  ledgers: 'acct-ledgers',
  budgets: 'acct-budgets',
  closings: 'fee-closings',
  waivers: 'fee-waivers',
  'custom-plans': 'fee-custom-plans',
  challans: 'fee-challans',
  'govt-scholarships': 'fee-govt-scholarships',
  funds: 'acct-funds',
};

/** The fee setup lists (Fees → Setup), in tab order. */
export const SETUP_TABS = ['heads', 'concession-types', 'instalment-plans', 'profiles'] as const;
export type SetupTab = (typeof SETUP_TABS)[number];
export const SETUP_KIT: Record<SetupTab, string> = { heads: 'fee-heads', 'concession-types': 'fee-concession-types', 'instalment-plans': 'fee-instalment-plans', profiles: 'fee-profiles' };

export const PAY_MODES = ['cash', 'cheque', 'dd', 'card', 'upi', 'bank_transfer'] as const;
export type PayMode = (typeof PAY_MODES)[number];
/** Modes that need a reference (transaction id), and modes that are instruments in the cheque register. */
export const needsReference = (m: string) => ['card', 'upi', 'bank_transfer'].includes(m);
export const isInstrument = (m: string) => m === 'cheque' || m === 'dd';

export interface LineState {
  id: string;
  invoiceId: string;
  headCode: string;
  headName: string;
  priority: number;
  gstRate: number;
  amountPaise: number;
  waivedPaise: number;
  netPaise: number;
  paidPaise: number;
  balancePaise: number;
}

export interface DueInvoice {
  id: string;
  invoiceNo: string | null;
  title: string;
  kind: string;
  dueOn: string;
  overdue: boolean;
  amountPaise: number;
  paidPaise: number;
  balancePaise: number;
  dueNowPaise: number;
  lines: LineState[];
  instalments: { seq: number; dueOn: string; amountPaise: number; paidPaise: number; status: string }[];
}

export interface StudentDues {
  student: { id: string; fullName: string; rollNo: string; status: string; section: string };
  today: string;
  invoices: DueInvoice[];
  duePaise: number;
  overduePaise: number;
  advancePaise: number;
  receipts: { id: string; receiptNo: string; totalPaise: number; status: string; collectedOn: string; modes: { method: string }[] }[];
  blocks: { duePaise: number; overduePaise: number; hallTicket: boolean; results: boolean; tc: boolean };
}

export interface StudentHit {
  id: string;
  fullName: string;
  rollNo: string;
  status: string;
  section: string;
  duePaise: number;
}

export interface ReceiptMode {
  method: string;
  amountPaise: number;
  reference?: string | null;
  chequeNo?: string | null;
  bankName?: string | null;
  chequeDate?: string | null;
}

export interface ReceiptView {
  id: string;
  receiptNo: string;
  status: 'active' | 'cancel_pending' | 'cancelled' | 'bounced';
  institution: string;
  student: { id: string; fullName: string; rollNo: string; section: string };
  date: string;
  totalPaise: number;
  advancePaise: number;
  inWords: string;
  modes: ReceiptMode[];
  items: { invoiceId: string; title: string; invoiceNo: string | null; headCode: string; head: string; gstRate: number; sac: string | null; amountPaise: number }[];
  balancePaise: number;
  note: string;
  cancel: { reason: string; at: string | null; status: string; requestedBy: string | null } | null;
  printCount: number;
  cheques: { id: string; chequeNo: string; status: string; kind: string }[];
  reissueOf: { id: string; receiptNo: string } | null;
  reissuedAs: { id: string; receiptNo: string } | null;
  challan: { id: string; number: string } | null;
}

export interface FeeHead {
  id: string;
  code: string;
  name: string;
  kind: string;
  sortOrder: number;
  optional: boolean;
  linkedModule: string;
  refundable: boolean;
  gstRate: number;
  active: boolean;
}

export interface StructureDetail {
  structure: { id: string; name: string; academicYear: string | null; status: string; active: boolean; quota: string | null; category: string | null; batch: string | null; term: number | null; dueInDays: number; perCreditPaise: number; programId: string | null; submittedBy: string | null };
  items: { code: string; head: string; amountPaise: number; optional: boolean; linkedModule: string; refundable: boolean; gstRate: number; known: boolean }[];
  totalPaise: number;
  plan: { id: string; name: string; parts: { percent: number; dueAfterDays: number }[] } | null;
  students: number;
  assigned: number;
}

export interface PreviewRow {
  studentId: string;
  fullName: string;
  rollNo: string;
  section: string;
  quota: string | null;
  category: string | null;
  batch: string | null;
  prorataPercent: number;
  amountPaise: number;
  assigned: boolean;
}

export interface StructureSheet {
  institution: string;
  structure: { name: string; academicYear: string | null; status: string; batch: string | null; quota: string | null; category: string | null; term: number | null; dueInDays: number; perCreditPaise: number; program: string | null; campus: string | null };
  items: { code: string; head: string; amountPaise: number; optional: boolean; linkedModule: string; refundable: boolean; gstRate: number }[];
  compulsoryPaise: number;
  optionalPaise: number;
  plan: { name: string; parts: { percent: number; dueAfterDays: number; amountPaise: number }[] } | null;
}

export interface ChallanView {
  challan: { id: string; number: string; amountPaise: number; bankName: string; bankAccount: string; validUntil: string; status: string; paidOn: string | null; bankRef: string | null; receiptId: string | null; createdAt: string };
  institution: string;
  student: { fullName: string; rollNo: string; section: string };
  invoices: { id: string; title: string; invoiceNo: string | null }[];
  lines: LineState[];
  inWords: string;
  receiptNo: string | null;
}

export interface BankAccount {
  id: string;
  code: string;
  name: string;
  bankName: string | null;
  accountNo: string | null;
  ifsc: string | null;
  unmatched: number;
  lastStatement: string | null;
}

export interface BankLine {
  id: string;
  txnDate: string;
  description: string;
  reference: string;
  debitPaise: number;
  creditPaise: number;
  balancePaise: number | null;
  status: 'unmatched' | 'matched' | 'ignored';
  voucherId: string | null;
  voucherNo: string | null;
  voucherNarration: string | null;
  settlement: string | null;
  matchKind: string | null;
  note: string | null;
}

export interface Brs {
  account: { id: string; code: string; name: string; bankName: string | null; accountNo: string | null };
  asOn: string;
  booksPaise: number;
  depositsNotCredited: { voucherId: string; date: string; number: string; text: string; amountPaise: number }[];
  paymentsNotPresented: { voucherId: string; date: string; number: string; text: string; amountPaise: number }[];
  bankOnly: { id: string; date: string; text: string; creditPaise: number; debitPaise: number; status: string; note: string | null }[];
  bankComputedPaise: number;
  bankStatementPaise: number | null;
  differencePaise: number | null;
}

export interface ReminderRun {
  id: string;
  runOn: string;
  kind: string;
  students: number;
  app: number;
  sms: number;
  whatsapp: number;
  skipped: string[];
  runByName: string | null;
  createdAt: string;
}

export interface CarryRow {
  id: string;
  studentId: string;
  student: string;
  rollNo: string;
  title: string;
  invoiceNo: string | null;
  academicYear: string | null;
  dueOn: string;
  balancePaise: number;
}

/** "₹1,250.50" or "1250" typed by a person → paise; null when it is not an amount. */
export function rupeesInput(text: string): number | null {
  const clean = text.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/** What is left to give after the modes typed so far: positive when short, negative when over. */
export function shortfall(duePaise: number, modes: { amountPaise: number }[]): number {
  return duePaise - modes.reduce((s, m) => s + (Number.isFinite(m.amountPaise) ? m.amountPaise : 0), 0);
}

/** A receipt that may still be acted on: printed, cancelled or reissued. */
export const receiptState = (r: Pick<ReceiptView, 'status' | 'reissuedAs'>) => ({ canCancel: r.status === 'active', canReissue: r.status === 'cancelled' && !r.reissuedAs, taken: r.status === 'cancelled' || r.status === 'bounced' });

/** The current financial year (April to March) for a date: "2026-27". */
export function fyOf(day: string): string {
  const [y, m] = day.split('-').map(Number);
  const s = m >= 4 ? y : y - 1;
  return `${s}-${String((s + 1) % 100).padStart(2, '0')}`;
}

/** The year after a financial year: "2026-27" → "2027-28". */
export const nextFy = (fy: string) => {
  const s = Number(fy.slice(0, 4)) + 1;
  return `${s}-${String((s + 1) % 100).padStart(2, '0')}`;
};
