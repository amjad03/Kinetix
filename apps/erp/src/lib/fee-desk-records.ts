// Turns a desk record from the API (GET /v1/fee-accounts/records/:entity/:id) into DeskRecord props:
// facts, details, related lists, workflow steps, the decide endpoint and the actions this viewer may take.

import type { ActionSpec, Fact, StepSpec, TableSpec } from '@/components/fee-desk/DeskRecord';
import type { FieldSpec } from '@/components/fee-desk/DeskAction';
import type { ColKind, ColSpec, Entity, Row } from './fee-desk';
import type { RoleName } from './types';

type R = Record<string, unknown>;
type Api = { record: R; history: { id: string; at: string; actor: string | null; action: string; data?: unknown }[] } & Record<string, unknown>;
export interface RecordView {
  title: string;
  subtitle?: string;
  status?: string;
  facts: Fact[];
  details?: Fact[];
  overview?: TableSpec & { label: string };
  related?: (TableSpec & { value: string; label: string })[];
  steps?: StepSpec[];
  decide?: { path: string; canDecide: boolean };
  actions?: ActionSpec[];
}

const f = (label: string, value: unknown, kind?: ColKind): Fact => ({ label: `fd.col.${label}`, value, kind });
const col = (key: string, label: string, kind: ColKind = 'text'): ColSpec => ({ key, label: `fd.col.${label}`, kind });
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]).map((r, i) => ({ ...r, id: String(r.id ?? i) })) : []);
const s = (v: unknown) => (v == null ? '' : String(v));
const HEADS: RoleName[] = ['principal', 'tenant_admin'];
const FEE: RoleName[] = ['principal', 'tenant_admin', 'accountant'];
const may = (roles: RoleName[], allowed: RoleName[]) => roles.some((r) => allowed.includes(r));
const today = () => new Date().toISOString().slice(0, 10);

/** done / current / upcoming / rejected for a request that waits for one decision. */
function decisionSteps(r: R, waiting: string, requested: string, by: string, decidedBy: string, last?: StepSpec): StepSpec[] {
  const st = s(r.status);
  const decided = st !== waiting;
  return [
    { id: 'requested', label: requested, state: 'done', by: s(r[by]) || null, at: s(r.created_at) || null },
    { id: 'decision', label: 'fd.step.decision', state: st === 'rejected' ? 'rejected' : decided ? 'done' : 'current', by: s(r[decidedBy]) || null, at: s(r.decided_at) || null, note: s(r.decision_note) || null },
    ...(last ? [last] : []),
  ];
}

const reason: FieldSpec = { name: 'reason', label: 'fd.col.reason', kind: 'textarea', required: true };

export function recordView(entity: Entity, id: string, d: Api, me: { id: string; roles: RoleName[] }): RecordView {
  const r = d.record;
  const base = `/v1/fee-accounts/${entity}/${id}`;
  const notMine = (by: unknown) => s(by) !== me.id;
  switch (entity) {
    case 'structures': {
      const items = (r.items as { head: string; amountPaise: number }[]).map((x, i) => ({ id: String(i), head: x.head, amountPaise: x.amountPaise }));
      const total = items.reduce((a, x) => a + x.amountPaise, 0);
      const st = s(r.status);
      const order = ['draft', 'pending', 'approved', 'published'];
      const at = order.indexOf(st);
      const steps: StepSpec[] = [
        { id: 'draft', label: 'fd.step.draft', state: 'done', at: s(r.created_at) },
        { id: 'pending', label: 'fd.step.sent', state: at > 1 || st === 'rejected' ? 'done' : at === 1 ? 'current' : 'upcoming', by: s(r.submittedByName) || null, at: s(r.submitted_at) || null },
        { id: 'approved', label: 'fd.step.approved', state: st === 'rejected' ? 'rejected' : at >= 2 ? 'done' : 'upcoming', by: s(r.decidedByName) || null, at: s(r.decided_at) || null, note: s(r.decision_note) || null },
        { id: 'published', label: 'fd.step.published', state: st === 'published' ? 'done' : st === 'approved' ? 'current' : 'upcoming', at: s(r.published_at) || null },
      ];
      const actions: ActionSpec[] = [];
      if (st === 'draft' || st === 'rejected') actions.push({ label: 'fd.a.submit', path: `${base}/submit`, done: 'fd.done.submitted' });
      if (st === 'approved') actions.push({ label: 'fd.a.publish', path: `${base}/publish`, done: 'fd.done.published' });
      return {
        title: s(r.name),
        subtitle: [r.academic_year, r.program, r.campus].filter(Boolean).join(' · '),
        status: st,
        facts: [f('total', total, 'money'), f('heads', items.length, 'number'), f('year', r.academic_year), f('dueInDays', r.due_in_days, 'number'), f('program', r.program ?? '—')],
        overview: { label: 'fd.col.heads', columns: [col('head', 'head'), col('amountPaise', 'amount', 'money')], rows: items },
        steps,
        decide: st === 'pending' ? { path: `${base}/decide`, canDecide: may(me.roles, HEADS) && notMine(r.submitted_by) } : undefined,
        actions,
      };
    }
    case 'accounts': {
      const due = rows(d.invoices).filter((i) => i.status === 'due');
      return {
        title: s(r.student),
        subtitle: [r.section, r.rollNo].filter(Boolean).join(' · '),
        status: Number(r.balancePaise) > 0 ? 'due' : 'paid',
        facts: [f('invoiced', r.invoicedPaise, 'money'), f('paid', r.paidPaise, 'money'), f('balance', r.balancePaise, 'money'), f('advance', r.creditPaise, 'money'), f('section', r.section)],
        overview: { label: 'fd.r.statement', columns: [col('date', 'date', 'date'), col('ref', 'ref'), col('particulars', 'particulars'), col('debitPaise', 'debit', 'money'), col('creditPaise', 'credit', 'money'), col('balancePaise', 'balance', 'money')], rows: rows(d.ledger) },
        related: [
          { value: 'invoices', label: 'fd.nav.invoices', columns: [col('invoiceNo', 'number'), col('title', 'title'), col('amountPaise', 'amount', 'money'), col('balancePaise', 'balance', 'money'), col('dueOn', 'dueOn', 'date'), col('status', 'status', 'status')], rows: rows(d.invoices), href: '/accounts/invoices/{id}' },
          { value: 'receipts', label: 'fd.nav.receipts', columns: [col('receiptNo', 'number'), col('method', 'mode', 'status'), col('amountPaise', 'amount', 'money'), col('paidAt', 'date', 'datetime'), col('status', 'status', 'status')], rows: rows(d.receipts), href: '/accounts/receipts/{id}' },
          { value: 'concessions', label: 'fd.nav.concessions', columns: [col('number', 'number'), col('kind', 'kind', 'status'), col('amountPaise', 'amount', 'money'), col('status', 'status', 'status')], rows: rows(d.concessions), href: '/accounts/concessions/{id}' },
          { value: 'refunds', label: 'fd.nav.refunds', columns: [col('number', 'number'), col('amountPaise', 'amount', 'money'), col('status', 'status', 'status')], rows: rows(d.refunds), href: '/accounts/refunds/{id}' },
        ],
        actions: [
          { label: 'fd.a.remind', path: '/v1/fees/reminders', fixed: { studentIds: [id] }, variant: 'outline', done: 'fd.done.reminded' },
          ...(due.length ? [{ label: 'fd.a.concession', path: '/v1/fee-accounts/concessions', fixed: { studentId: id }, variant: 'outline' as const, done: 'fd.done.requested', fields: concessionFields(due) }] : []),
        ],
      };
    }
    case 'invoices': {
      const st = s(r.status);
      const bal = Number(r.balancePaise);
      return {
        title: s(r.invoice_no) || s(r.title),
        subtitle: `${s(r.student)} · ${s(r.title)}`,
        status: st,
        facts: [f('amount', r.amount_paise, 'money'), f('paid', r.paid_paise, 'money'), f('balance', bal, 'money'), f('dueOn', r.due_on, 'date'), f('section', r.section)],
        details: [f('student', r.student), f('title', r.title), f('createdBy', r.createdByName), f('createdAt', r.created_at, 'datetime')],
        overview: { label: 'fd.r.instalments', columns: [col('seq', 'seq', 'number'), col('dueOn', 'dueOn', 'date'), col('amountPaise', 'amount', 'money')], rows: rows(d.instalments) },
        related: [
          { value: 'payments', label: 'fd.nav.receipts', columns: [col('receiptNo', 'number'), col('method', 'mode', 'status'), col('amountPaise', 'amount', 'money'), col('paidAt', 'date', 'datetime'), col('status', 'status', 'status')], rows: rows(d.payments).filter((p) => p.receiptNo), href: '/accounts/receipts/{id}' },
          { value: 'adjustments', label: 'fd.r.adjustments', columns: [col('number', 'number'), col('kind', 'kind', 'status'), col('amountPaise', 'amount', 'money'), col('status', 'status', 'status')], rows: rows(d.adjustments) },
          { value: 'late', label: 'fd.r.lateFees', columns: [col('daysLate', 'daysOverdue', 'number'), col('appliedPaise', 'applied', 'money'), col('waivedPaise', 'waived', 'money'), col('waiveReason', 'reason')], rows: rows(d.lateFees) },
        ],
        actions:
          st === 'due' && bal > 0
            ? ([
                { label: 'fd.a.concession', path: '/v1/fee-accounts/concessions', fixed: { studentId: s(r.studentId), invoiceId: id }, variant: 'outline', done: 'fd.done.requested', fields: [kindField, { name: 'percent', label: 'fd.col.percent', kind: 'number' }, { name: 'amountPaise', label: 'fd.col.amount', kind: 'money' }, { name: 'sponsorName', label: 'fd.col.sponsor' }, reason] },
                { label: 'fd.a.writeOff', path: '/v1/fee-accounts/write-offs', fixed: { invoiceId: id }, variant: 'outline', done: 'fd.done.requested', fields: [{ name: 'amountPaise', label: 'fd.col.amount', kind: 'money', required: true, defaultValue: String(bal / 100) }, reason] },
              ] satisfies ActionSpec[])
            : [],
      };
    }
    case 'receipts': {
      const st = s(r.status);
      const actions: ActionSpec[] = [];
      if (st === 'paid') actions.push({ label: 'fd.a.refund', path: '/v1/fee-accounts/refunds', fixed: { paymentId: id }, variant: 'outline', done: 'fd.done.requested', fields: [{ name: 'amountPaise', label: 'fd.col.amount', kind: 'money', required: true }, reason] });
      if (st === 'paid' && r.method === 'cheque' && !r.chequeId) actions.push({ label: 'fd.a.registerCheque', path: '/v1/fee-accounts/cheques', fixed: { paymentId: id }, done: 'fd.saved', fields: [{ name: 'chequeNo', label: 'fd.col.chequeNo', required: true, defaultValue: s(r.reference).match(/\d{6}/)?.[0] }, { name: 'bankName', label: 'fd.col.bank', required: true }, { name: 'chequeDate', label: 'fd.col.date', kind: 'date', required: true, defaultValue: s(r.paid_at).slice(0, 10) }] });
      return {
        title: s(r.receipt_no),
        subtitle: `${s(r.student)} · ${s(r.title)}`,
        status: st,
        facts: [f('amount', r.amount_paise, 'money'), f('mode', r.method, 'status'), f('date', r.paid_at, 'datetime'), f('cashier', r.cashier ?? '—'), f('invoice', r.invoiceNo)],
        details: [f('student', r.student), f('reference', r.reference ?? '—'), f('provider', r.provider ?? '—'), f('cheque', r.chequeStatus ?? '—', r.chequeStatus ? 'status' : 'text')],
        related: [
          { value: 'refunds', label: 'fd.nav.refunds', columns: [col('number', 'number'), col('amountPaise', 'amount', 'money'), col('status', 'status', 'status')], rows: rows(d.refunds), href: '/accounts/refunds/{id}' },
          { value: 'vouchers', label: 'fd.nav.vouchers', columns: [col('number', 'number'), col('voucherType', 'type', 'status'), col('date', 'date', 'date'), col('amountPaise', 'amount', 'money')], rows: rows(d.vouchers), href: '/accounts/vouchers/{id}' },
        ],
        actions,
      };
    }
    case 'concessions':
      return {
        title: s(r.number),
        subtitle: `${s(r.student)}${r.invoiceNo ? ` · ${s(r.invoiceNo)}` : ''}`,
        status: s(r.status),
        facts: [f('kind', r.kind, 'status'), f('amount', r.amount_paise, 'money'), f('applied', r.applied_paise, 'money'), f('percent', r.percent ?? '—'), f('sponsor', r.sponsor_name ?? '—')],
        details: [f('student', r.student), f('invoice', r.invoiceTitle ?? '—'), f('reason', r.reason), f('requestedBy', r.requestedByName)],
        steps: decisionSteps(r, 'pending', 'fd.step.requested', 'requestedByName', 'decidedByName', { id: 'applied', label: 'fd.step.applied', state: Number(r.applied_paise) > 0 ? 'done' : r.status === 'rejected' ? 'skipped' : 'upcoming', at: s(r.decided_at) || null }),
        decide: r.status === 'pending' ? { path: `${base}/decide`, canDecide: may(me.roles, FEE) && notMine(r.requested_by) } : undefined,
      };
    case 'refunds': {
      const st = s(r.status);
      return {
        title: s(r.number),
        subtitle: `${s(r.student)} · ${s(r.receiptNo)}`,
        status: st,
        facts: [f('amount', r.amount_paise, 'money'), f('receipt', r.receiptNo), f('paidOriginally', r.paymentPaise, 'money'), f('mode', r.pay_mode ?? r.method, 'status'), f('requestedBy', r.requestedByName)],
        details: [f('reason', r.reason), f('reference', r.pay_reference ?? '—'), f('paidBy', r.paidByName ?? '—'), f('paidAt', r.paid_at, 'datetime')],
        steps: decisionSteps(r, 'requested', 'fd.step.requested', 'requestedByName', 'decidedByName', { id: 'paid', label: 'fd.step.paid', state: st === 'paid' ? 'done' : st === 'approved' ? 'current' : st === 'rejected' ? 'skipped' : 'upcoming', by: s(r.paidByName) || null, at: s(r.paid_at) || null }),
        decide: st === 'requested' ? { path: `${base}/decide`, canDecide: may(me.roles, HEADS) && notMine(r.requested_by) } : undefined,
        actions: st === 'approved' ? [{ label: 'fd.a.payRefund', path: `${base}/pay`, done: 'fd.done.paid', fields: [{ name: 'mode', label: 'fd.col.mode', kind: 'select', options: ['bank_transfer', 'upi', 'cheque', 'cash', 'original_method'].map((m) => ({ value: m, label: m })) }, { name: 'reference', label: 'fd.col.reference' }] }] : [],
      };
    }
    case 'write-offs':
      return {
        title: s(r.number),
        subtitle: `${s(r.student)} · ${s(r.invoiceNo)}`,
        status: s(r.status),
        facts: [f('amount', r.amount_paise, 'money'), f('invoice', r.invoiceNo), f('balance', r.invoiceBalancePaise, 'money'), f('requestedBy', r.requestedByName)],
        details: [f('title', r.title), f('reason', r.reason)],
        steps: decisionSteps(r, 'pending', 'fd.step.requested', 'requestedByName', 'decidedByName'),
        decide: r.status === 'pending' ? { path: `${base}/decide`, canDecide: may(me.roles, HEADS) && notMine(r.requested_by) } : undefined,
      };
    case 'voucher-requests':
      return {
        title: s(r.number),
        subtitle: s(r.narration),
        status: s(r.status),
        facts: [f('type', r.voucher_type, 'status'), f('date', r.voucher_date, 'date'), f('amount', r.amount_paise, 'money'), f('requestedBy', r.requestedByName)],
        overview: { label: 'fd.r.lines', columns: [col('account', 'account'), col('debitPaise', 'debit', 'money'), col('creditPaise', 'credit', 'money')], rows: rows(d.lines) },
        steps: decisionSteps(r, 'pending', 'fd.step.entered', 'requestedByName', 'decidedByName', { id: 'posted', label: 'fd.step.posted', state: r.voucher_id ? 'done' : r.status === 'rejected' ? 'skipped' : 'upcoming' }),
        decide: r.status === 'pending' ? { path: `/v1/fee-accounts/vouchers/${id}/decide`, canDecide: may(me.roles, FEE) && notMine(r.requested_by) } : undefined,
      };
    case 'vouchers':
      return {
        title: s(r.number),
        subtitle: s(r.narration),
        status: r.voided_at ? 'voided' : 'posted',
        facts: [f('type', r.voucher_type, 'status'), f('date', r.voucher_date, 'date'), f('amount', r.amountPaise, 'money'), f('year', r.financial_year), f('tally', r.tallyStatus ?? '—', r.tallyStatus ? 'status' : 'text')],
        details: [f('source', r.source_type ?? '—'), f('postedBy', r.postedByName ?? '—'), f('createdAt', r.created_at, 'datetime'), ...(r.tallyError ? [f('tallyError', r.tallyError)] : [])],
        overview: { label: 'fd.r.lines', columns: [col('account', 'account'), col('debitPaise', 'debit', 'money'), col('creditPaise', 'credit', 'money')], rows: rows(d.lines) },
      };
    case 'ledgers':
      return {
        title: `${s(r.code)} ${s(r.name)}`,
        subtitle: s(r.financialYear),
        status: r.active === false ? 'cancelled' : undefined,
        facts: [f('group', r.group_type, 'status'), f('opening', r.openingPaise, 'money'), f('closing', r.closingPaise, 'money'), f('year', r.financialYear)],
        overview: { label: 'fd.r.ledger', columns: [col('date', 'date', 'date'), col('number', 'number'), col('particulars', 'particulars'), col('narration', 'narration'), col('debitPaise', 'debit', 'money'), col('creditPaise', 'credit', 'money'), col('balancePaise', 'balance', 'money')], rows: rows(d.rows), href: '/accounts/vouchers/{voucherId}' },
      };
    case 'budgets':
      return {
        title: s(r.department),
        subtitle: s(r.fiscal_year),
        status: Number(r.actualPaise ?? 0) > Number(r.amount_paise) ? 'rejected' : undefined,
        facts: [f('budget', r.amount_paise, 'money'), f('actual', r.actualPaise, 'money'), f('variance', r.varianceDeltaPaise, 'money'), f('used', r.utilisationPercent ?? '—', 'number')],
        details: [f('purchaseOrders', r.purchaseOrdersPaise ?? 0, 'money'), f('payroll', r.payrollPaise ?? 0, 'money'), f('expenses', r.expensesPaise ?? 0, 'money'), f('note', r.note || '—')],
        overview: { label: 'fd.r.expenses', columns: [col('date', 'date', 'date'), col('description', 'narration'), col('amountPaise', 'amount', 'money')], rows: rows(d.expenses) },
      };
    case 'cheques': {
      const st = s(r.status);
      const on: FieldSpec = { name: 'on', label: 'fd.col.date', kind: 'date', required: true, defaultValue: today() };
      const actions: ActionSpec[] = [];
      if (st === 'received') actions.push({ label: 'fd.a.deposit', path: `${base}/deposit`, fields: [on], done: 'fd.saved' });
      if (st === 'deposited') actions.push({ label: 'fd.a.clear', path: `${base}/clear`, fields: [on], done: 'fd.saved' });
      if (st === 'received' || st === 'deposited') actions.push({ label: 'fd.a.bounce', path: `${base}/bounce`, variant: 'destructive', done: 'fd.done.bounced', fields: [on, { name: 'reason', label: 'fd.col.bounceReason', required: true, defaultValue: '' }, { name: 'chargePaise', label: 'fd.col.charge', kind: 'money', defaultValue: '500' }] });
      return {
        title: `${s(r.cheque_no)} · ${s(r.bank_name)}`,
        subtitle: `${s(r.student)} · ${s(r.receiptNo)}`,
        status: st,
        facts: [f('amount', r.amount_paise, 'money'), f('date', r.cheque_date, 'date'), f('deposited', r.deposited_on, 'date'), f('settled', r.cleared_on ?? r.bounced_on, 'date'), f('charge', r.bounce_charge_paise, 'money')],
        details: [f('student', r.student), f('receipt', r.receiptNo), f('bounceReason', r.bounce_reason ?? '—')],
        steps: [
          { id: 'received', label: 'fd.step.received', state: 'done', at: s(r.created_at) },
          { id: 'deposited', label: 'fd.step.deposited', state: r.deposited_on ? 'done' : st === 'bounced' ? 'skipped' : 'current', at: s(r.deposited_on) || null },
          { id: 'settled', label: st === 'bounced' ? 'fd.step.bounced' : 'fd.step.cleared', state: st === 'bounced' ? 'rejected' : st === 'cleared' ? 'done' : st === 'deposited' ? 'current' : 'upcoming', at: s(r.cleared_on ?? r.bounced_on) || null, note: s(r.bounce_reason) || null },
        ],
        actions,
      };
    }
    case 'closings': {
      const variance = Number(r.counted_paise) - Number(r.system_paise);
      const notes = Object.entries((r.denominations as Record<string, number>) ?? {}).map(([note, n]) => ({ id: note, note: `₹${note}`, count: n, amountPaise: Number(note) * 100 * n }));
      return {
        title: s(r.closing_date),
        subtitle: s(r.cashier),
        status: s(r.status),
        facts: [f('system', r.system_paise, 'money'), f('counted', r.counted_paise, 'money'), f('variance', variance, 'money'), f('receipts', r.receipt_count, 'number')],
        details: [f('note', r.note || '—')],
        overview: { label: 'fd.r.denominations', columns: [col('note', 'denomination'), col('count', 'count', 'number'), col('amountPaise', 'amount', 'money')], rows: notes },
        related: [{ value: 'receipts', label: 'fd.nav.receipts', columns: [col('receiptNo', 'number'), col('paidAt', 'date', 'datetime'), col('amountPaise', 'amount', 'money')], rows: rows(d.receipts), href: '/accounts/receipts/{id}' }],
        steps: [
          { id: 'counted', label: 'fd.step.counted', state: 'done', by: s(r.cashier), at: s(r.created_at) },
          { id: 'verified', label: 'fd.step.verified', state: r.status === 'rejected' ? 'rejected' : r.status === 'verified' ? 'done' : 'current', by: s(r.verifiedByName) || null, at: s(r.verified_at) || null, note: s(r.decision_note) || null },
        ],
        decide: r.status === 'submitted' ? { path: `${base}/decide`, canDecide: may(me.roles, FEE) && notMine(r.cashier_id) } : undefined,
      };
    }
  }
}

const kindField: FieldSpec = { name: 'kind', label: 'fd.col.kind', kind: 'select', options: ['concession', 'scholarship', 'sponsor', 'sibling', 'staff_ward', 'merit'].map((k) => ({ value: k, label: k })) };

function concessionFields(due: Row[]): FieldSpec[] {
  return [{ name: 'invoiceId', label: 'fd.col.invoice', kind: 'select', options: due.map((i) => ({ value: i.id, label: `${s(i.invoiceNo)} · ${s(i.title)}` })) }, kindField, { name: 'percent', label: 'fd.col.percent', kind: 'number' }, { name: 'amountPaise', label: 'fd.col.amount', kind: 'money' }, { name: 'sponsorName', label: 'fd.col.sponsor' }, reason];
}
