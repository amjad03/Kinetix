'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { addServiceEntry, cancelLoan, decideHr, raiseRequisition, requestEncashment, requestLoan, type DecisionKind } from '@/app/(dashboard)/hr/flow-actions';
import { useNotice } from '@/components/hr/Common';
import { Button } from '@/components/shadcn/button';
import { ApprovalPanel, type ActivityItem, type WorkflowStep } from '@/components/templates';
import { DataTable, Dialog, FormGrid, SelectInput, StatusPill, TextInput, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { formatDate, formatMonth } from '@/lib/dates';
import type { LeaveEncashment, ServiceBookEntry, StaffLoan } from '@/lib/hr-flow';
import { formatRupees } from '@/lib/money';

export const LOAN_TONE: Record<string, Tone> = { pending: 'warning', approved: 'info', closed: 'success', rejected: 'danger', cancelled: 'neutral' };

/** An approval panel wired to the HR decision actions; it refreshes the page once a decision is saved. */
export function HrApproval({ kind, id, steps, canDecide, history, title }: { kind: DecisionKind; id: string; steps: WorkflowStep[]; canDecide: boolean; history?: ActivityItem[]; title?: string }) {
  const router = useRouter();
  return (
    <ApprovalPanel
      title={title}
      steps={steps}
      canDecide={canDecide}
      history={history}
      onDecide={async (d, c) => {
        const r = await decideHr(kind, id, d, c);
        return r.ok ? undefined : r.error;
      }}
      onDecided={() => router.refresh()}
    />
  );
}

const ENTRY_KINDS = ['appointment', 'confirmation', 'promotion', 'increment', 'transfer', 'award', 'penalty', 'deputation', 'remark'] as const;

/** The service book: the derived history plus manual orders HR adds. */
export function ServiceBook({ userId, entries, canAdd }: { userId: string; entries: ServiceBookEntry[]; canAdd: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { run, view } = useNotice();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [f, setF] = useState({ kind: 'remark', onDate: '', title: '', details: '', orderNo: '' });
  const kindLabel = (k: string) => t(`hf.sb.kind.${k}` as MessageKey);
  const save = () =>
    start(async () => {
      const r = await run(() => addServiceEntry(userId, f), t('hl.saved'));
      if (r.ok) {
        setOpen(false);
        setF({ kind: 'remark', onDate: '', title: '', details: '', orderNo: '' });
        router.refresh();
      }
    });
  return (
    <div className="space-y-4">
      {view}
      {canAdd && (
        <div className="flex justify-end">
          <Button onClick={() => setOpen(true)}>{t('hf.sb.add')}</Button>
        </div>
      )}
      <DataTable
        testId="service-book"
        label={t('hf.sb.title')}
        rows={entries}
        rowId={(e) => `${e.source}-${e.id}`}
        exportName="service-book"
        empty={t('hf.sb.empty')}
        columns={[
          { id: 'd', header: t('hl.date'), sort: (e) => e.onDate, cell: (e) => formatDate(e.onDate, 'long', locale) },
          { id: 'k', header: t('hf.sb.kind'), sort: (e) => kindLabel(e.kind), cell: (e) => <StatusPill tone={e.source === 'manual' ? 'info' : 'neutral'}>{kindLabel(e.kind)}</StatusPill> },
          { id: 't', header: t('hf.sb.entry'), rowHeader: true, sort: (e) => e.title, cell: (e) => (<><p className="font-medium">{e.title}</p>{e.details && <p className="text-xs text-muted-foreground">{e.details}</p>}</>) },
          { id: 'o', header: t('hf.sb.orderNo'), sort: (e) => e.orderNo ?? '', cell: (e) => e.orderNo ?? '–' },
        ]}
      />
      {open && (
        <Dialog title={t('hf.sb.add')} onClose={() => setOpen(false)} busy={pending} actions={<><Button variant="outline" onClick={() => setOpen(false)}>{t('hl.cancel')}</Button><Button disabled={pending} onClick={save}>{t('hl.save')}</Button></>}>
          <FormGrid>
            <SelectInput label={t('hf.sb.kind')} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={ENTRY_KINDS.map((k) => ({ value: k, label: kindLabel(k) }))} />
            <TextInput label={t('hl.date')} type="date" value={f.onDate} onChange={(e) => setF({ ...f, onDate: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextInput label={t('hf.sb.entry')} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <TextInput label={t('hf.sb.orderNo')} value={f.orderNo} onChange={(e) => setF({ ...f, orderNo: e.target.value })} />
          </FormGrid>
          <div className="mt-4">
            <TextInput fullWidth multiline minRows={2} label={t('hf.sb.details')} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} />
          </div>
        </Dialog>
      )}
    </div>
  );
}

/** Loans and advances, leave encashment: the lists and the request forms. */
export function LoansDesk({ loans, encashments, leaveTypes, staff, canRaiseForOthers, meId }: { loans: StaffLoan[]; encashments: LeaveEncashment[]; leaveTypes: { id: string; name: string }[]; staff: { userId: string; fullName: string }[]; canRaiseForOthers: boolean; meId: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { run, view } = useNotice();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<'loan' | 'encash' | null>(null);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [lf, setLf] = useState({ userId: meId, kind: 'advance' as 'advance' | 'loan', amount: '', installments: '3', startMonth: thisMonth, purpose: '' });
  const [ef, setEf] = useState({ userId: meId, leaveTypeId: leaveTypes[0]?.id ?? '', days: '', payMonth: thisMonth });
  const who = canRaiseForOthers ? staff.map((s) => ({ value: s.userId, label: s.fullName })) : [];
  const submit = () =>
    start(async () => {
      const r =
        dialog === 'loan'
          ? await run(() => requestLoan({ userId: lf.userId === meId ? undefined : lf.userId, kind: lf.kind, amountPaise: Math.round(Number(lf.amount) * 100), installments: Number(lf.installments), startMonth: lf.startMonth, purpose: lf.purpose }), t('hf.loan.requested'))
          : await run(() => requestEncashment({ userId: ef.userId === meId ? undefined : ef.userId, leaveTypeId: ef.leaveTypeId, days: Number(ef.days), payMonth: ef.payMonth }), t('hf.loan.requested'));
      if (r.ok) {
        setDialog(null);
        router.refresh();
      }
    });
  const withdraw = (id: string) =>
    start(async () => {
      if ((await run(() => cancelLoan(id), t('hl.saved'))).ok) router.refresh();
    });
  return (
    <div className="space-y-8">
      {view}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => setDialog('encash')} disabled={leaveTypes.length === 0}>{t('hf.encash.new')}</Button>
        <Button onClick={() => setDialog('loan')}>{t('hf.loan.new')}</Button>
      </div>
      <DataTable
        testId="loans"
        label={t('hf.loan.title')}
        rows={loans}
        rowId={(l) => l.id}
        rowHref={(l) => `/payroll/loans/${l.id}`}
        exportName="loans"
        empty={t('hf.loan.empty')}
        columns={[
          { id: 'n', header: t('hf.loan.no'), rowHeader: true, sort: (l) => l.loanNo, cell: (l) => l.loanNo },
          { id: 'u', header: t('hl.staff'), sort: (l) => l.user.fullName, cell: (l) => l.user.fullName },
          { id: 'k', header: t('hf.loan.kind'), sort: (l) => l.kind, cell: (l) => t(`hf.loan.kind.${l.kind}` as MessageKey) },
          { id: 'a', header: t('hf.amount'), align: 'right', sort: (l) => l.amountPaise, cell: (l) => formatRupees(l.amountPaise) },
          { id: 'e', header: t('hf.loan.emi'), align: 'right', sort: (l) => l.emiPaise, cell: (l) => `${formatRupees(l.emiPaise)} × ${l.installments}` },
          { id: 'o', header: t('hf.loan.outstanding'), align: 'right', sort: (l) => l.outstandingPaise, cell: (l) => formatRupees(l.outstandingPaise) },
          { id: 's', header: t('hr.f.status'), sort: (l) => l.status, cell: (l) => <StatusPill tone={LOAN_TONE[l.status]}>{t(`hf.status.${l.status}` as MessageKey)}</StatusPill> },
          { id: 'x', header: '', align: 'right', csv: false, cell: (l) => (l.status === 'pending' && l.user.id === meId ? <Button size="sm" variant="ghost" disabled={pending} onClick={(e) => { e.stopPropagation(); withdraw(l.id); }}>{t('hf.withdraw')}</Button> : null) },
        ]}
      />
      <DataTable
        testId="encashments"
        label={t('hf.encash.title')}
        rows={encashments}
        rowId={(e) => e.id}
        exportName="leave-encashments"
        empty={t('hf.encash.empty')}
        columns={[
          { id: 'u', header: t('hl.staff'), rowHeader: true, sort: (e) => e.user.fullName, cell: (e) => e.user.fullName },
          { id: 'l', header: t('hr.leave.type'), sort: (e) => e.leaveType.name, cell: (e) => e.leaveType.name },
          { id: 'd', header: t('hr.leave.days'), align: 'right', sort: (e) => e.days, cell: (e) => e.days },
          { id: 'a', header: t('hf.amount'), align: 'right', sort: (e) => e.amountPaise, cell: (e) => formatRupees(e.amountPaise) },
          { id: 'm', header: t('pay.month'), sort: (e) => e.payMonth, cell: (e) => formatMonth(`${e.payMonth}-01`, locale) },
          { id: 's', header: t('hr.f.status'), sort: (e) => e.status, cell: (e) => <StatusPill tone={LOAN_TONE[e.status]}>{t(`hf.status.${e.status}` as MessageKey)}</StatusPill> },
          { id: 'x', header: '', align: 'right', csv: false, cell: (e) => (e.status === 'pending' ? <EncashDecision id={e.id} /> : null) },
        ]}
      />
      {dialog && (
        <Dialog title={t(dialog === 'loan' ? 'hf.loan.new' : 'hf.encash.new')} onClose={() => setDialog(null)} busy={pending} actions={<><Button variant="outline" onClick={() => setDialog(null)}>{t('hl.cancel')}</Button><Button disabled={pending} onClick={submit}>{t('hf.submit')}</Button></>}>
          <FormGrid>
            {who.length > 0 && <SelectInput label={t('hl.staff')} value={dialog === 'loan' ? lf.userId : ef.userId} onChange={(e) => (dialog === 'loan' ? setLf({ ...lf, userId: e.target.value }) : setEf({ ...ef, userId: e.target.value }))} options={who} />}
            {dialog === 'loan' ? (
              <>
                <SelectInput label={t('hf.loan.kind')} value={lf.kind} onChange={(e) => setLf({ ...lf, kind: e.target.value as 'advance' })} options={(['advance', 'loan'] as const).map((k) => ({ value: k, label: t(`hf.loan.kind.${k}`) }))} />
                <TextInput label={t('hf.amountRupees')} inputMode="decimal" value={lf.amount} onChange={(e) => setLf({ ...lf, amount: e.target.value })} />
                <TextInput label={t('hf.loan.installments')} type="number" value={lf.installments} onChange={(e) => setLf({ ...lf, installments: e.target.value })} />
                <TextInput label={t('hf.loan.start')} type="month" value={lf.startMonth} onChange={(e) => setLf({ ...lf, startMonth: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                <TextInput label={t('hf.loan.purpose')} value={lf.purpose} onChange={(e) => setLf({ ...lf, purpose: e.target.value })} />
              </>
            ) : (
              <>
                <SelectInput label={t('hr.leave.type')} value={ef.leaveTypeId} onChange={(e) => setEf({ ...ef, leaveTypeId: e.target.value })} options={leaveTypes.map((x) => ({ value: x.id, label: x.name }))} />
                <TextInput label={t('hr.leave.days')} inputMode="decimal" value={ef.days} onChange={(e) => setEf({ ...ef, days: e.target.value })} />
                <TextInput label={t('pay.month')} type="month" value={ef.payMonth} onChange={(e) => setEf({ ...ef, payMonth: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
              </>
            )}
          </FormGrid>
        </Dialog>
      )}
    </div>
  );
}

/** Approve or reject a pending encashment in place (rejecting needs a reason). */
function EncashDecision({ id }: { id: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const { run, view } = useNotice();
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const go = (d: 'approve' | 'reject') =>
    start(async () => {
      if ((await run(() => decideHr('encashment', id, d, note), t('hl.saved'))).ok) {
        setRejecting(false);
        router.refresh();
      }
    });
  return (
    <span className="inline-flex gap-2">
      {view}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setRejecting(true)}>{t('hr.leave.reject')}</Button>
      <Button size="sm" disabled={pending} onClick={() => go('approve')}>{t('hf.approve')}</Button>
      {rejecting && (
        <Dialog title={t('hr.leave.reject')} onClose={() => setRejecting(false)} busy={pending} actions={<><Button variant="outline" onClick={() => setRejecting(false)}>{t('hl.cancel')}</Button><Button variant="destructive" disabled={pending || !note.trim()} onClick={() => go('reject')}>{t('hr.leave.reject')}</Button></>}>
          <TextInput fullWidth multiline minRows={2} label={t('hf.reason')} value={note} onChange={(e) => setNote(e.target.value)} />
        </Dialog>
      )}
    </span>
  );
}

/** Raise a staff requisition (HoD or HR); the principal approves it into an open position. */
export function RequisitionButton({ departments }: { departments: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const { run, view } = useNotice();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [f, setF] = useState({ title: '', departmentId: '', positions: '1', justification: '', description: '' });
  const save = () =>
    start(async () => {
      const r = await run(() => raiseRequisition({ ...f, positions: Number(f.positions) || 1 }), t('hf.req.raised'));
      if (r.ok) {
        setOpen(false);
        router.push(`/hr/recruitment/${r.data.id}`);
      }
    });
  return (
    <>
      {view}
      <Button variant="outline" onClick={() => setOpen(true)}>{t('hf.req.new')}</Button>
      {open && (
        <Dialog title={t('hf.req.new')} size="md" onClose={() => setOpen(false)} busy={pending} actions={<><Button variant="outline" onClick={() => setOpen(false)}>{t('hl.cancel')}</Button><Button disabled={pending} onClick={save}>{t('hf.submit')}</Button></>}>
          <FormGrid>
            <TextInput label={t('hr.rec.title')} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <SelectInput label={t('hr.f.department')} value={f.departmentId} empty="–" onChange={(e) => setF({ ...f, departmentId: e.target.value })} options={departments.map((d) => ({ value: d.id, label: d.name }))} />
            <TextInput label={t('hr.rec.positions')} type="number" value={f.positions} onChange={(e) => setF({ ...f, positions: e.target.value })} />
          </FormGrid>
          <div className="mt-4 space-y-4">
            <TextInput fullWidth multiline minRows={2} label={t('hf.req.justification')} value={f.justification} onChange={(e) => setF({ ...f, justification: e.target.value })} />
            <TextInput fullWidth multiline minRows={3} label={t('hf.req.description')} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </div>
        </Dialog>
      )}
    </>
  );
}
