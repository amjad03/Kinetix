'use client';

import { BadgeIndianRupee, Banknote, CalendarCheck2, CircleX, FileText, Inbox, Landmark, Printer, ReceiptText, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { bulkRecords } from '@/app/(dashboard)/records-actions';
import type { FieldSpec } from '@/components/fee-desk/DeskAction';
import { useWord } from '@/components/fee-desk/SpecTable';
import { RecordsTable } from '@/components/records/RecordsTable';
import { BulkReportDialog } from '@/components/records/BulkReportDialog';
import { EmptyState, StatusPill, useToast, type BulkAction, type Column, type RowAction } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { toneOf } from '@/lib/fee-desk';
import { bulkTarget, type BulkReport, type ListState, type RecordMeta, type RecordsPage, type Row } from '@/lib/records';
import { DeskDialog } from './DeskDialog';

type R = Row & Record<string, unknown>;
type Pending = { title: string; path: string; fields: FieldSpec[]; fixed?: Record<string, unknown>; done?: string; submit?: string } | null;

const today = () => new Date().toISOString().slice(0, 10);

/**
 * A fees or accounts list on the record depth kit: the entity's columns, where a row opens, and its own row and bulk
 * actions (sanction a scholarship, deposit cheques, collect at the counter…). Everything else (add, edit, bin,
 * import, export, history, saved views) comes from RecordsTable.
 */
export function FeeKitTable({ meta, page, state, label, toolbar, extraParams }: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState; label: string; toolbar?: ReactNode; extraParams?: Record<string, string> }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const word = useWord();
  const [dialog, setDialog] = useState<Pending>(null);
  const [report, setReport] = useState<{ report: BulkReport; title: string } | null>(null);
  const [, start] = useTransition();
  const e = meta.key;

  const money = (v: unknown) => (v === null || v === undefined ? '—' : fmt.rupees(Number(v)));
  const day = (v: unknown) => (v ? fmt.date(String(v).slice(0, 10), 'short') : '—');
  const pill = (v: unknown) => (v ? <StatusPill tone={toneOf(String(v))}>{word(v)}</StatusPill> : '—');
  const text = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
  const yes = (v: unknown) => (v ? t('fd.yes') : t('fd.no'));
  const c = (id: string, label: string, cell: (r: R) => ReactNode, o: Partial<Column<Row>> = {}): Column<Row> => ({ id, header: t(label as MessageKey), cell: (x) => cell(x as R), ...o });
  const num = { align: 'right' as const };

  const columns = useMemo<Column<Row>[]>(() => {
    switch (e) {
      case 'fee-heads':
        return [
          c('code', 'fx.col.code', (r) => <b className="font-mono">{text(r.code)}</b>, { sortKey: 'code', rowHeader: true, hideable: false }),
          c('name', 'fx.col.head', (r) => text(r.name), { sortKey: 'name' }),
          c('kind', 'fx.col.kind', (r) => pill(r.kind), { sortKey: 'kind', hideBelow: 'sm' }),
          c('ledger', 'fx.col.ledger', (r) => text(r.accountCode), { hideBelow: 'md' }),
          c('fund', 'fx.col.fund', (r) => text(r.fundCode), { defaultHidden: true }),
          c('gst', 'fx.col.gst', (r) => `${Number(r.gstRate)}%`, { sortKey: 'gst', ...num, hideBelow: 'md' }),
          c('optional', 'fx.col.optional', (r) => (r.optional ? word(r.linkedModule) : t('fx.compulsory')), { hideBelow: 'md' }),
          c('refundable', 'fx.col.refundable', (r) => yes(r.refundable), { defaultHidden: true }),
          c('used', 'fx.col.onInvoices', (r) => fmt.number(Number(r.used)), { ...num, defaultHidden: true }),
          c('active', 'fx.col.active', (r) => (r.active ? t('fd.yes') : <StatusPill tone="neutral">{t('fx.off')}</StatusPill>), { hideBelow: 'sm' }),
        ];
      case 'fee-structures':
        return [
          c('name', 'fx.col.structure', (r) => <b className="font-[550]">{text(r.name)}</b>, { sortKey: 'name', rowHeader: true, hideable: false }),
          c('year', 'fx.col.year', (r) => text(r.academicYear), { sortKey: 'year', hideBelow: 'sm' }),
          c('program', 'fx.col.program', (r) => text(r.program), { sortKey: 'program', hideBelow: 'md' }),
          c('who', 'fx.col.appliesTo', (r) => [r.term ? t('fx.sem', { n: Number(r.term) }) : null, r.batch, r.quota ? word(r.quota) : null, r.category].filter(Boolean).join(' · ') || t('fx.everyone'), { hideBelow: 'lg' }),
          c('total', 'fx.col.total', (r) => money(r.totalPaise), { sortKey: 'total', ...num }),
          c('assigned', 'fx.col.students', (r) => fmt.number(Number(r.assigned)), { sortKey: 'assigned', ...num, hideBelow: 'md' }),
          c('status', 'fx.col.status', (r) => pill(r.status), { sortKey: 'status' }),
        ];
      case 'fee-concession-types':
        return [
          c('name', 'fx.col.type', (r) => <b className="font-[550]">{text(r.name)}</b>, { sortKey: 'name', rowHeader: true, hideable: false }),
          c('category', 'fx.col.category', (r) => pill(r.category), { sortKey: 'category' }),
          c('value', 'fx.col.value', (r) => (r.mode === 'percent' ? `${Number(r.percent ?? 0)}%` : r.amountRupees != null ? fmt.rupees(Number(r.amountRupees) * 100) : '—'), num),
          c('heads', 'fx.col.heads', (r) => text(r.headCodes) === '—' ? t('fx.allHeads') : text(r.headCodes), { hideBelow: 'md' }),
          c('used', 'fx.col.used', (r) => fmt.number(Number(r.used)), { ...num, hideBelow: 'sm' }),
          c('active', 'fx.col.active', (r) => yes(r.active), { hideBelow: 'sm' }),
        ];
      case 'fee-instalment-plans':
        return [
          c('name', 'fx.col.plan', (r) => <b className="font-[550]">{text(r.name)}</b>, { sortKey: 'name', rowHeader: true, hideable: false }),
          c('parts', 'fx.col.parts', (r) => text(r.parts)),
          c('used', 'fx.col.invoices', (r) => fmt.number(Number(r.used)), { ...num, hideBelow: 'sm' }),
          c('active', 'fx.col.active', (r) => yes(r.active), { hideBelow: 'sm' }),
        ];
      case 'fee-profiles':
        return [
          c('student', 'fx.col.student', (r) => (
            <span className="block min-w-0">
              <b className="block truncate font-[550]">{text(r.fullName)}</b>
              <small className="block truncate text-xs text-muted-foreground">
                {text(r.rollNo)} · {text(r.section)}
              </small>
            </span>
          ), { sortKey: 'name', rowHeader: true, hideable: false }),
          c('quota', 'fx.col.quota', (r) => (r.quota ? word(r.quota) : <span className="text-muted-foreground">{t('fx.notSet')}</span>), { sortKey: 'quota' }),
          c('category', 'fx.col.category', (r) => text(r.category), { hideBelow: 'sm' }),
          c('batch', 'fx.col.batch', (r) => text(r.batch), { sortKey: 'batch', hideBelow: 'md' }),
          c('opted', 'fx.col.optedHeads', (r) => text(r.optedHeads), { hideBelow: 'lg' }),
          c('due', 'fx.col.due', (r) => money(r.duePaise), num),
        ];
      case 'fee-invoices':
        return [
          c('number', 'fx.col.invoice', (r) => <span className="font-mono text-[13px]">{text(r.invoiceNo)}</span>, { sortKey: 'number', rowHeader: true, hideable: false }),
          c('student', 'fx.col.student', (r) => `${text(r.student)} · ${text(r.rollNo)}`, { sortKey: 'student' }),
          c('title', 'fx.col.title', (r) => text(r.title), { hideBelow: 'md' }),
          c('section', 'fx.col.section', (r) => text(r.section), { sortKey: 'section', defaultHidden: true }),
          c('amount', 'fx.col.amount', (r) => money(r.amountPaise), { sortKey: 'amount', ...num, hideBelow: 'sm' }),
          c('balance', 'fx.col.balance', (r) => money(r.balancePaise), { sortKey: 'balance', ...num }),
          c('due', 'fx.col.dueOn', (r) => day(r.dueOn), { sortKey: 'due', hideBelow: 'md' }),
          c('kind', 'fx.col.kind', (r) => pill(r.kind), { defaultHidden: true }),
          c('status', 'fx.col.status', (r) => pill(r.status), {}),
        ];
      case 'fee-receipts':
        return [
          c('number', 'fx.col.receipt', (r) => <span className="font-mono text-[13px]">{text(r.receiptNo)}</span>, { sortKey: 'number', rowHeader: true, hideable: false }),
          c('date', 'fx.col.date', (r) => day(r.collectedOn), { sortKey: 'date', hideBelow: 'sm' }),
          c('student', 'fx.col.student', (r) => `${text(r.student)} · ${text(r.rollNo)}`, { sortKey: 'student' }),
          c('modes', 'fx.col.modes', (r) => String(r.modes ?? '').split(' + ').map((m) => word(m)).join(' + '), { hideBelow: 'md' }),
          c('amount', 'fx.col.amount', (r) => money(r.totalPaise), { sortKey: 'amount', ...num }),
          c('cashier', 'fx.col.cashier', (r) => text(r.cashier ?? t('fx.online')), { hideBelow: 'lg' }),
          c('prints', 'fx.col.prints', (r) => fmt.number(Number(r.printCount)), { ...num, defaultHidden: true }),
          c('status', 'fx.col.status', (r) => pill(r.status)),
        ];
      case 'fee-concessions':
        return [
          c('number', 'fx.col.number', (r) => text(r.number), { sortKey: 'number', rowHeader: true, hideable: false }),
          c('student', 'fx.col.student', (r) => text(r.student), { sortKey: 'student' }),
          c('type', 'fx.col.type', (r) => text(r.type ?? word(r.kind)), { hideBelow: 'md' }),
          c('heads', 'fx.col.heads', (r) => (r.headCodes ? text(r.headCodes) : t('fx.allHeads')), { defaultHidden: true }),
          c('amount', 'fx.col.asked', (r) => money(r.amountPaise), { sortKey: 'amount', ...num, hideBelow: 'sm' }),
          c('applied', 'fx.col.applied', (r) => money(r.appliedPaise), num),
          c('status', 'fx.col.status', (r) => (r.status === 'pending' && Number(r.level) > 0 ? <StatusPill tone="warning">{t('fx.levelN', { n: Number(r.level) + 1 })}</StatusPill> : pill(r.status))),
        ];
      case 'fee-refunds':
        return [
          c('number', 'fx.col.number', (r) => text(r.number), { sortKey: 'number', rowHeader: true, hideable: false }),
          c('student', 'fx.col.student', (r) => text(r.student), { sortKey: 'student' }),
          c('amount', 'fx.col.amount', (r) => money(r.amountPaise), { sortKey: 'amount', ...num }),
          c('withdrawal', 'fx.col.withdrawal', (r) => yes(r.closeDues), { hideBelow: 'md' }),
          c('mode', 'fx.col.paidBy', (r) => (r.payMode ? word(r.payMode) : '—'), { hideBelow: 'lg' }),
          c('reason', 'fx.col.reason', (r) => <span className="block max-w-[320px] whitespace-normal">{text(r.reason)}</span>, { hideBelow: 'lg' }),
          c('status', 'fx.col.status', (r) => pill(r.status)),
        ];
      case 'fee-write-offs':
        return [
          c('number', 'fx.col.number', (r) => text(r.number), { sortKey: 'number', rowHeader: true, hideable: false }),
          c('student', 'fx.col.student', (r) => text(r.student)),
          c('title', 'fx.col.invoice', (r) => text(r.title), { hideBelow: 'md' }),
          c('amount', 'fx.col.amount', (r) => money(r.amountPaise), { sortKey: 'amount', ...num }),
          c('status', 'fx.col.status', (r) => pill(r.status)),
        ];
      case 'fee-cheques':
        return [
          c('number', 'fx.col.chequeNo', (r) => <span className="font-mono">{text(r.chequeNo)}</span>, { sortKey: 'number', rowHeader: true, hideable: false }),
          c('kind', 'fx.col.instrument', (r) => word(r.kind), { hideBelow: 'md' }),
          c('bank', 'fx.col.bank', (r) => text(r.bankName), { hideBelow: 'md' }),
          c('date', 'fx.col.date', (r) => day(r.chequeDate), { sortKey: 'date', hideBelow: 'sm' }),
          c('student', 'fx.col.student', (r) => text(r.student), { sortKey: 'student' }),
          c('receipt', 'fx.col.receipt', (r) => text(r.receiptNo), { hideBelow: 'lg' }),
          c('amount', 'fx.col.amount', (r) => money(r.amountPaise), { sortKey: 'amount', ...num }),
          c('status', 'fx.col.status', (r) => pill(r.status)),
        ];
      case 'fee-closings':
        return [
          c('date', 'fx.col.date', (r) => day(r.closingDate), { sortKey: 'date', rowHeader: true, hideable: false }),
          c('cashier', 'fx.col.cashier', (r) => text(r.cashier), { sortKey: 'cashier' }),
          c('receipts', 'fx.col.receipts', (r) => fmt.number(Number(r.receiptCount)), { ...num, hideBelow: 'md' }),
          c('system', 'fx.col.system', (r) => money(r.systemPaise), { ...num, hideBelow: 'sm' }),
          c('counted', 'fx.col.counted', (r) => money(r.countedPaise), num),
          c('variance', 'fx.col.difference', (r) => <span className={Number(r.variancePaise) ? 'text-destructive' : ''}>{money(r.variancePaise)}</span>, { sortKey: 'variance', ...num, hideBelow: 'md' }),
          c('handedTo', 'fx.col.handedTo', (r) => text(r.handedTo), { hideBelow: 'lg' }),
          c('status', 'fx.col.status', (r) => pill(r.status)),
        ];
      case 'fee-govt-scholarships':
        return [
          c('student', 'fx.col.student', (r) => (
            <span className="block min-w-0">
              <b className="block truncate font-[550]">{text(r.student)}</b>
              <small className="block truncate text-xs text-muted-foreground">{text(r.rollNo)}</small>
            </span>
          ), { sortKey: 'student', rowHeader: true, hideable: false }),
          c('scheme', 'fx.col.scheme', (r) => text(r.scheme), { sortKey: 'scheme' }),
          c('portal', 'fx.col.portal', (r) => word(r.portal), { hideBelow: 'lg' }),
          c('app', 'fx.col.applicationNo', (r) => <span className="font-mono text-[13px]">{text(r.applicationNo)}</span>, { hideBelow: 'md' }),
          c('applied', 'fx.col.applied', (r) => money(r.appliedPaise), { sortKey: 'amount', ...num, hideBelow: 'sm' }),
          c('sanctioned', 'fx.col.sanctioned', (r) => money(r.sanctionedPaise), { ...num, hideBelow: 'md' }),
          c('received', 'fx.col.received', (r) => money(r.receivedPaise), num),
          c('status', 'fx.col.status', (r) => pill(r.status)),
        ];
      case 'fee-challans':
        return [
          c('number', 'fx.col.challan', (r) => <span className="font-mono text-[13px]">{text(r.number)}</span>, { sortKey: 'number', rowHeader: true, hideable: false }),
          c('student', 'fx.col.student', (r) => `${text(r.student)} · ${text(r.rollNo)}`),
          c('bank', 'fx.col.bank', (r) => text(r.bankName), { hideBelow: 'md' }),
          c('amount', 'fx.col.amount', (r) => money(r.amountPaise), { sortKey: 'amount', ...num }),
          c('valid', 'fx.col.validUntil', (r) => day(r.validUntil), { sortKey: 'valid', hideBelow: 'sm' }),
          c('paid', 'fx.col.paidOn', (r) => day(r.paidOn), { hideBelow: 'lg' }),
          c('status', 'fx.col.status', (r) => pill(r.status)),
        ];
      case 'fee-waivers':
      case 'fee-custom-plans':
        return [
          c('number', 'fx.col.number', (r) => text(r.number), { sortKey: 'number', rowHeader: true, hideable: false }),
          c('student', 'fx.col.student', (r) => text(r.student), { sortKey: 'student' }),
          c('invoice', 'fx.col.invoice', (r) => text(r.invoice), { hideBelow: 'md' }),
          c('amount', 'fx.col.amount', (r) => money(r.amountPaise), num),
          c('reason', 'fx.col.reason', (r) => <span className="block max-w-[320px] whitespace-normal">{text(r.reason)}</span>, { hideBelow: 'lg' }),
          c('status', 'fx.col.status', (r) => (r.status === 'pending' && Number(r.level) > 0 ? <StatusPill tone="warning">{t('fx.levelN', { n: Number(r.level) + 1 })}</StatusPill> : pill(r.status))),
        ];
      case 'acct-ledgers':
        return [
          c('code', 'fx.col.code', (r) => <b className="font-mono">{text(r.code)}</b>, { sortKey: 'code', rowHeader: true, hideable: false }),
          c('name', 'fx.col.ledger', (r) => text(r.name), { sortKey: 'name' }),
          c('group', 'fx.col.group', (r) => pill(r.groupType), { sortKey: 'group', hideBelow: 'sm' }),
          c('bank', 'fx.col.bank', (r) => (r.isCashBank ? [r.bankName, r.accountNo].filter(Boolean).join(' · ') || t('fx.cashBank') : '—'), { hideBelow: 'lg' }),
          c('balance', 'fx.col.balance', (r) => money(r.balancePaise), { sortKey: 'balance', ...num }),
          c('active', 'fx.col.active', (r) => yes(r.active), { hideBelow: 'md' }),
        ];
      case 'acct-funds':
        return [
          c('code', 'fx.col.code', (r) => <b className="font-mono">{text(r.code)}</b>, { sortKey: 'code', rowHeader: true, hideable: false }),
          c('name', 'fx.col.fund', (r) => text(r.name), { sortKey: 'name' }),
          c('vouchers', 'fx.col.vouchers', (r) => fmt.number(Number(r.vouchers)), num),
          c('active', 'fx.col.active', (r) => yes(r.active), { hideBelow: 'sm' }),
        ];
      case 'acct-vouchers':
        return [
          c('number', 'fx.col.number', (r) => <span className="font-mono text-[13px]">{text(r.number)}</span>, { sortKey: 'number', rowHeader: true, hideable: false }),
          c('type', 'fx.col.type', (r) => pill(r.voucherType), { hideBelow: 'sm' }),
          c('date', 'fx.col.date', (r) => day(r.voucherDate), { sortKey: 'date' }),
          c('narration', 'fx.col.narration', (r) => <span className="block max-w-[360px] whitespace-normal">{text(r.narration)}</span>, { hideBelow: 'md' }),
          c('amount', 'fx.col.amount', (r) => money(r.amountPaise), { sortKey: 'amount', ...num }),
          c('fund', 'fx.col.fund', (r) => text(r.fund), { defaultHidden: true }),
          c('department', 'fx.col.department', (r) => text(r.department), { defaultHidden: true }),
          c('tally', 'fx.col.tally', (r) => (r.tally ? pill(r.tally) : '—'), { defaultHidden: true }),
          c('status', 'fx.col.status', (r) => pill(r.status), { hideBelow: 'md' }),
        ];
      case 'acct-voucher-requests':
        return [
          c('number', 'fx.col.number', (r) => text(r.number), { sortKey: 'number', rowHeader: true, hideable: false }),
          c('type', 'fx.col.type', (r) => pill(r.voucherType), { hideBelow: 'sm' }),
          c('date', 'fx.col.date', (r) => day(r.voucherDate), { sortKey: 'date', hideBelow: 'md' }),
          c('narration', 'fx.col.narration', (r) => <span className="block max-w-[320px] whitespace-normal">{text(r.narration)}</span>, { hideBelow: 'md' }),
          c('amount', 'fx.col.amount', (r) => money(r.amountPaise), { sortKey: 'amount', ...num }),
          c('budget', 'fx.col.budget', (r) => (r.budgetNote ? <StatusPill tone="warning">{t('fx.overBudget')}</StatusPill> : '—'), { hideBelow: 'lg' }),
          c('status', 'fx.col.status', (r) => pill(r.status)),
        ];
      case 'acct-budgets':
        return [
          c('department', 'fx.col.department', (r) => <b className="font-[550]">{text(r.department)}</b>, { sortKey: 'department', rowHeader: true, hideable: false }),
          c('year', 'fx.col.year', (r) => text(r.fiscalYear), { sortKey: 'year', hideBelow: 'sm' }),
          c('amount', 'fx.col.budget', (r) => money(r.amountPaise), { sortKey: 'amount', ...num }),
          c('used', 'fx.col.used', (r) => money(r.usedPaise), { sortKey: 'used', ...num }),
          c('pct', 'fx.col.usedPct', (r) => <span className={Number(r.utilisation) > 100 ? 'font-semibold text-destructive' : Number(r.utilisation) >= 80 ? 'text-amber-700 dark:text-amber-300' : ''}>{`${Number(r.utilisation)}%`}</span>, { ...num, hideBelow: 'sm' }),
          c('control', 'fx.col.control', (r) => word(r.enforce), { hideBelow: 'md' }),
        ];
    }
    return [c('label', 'fx.col.name', (r) => text(r._label), { rowHeader: true })];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e, t, fmt]);

  const href = (r: R): string | undefined => {
    const id = String(r.id);
    const map: Record<string, string> = {
      'fee-structures': `/fees/structures/${id}`,
      'fee-invoices': `/accounts/invoices/${id}`,
      'fee-receipts': `/fees/receipt/${id}`,
      'fee-concessions': `/accounts/concessions/${id}`,
      'fee-refunds': `/accounts/refunds/${id}`,
      'fee-write-offs': `/accounts/write-offs/${id}`,
      'fee-cheques': `/accounts/cheques/${id}`,
      'fee-closings': `/accounts/closings/${id}`,
      'fee-waivers': `/accounts/waivers/${id}`,
      'fee-custom-plans': `/accounts/custom-plans/${id}`,
      'fee-challans': `/fees/challans/${id}`,
      'fee-govt-scholarships': `/accounts/govt-scholarships/${id}`,
      'acct-vouchers': `/accounts/vouchers/${id}`,
      'acct-voucher-requests': `/accounts/voucher-requests/${id}`,
      'acct-ledgers': `/accounts/ledgers/${id}`,
      'acct-budgets': `/accounts/budgets/${id}`,
      'fee-profiles': `/accounts/accounts/${id}`,
    };
    return map[e];
  };

  const sanctionFields: FieldSpec[] = [
    { name: 'amountPaise', label: 'fx.f.sanctioned', kind: 'money', required: true },
    { name: 'on', label: 'fx.f.on', kind: 'date', required: true, defaultValue: today() },
  ];

  const rowActions = (row: Row): RowAction<Row>[] => {
    const r = row as R;
    const out: RowAction<Row>[] = [];
    const counter = (studentId: unknown) => ({ id: 'counter', label: t('fx.collect'), icon: <BadgeIndianRupee />, onSelect: () => router.push(`/fees/counter?student=${String(studentId)}`) });
    if (e === 'fee-invoices' && r.status === 'due') out.push(counter(r.studentId));
    if (e === 'fee-profiles' && Number(r.duePaise) > 0) out.push(counter(r.id));
    if (e === 'fee-receipts') out.push({ id: 'pdf', label: t('fx.pdf'), icon: <Printer />, onSelect: () => window.open(`/api/fee-receipt/${String(r.id)}`, '_blank') });
    if (e === 'fee-challans') out.push({ id: 'print', label: t('fx.printChallan'), icon: <Printer />, onSelect: () => router.push(`/fees/challans/${String(r.id)}`) });
    if (e === 'fee-govt-scholarships') {
      if (r.status === 'applied') out.push({ id: 'sanction', label: t('fx.sanction'), icon: <CalendarCheck2 />, onSelect: () => setDialog({ title: t('fx.sanctionTitle', { name: String(r.student) }), path: `/v1/fee-collect/govt-scholarships/${String(r.id)}/sanction`, fields: sanctionFields }) });
      if (r.status === 'applied' || r.status === 'sanctioned')
        out.push(
          { id: 'receive', label: t('fx.receive'), icon: <Wallet />, onSelect: () => setDialog({ title: t('fx.receiveTitle', { name: String(r.student) }), path: `/v1/fee-collect/govt-scholarships/${String(r.id)}/receive`, done: 'fx.done.received', fields: [{ name: 'amountPaise', label: 'fx.f.received', kind: 'money', required: true, defaultValue: r.sanctionedPaise ? String(Number(r.sanctionedPaise) / 100) : '' }, { name: 'on', label: 'fx.f.on', kind: 'date', required: true, defaultValue: today() }, { name: 'reference', label: 'fx.f.dbtRef', required: true }] }) },
          { id: 'reject', label: t('fx.closeScholarship'), icon: <CircleX />, tone: 'danger', onSelect: () => setDialog({ title: t('fx.closeScholarship'), path: `/v1/fee-collect/govt-scholarships/${String(r.id)}/reject`, fields: [{ name: 'status', label: 'fx.col.status', kind: 'select', options: [{ value: 'rejected', label: word('rejected') }, { value: 'lapsed', label: word('lapsed') }] }, { name: 'reason', label: 'fx.col.reason', kind: 'textarea', required: true }] }) },
        );
      out.push(counter(r.studentId));
    }
    if (e === 'fee-cheques' && (r.status === 'received' || r.status === 'deposited'))
      out.push({ id: 'bounce', label: t('fx.bounce'), icon: <CircleX />, tone: 'danger', onSelect: () => setDialog({ title: t('fx.bounceTitle', { no: String(r.chequeNo) }), path: `/v1/fee-accounts/cheques/${String(r.id)}/bounce`, done: 'fd.done.bounced', fields: [{ name: 'on', label: 'fx.f.on', kind: 'date', required: true, defaultValue: today() }, { name: 'reason', label: 'fd.col.bounceReason', required: true }, { name: 'chargePaise', label: 'fd.col.charge', kind: 'money', defaultValue: '500' }] }) });
    if (e === 'acct-ledgers' && r.isCashBank) out.push({ id: 'reco', label: t('fx.reconcile'), icon: <Landmark />, onSelect: () => router.push(`/accounts/bank?account=${String(r.id)}`) });
    if (e === 'fee-structures') out.push({ id: 'sheet', label: t('fx.printSheet'), icon: <FileText />, onSelect: () => router.push(`/fees/structures/${String(r.id)}/print`) });
    return out;
  };

  /** Runs a module action with parameters for the selection and shows the per-record report. */
  const bulkWith = (action: string, params: Record<string, unknown>, title: string) => (_: Row[], sel: Parameters<BulkAction<Row>['onClick']>[1]) =>
    start(async () => {
      const res = await bulkRecords(e, { op: 'action', action, params, target: bulkTarget(sel.target, state) });
      if (!res.ok) return toast.error(res.error);
      setReport({ report: res.data, title });
      router.refresh();
    });

  const bulk: BulkAction<Row>[] = [];
  if (e === 'fee-cheques') bulk.push({ id: 'depositToday', label: t('fx.depositToday'), icon: <Banknote />, onClick: bulkWith('deposit', { on: today() }, t('fx.depositToday')) }, { id: 'clearToday', label: t('fx.clearToday'), icon: <ReceiptText />, onClick: bulkWith('clear', { on: today() }, t('fx.clearToday')) });

  const empties: Record<string, [string, string]> = {
    'fee-heads': ['fx.empty.heads', 'fx.empty.headsBody'],
    'fee-structures': ['fx.empty.structures', 'fx.empty.structuresBody'],
    'fee-concession-types': ['fx.empty.types', 'fx.empty.typesBody'],
    'fee-instalment-plans': ['fx.empty.plans', 'fx.empty.plansBody'],
    'fee-govt-scholarships': ['fx.empty.govt', 'fx.empty.govtBody'],
    'fee-challans': ['fx.empty.challans', 'fx.empty.challansBody'],
    'acct-funds': ['fx.empty.funds', 'fx.empty.fundsBody'],
    'acct-budgets': ['fx.empty.budgets', 'fx.empty.budgetsBody'],
  };
  const [emptyTitle, emptyBody] = empties[e] ?? ['fd.empty', 'fx.empty.generic'];

  return (
    <>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        label={label}
        columns={columns}
        rowHref={(row) => href(row as R)}
        extraRowActions={rowActions}
        extraBulkActions={bulk}
        toolbar={toolbar}
        extraParams={extraParams}
        empty={
          <EmptyState icon={<Inbox />} title={t(emptyTitle as MessageKey)} testId={`empty-${e}`}>
            {t(emptyBody as MessageKey)}
          </EmptyState>
        }
      />
      {dialog && <DeskDialog title={dialog.title} path={dialog.path} fields={dialog.fields} fixed={dialog.fixed} done={dialog.done} submit={dialog.submit} onClose={() => setDialog(null)} />}
      {report && <BulkReportDialog report={report.report} title={report.title} onClose={() => setReport(null)} />}
    </>
  );
}
