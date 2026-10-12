// The fees and accounts desk (/accounts): which lists, records and reports exist, and their columns as data,
// so the server pages can hand them to the client tables without passing functions.

import type { Tone } from '@/components/ui';

export type ColKind = 'text' | 'money' | 'date' | 'datetime' | 'status' | 'number' | 'bool';
export interface ColSpec {
  key: string;
  /** i18n key of the header. */
  label: string;
  kind?: ColKind;
  hideBelow?: 'sm' | 'md' | 'lg';
}
export type Row = Record<string, unknown> & { id: string };

const c = (key: string, label: string, kind: ColKind = 'text', hideBelow?: ColSpec['hideBelow']): ColSpec => ({ key, label: `fd.col.${label}`, kind, hideBelow });

export const ENTITIES = ['structures', 'accounts', 'invoices', 'receipts', 'concessions', 'refunds', 'write-offs', 'cheques', 'vouchers', 'voucher-requests', 'ledgers', 'budgets', 'closings'] as const;
export type Entity = (typeof ENTITIES)[number];
export const isEntity = (s: string): s is Entity => (ENTITIES as readonly string[]).includes(s);

/** Columns of each list, and the statuses its filter offers. */
export const LISTS: Record<Entity, { columns: ColSpec[]; statuses?: string[] }> = {
  structures: { columns: [c('name', 'name'), c('academicYear', 'year'), c('program', 'program', 'text', 'md'), c('heads', 'heads', 'number', 'md'), c('totalPaise', 'total', 'money'), c('status', 'status', 'status')], statuses: ['draft', 'pending', 'approved', 'published', 'rejected'] },
  accounts: { columns: [c('student', 'student'), c('rollNo', 'roll', 'text', 'md'), c('section', 'section', 'text', 'md'), c('invoicedPaise', 'invoiced', 'money', 'lg'), c('concessionPaise', 'concession', 'money', 'lg'), c('paidPaise', 'paid', 'money', 'sm'), c('balancePaise', 'balance', 'money'), c('oldestDue', 'oldestDue', 'date', 'md')], statuses: ['due'] },
  invoices: { columns: [c('invoiceNo', 'number'), c('student', 'student'), c('title', 'title', 'text', 'md'), c('amountPaise', 'amount', 'money', 'sm'), c('balancePaise', 'balance', 'money'), c('dueOn', 'dueOn', 'date', 'md'), c('status', 'status', 'status')], statuses: ['due', 'paid', 'cancelled'] },
  receipts: { columns: [c('receiptNo', 'number'), c('student', 'student'), c('title', 'title', 'text', 'lg'), c('method', 'mode', 'status', 'md'), c('amountPaise', 'amount', 'money'), c('paidAt', 'date', 'datetime', 'sm'), c('cashier', 'cashier', 'text', 'lg'), c('status', 'status', 'status', 'md')], statuses: ['paid', 'failed'] },
  concessions: { columns: [c('number', 'number'), c('student', 'student'), c('kind', 'kind', 'status', 'md'), c('amountPaise', 'amount', 'money'), c('appliedPaise', 'applied', 'money', 'md'), c('createdAt', 'date', 'date', 'lg'), c('status', 'status', 'status')], statuses: ['pending', 'approved', 'rejected'] },
  refunds: { columns: [c('number', 'number'), c('student', 'student'), c('receiptNo', 'receipt', 'text', 'md'), c('amountPaise', 'amount', 'money'), c('reason', 'reason', 'text', 'lg'), c('createdAt', 'date', 'date', 'md'), c('status', 'status', 'status')], statuses: ['requested', 'approved', 'paid', 'rejected'] },
  'write-offs': { columns: [c('number', 'number'), c('student', 'student'), c('title', 'title', 'text', 'md'), c('amountPaise', 'amount', 'money'), c('reason', 'reason', 'text', 'lg'), c('status', 'status', 'status')], statuses: ['pending', 'approved', 'rejected'] },
  cheques: { columns: [c('chequeNo', 'chequeNo'), c('bankName', 'bank', 'text', 'md'), c('chequeDate', 'date', 'date', 'sm'), c('student', 'student'), c('receiptNo', 'receipt', 'text', 'lg'), c('amountPaise', 'amount', 'money'), c('status', 'status', 'status')], statuses: ['received', 'deposited', 'cleared', 'bounced'] },
  vouchers: { columns: [c('number', 'number'), c('voucherType', 'type', 'status', 'sm'), c('date', 'date', 'date'), c('narration', 'narration', 'text', 'md'), c('amountPaise', 'amount', 'money'), c('status', 'status', 'status', 'md')] },
  'voucher-requests': { columns: [c('number', 'number'), c('voucherType', 'type', 'status', 'sm'), c('date', 'date', 'date', 'md'), c('narration', 'narration', 'text', 'md'), c('amountPaise', 'amount', 'money'), c('requestedBy', 'requestedBy', 'text', 'lg'), c('status', 'status', 'status')], statuses: ['pending', 'approved', 'rejected'] },
  ledgers: { columns: [c('code', 'code'), c('name', 'name'), c('groupType', 'group', 'status', 'md'), c('debitPaise', 'debit', 'money', 'lg'), c('creditPaise', 'credit', 'money', 'lg'), c('balancePaise', 'balance', 'money')] },
  budgets: { columns: [c('department', 'department'), c('budgetPaise', 'budget', 'money'), c('actualPaise', 'actual', 'money'), c('varianceDeltaPaise', 'variance', 'money', 'sm'), c('utilisationPercent', 'used', 'number', 'md')] },
  closings: { columns: [c('date', 'date', 'date'), c('cashier', 'cashier'), c('receipts', 'receipts', 'number', 'md'), c('systemPaise', 'system', 'money', 'sm'), c('countedPaise', 'counted', 'money'), c('variancePaise', 'variance', 'money', 'md'), c('status', 'status', 'status')], statuses: ['submitted', 'verified', 'rejected'] },
};

export type FilterName = 'from' | 'to' | 'fy' | 'mode' | 'minDays' | 'studentId' | 'status';
export interface ReportSpec {
  key: string;
  group: 'collection' | 'registers' | 'books' | 'statements';
  filters: FilterName[];
  columns: ColSpec[];
  /** Totals the API returns, shown above the table: total key → i18n label. */
  totals: [string, string, ColKind?][];
  /** Where a row opens, e.g. /accounts/accounts/{id}. */
  href?: string;
}

export const REPORTS: ReportSpec[] = [
  { key: 'daily-collection', group: 'collection', filters: ['from', 'to', 'mode'], columns: [c('date', 'date', 'date'), c('mode', 'mode', 'status'), c('cashier', 'cashier'), c('receipts', 'receipts', 'number'), c('amountPaise', 'amount', 'money')], totals: [['amountPaise', 'fd.col.amount', 'money'], ['receipts', 'fd.col.receipts', 'number']] },
  { key: 'head-collection', group: 'collection', filters: ['from', 'to'], columns: [c('code', 'code', 'text', 'sm'), c('head', 'head'), c('receipts', 'receipts', 'number'), c('amountPaise', 'amount', 'money')], totals: [['amountPaise', 'fd.col.amount', 'money']] },
  { key: 'outstanding', group: 'collection', filters: ['to', 'minDays'], columns: [c('student', 'student'), c('rollNo', 'roll', 'text', 'md'), c('section', 'section', 'text', 'md'), c('invoices', 'invoices', 'number', 'lg'), c('oldestDue', 'oldestDue', 'date', 'sm'), c('daysOverdue', 'daysOverdue', 'number'), c('bucket', 'bucket', 'status', 'sm'), c('balancePaise', 'balance', 'money')], totals: [['balancePaise', 'fd.col.balance', 'money'], ['students', 'fd.col.students', 'number']], href: '/accounts/accounts/{id}' },
  { key: 'concessions', group: 'registers', filters: ['from', 'to'], columns: [c('number', 'number'), c('date', 'date', 'date', 'sm'), c('student', 'student'), c('kind', 'kind', 'status', 'md'), c('sponsorName', 'sponsor', 'text', 'lg'), c('amountPaise', 'amount', 'money'), c('appliedPaise', 'applied', 'money', 'md'), c('status', 'status', 'status')], totals: [['appliedPaise', 'fd.col.applied', 'money']], href: '/accounts/concessions/{id}' },
  { key: 'refunds', group: 'registers', filters: ['from', 'to'], columns: [c('date', 'date', 'date'), c('number', 'number', 'text', 'sm'), c('student', 'student'), c('receiptNo', 'receipt', 'text', 'md'), c('mode', 'mode', 'status', 'md'), c('reason', 'reason', 'text', 'lg'), c('amountPaise', 'amount', 'money')], totals: [['amountPaise', 'fd.col.amount', 'money']] },
  { key: 'cheques', group: 'registers', filters: ['from', 'to', 'status'], columns: [c('chequeNo', 'chequeNo'), c('bankName', 'bank', 'text', 'md'), c('chequeDate', 'date', 'date', 'sm'), c('student', 'student'), c('depositedOn', 'deposited', 'date', 'lg'), c('settledOn', 'settled', 'date', 'lg'), c('amountPaise', 'amount', 'money'), c('status', 'status', 'status')], totals: [['amountPaise', 'fd.col.amount', 'money'], ['bouncedPaise', 'fd.tot.bounced', 'money']], href: '/accounts/cheques/{id}' },
  { key: 'student-ledger', group: 'registers', filters: ['studentId'], columns: [c('date', 'date', 'date'), c('ref', 'ref', 'text', 'sm'), c('particulars', 'particulars'), c('debitPaise', 'debit', 'money'), c('creditPaise', 'credit', 'money'), c('balancePaise', 'balance', 'money')], totals: [['debitPaise', 'fd.col.debit', 'money'], ['creditPaise', 'fd.col.credit', 'money'], ['balancePaise', 'fd.col.balance', 'money']] },
  { key: 'cash-book', group: 'books', filters: ['from', 'to'], columns: [c('date', 'date', 'date'), c('number', 'number', 'text', 'sm'), c('particulars', 'particulars'), c('narration', 'narration', 'text', 'lg'), c('debitPaise', 'receiptsIn', 'money'), c('creditPaise', 'paymentsOut', 'money'), c('balancePaise', 'balance', 'money', 'md')], totals: [['openingPaise', 'fd.tot.opening', 'money'], ['receiptsPaise', 'fd.col.receiptsIn', 'money'], ['paymentsPaise', 'fd.col.paymentsOut', 'money'], ['closingPaise', 'fd.tot.closing', 'money']] },
  { key: 'bank-book', group: 'books', filters: ['from', 'to'], columns: [c('date', 'date', 'date'), c('number', 'number', 'text', 'sm'), c('particulars', 'particulars'), c('narration', 'narration', 'text', 'lg'), c('debitPaise', 'receiptsIn', 'money'), c('creditPaise', 'paymentsOut', 'money'), c('balancePaise', 'balance', 'money', 'md')], totals: [['openingPaise', 'fd.tot.opening', 'money'], ['receiptsPaise', 'fd.col.receiptsIn', 'money'], ['paymentsPaise', 'fd.col.paymentsOut', 'money'], ['closingPaise', 'fd.tot.closing', 'money']] },
  { key: 'day-book', group: 'books', filters: ['from', 'to'], columns: [c('date', 'date', 'date'), c('number', 'number'), c('voucherType', 'type', 'status', 'md'), c('account', 'account'), c('narration', 'narration', 'text', 'lg'), c('debitPaise', 'debit', 'money'), c('creditPaise', 'credit', 'money')], totals: [['debitPaise', 'fd.col.debit', 'money'], ['creditPaise', 'fd.col.credit', 'money']], href: '/accounts/vouchers/{voucherId}' },
  { key: 'trial-balance', group: 'statements', filters: ['to'], columns: [c('code', 'code'), c('name', 'name'), c('groupType', 'group', 'status', 'md'), c('debitPaise', 'debit', 'money'), c('creditPaise', 'credit', 'money')], totals: [['debitPaise', 'fd.col.debit', 'money'], ['creditPaise', 'fd.col.credit', 'money']], href: '/accounts/ledgers/{id}' },
  { key: 'income-expenditure', group: 'statements', filters: ['fy'], columns: [c('side', 'side', 'status'), c('code', 'code', 'text', 'sm'), c('name', 'name'), c('paise', 'amount', 'money')], totals: [['incomePaise', 'fd.tot.income', 'money'], ['expensePaise', 'fd.tot.expense', 'money'], ['surplusPaise', 'fd.tot.surplus', 'money']] },
  { key: 'balance-sheet', group: 'statements', filters: ['to'], columns: [c('side', 'side', 'status'), c('code', 'code', 'text', 'sm'), c('name', 'name'), c('paise', 'amount', 'money')], totals: [['assetsPaise', 'fd.tot.assets', 'money'], ['liabilitiesPaise', 'fd.tot.liabilities', 'money']] },
  { key: 'budget-vs-actual', group: 'statements', filters: ['fy'], columns: [c('department', 'department'), c('budgetPaise', 'budget', 'money'), c('actualPaise', 'actual', 'money'), c('varianceDeltaPaise', 'variance', 'money'), c('utilisationPercent', 'used', 'number', 'sm')], totals: [['budgetPaise', 'fd.col.budget', 'money'], ['actualPaise', 'fd.col.actual', 'money']] },
  { key: 'gst', group: 'statements', filters: ['from', 'to'], columns: [c('date', 'date', 'date'), c('receiptNo', 'receipt', 'text', 'md'), c('student', 'student', 'text', 'lg'), c('head', 'head'), c('rate', 'rate', 'number', 'sm'), c('taxablePaise', 'taxable', 'money'), c('cgstPaise', 'cgst', 'money', 'md'), c('sgstPaise', 'sgst', 'money', 'md'), c('amountPaise', 'amount', 'money')], totals: [['taxablePaise', 'fd.col.taxable', 'money'], ['cgstPaise', 'fd.col.cgst', 'money'], ['sgstPaise', 'fd.col.sgst', 'money']] },
  { key: '80g', group: 'statements', filters: ['from', 'to'], columns: [c('date', 'date', 'date'), c('receiptNo', 'receipt', 'text', 'sm'), c('donor', 'donor'), c('pan', 'pan', 'text', 'md'), c('mode', 'mode', 'status', 'md'), c('campaign', 'campaign', 'text', 'lg'), c('amountPaise', 'amount', 'money'), c('eligible', 'eligible', 'bool')], totals: [['amountPaise', 'fd.col.amount', 'money'], ['eligiblePaise', 'fd.tot.eligible', 'money']] },
];
export const reportOf = (key: string) => REPORTS.find((r) => r.key === key);

const TONE: Record<string, Tone> = {
  draft: 'neutral', pending: 'warning', requested: 'warning', submitted: 'warning', received: 'info', deposited: 'info',
  approved: 'info', published: 'success', paid: 'success', cleared: 'success', verified: 'success', posted: 'success', due: 'warning',
  rejected: 'danger', bounced: 'danger', failed: 'danger', cancelled: 'neutral', voided: 'neutral', '90+': 'danger', '61-90': 'danger', '31-60': 'warning', '0-30': 'info',
};
export const toneOf = (status: string): Tone => TONE[status] ?? 'neutral';

/** "/accounts/invoices/{id}" with the row's values filled in. */
export const fillHref = (pattern: string, row: Record<string, unknown>) => pattern.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(String(row[k] ?? '')));
