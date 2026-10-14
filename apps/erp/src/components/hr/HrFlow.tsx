'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { addServiceEntry, decideHr, raiseRequisition, type DecisionKind } from '@/app/(dashboard)/hr/flow-actions';
import { useNotice } from '@/components/hr/Common';
import { Button } from '@/components/shadcn/button';
import { ApprovalPanel, type ActivityItem, type WorkflowStep } from '@/components/templates';
import { DataTable, Dialog, FormGrid, SelectInput, StatusPill, TextInput, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { formatDate } from '@/lib/dates';
import type { ServiceBookEntry } from '@/lib/hr-flow';

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
