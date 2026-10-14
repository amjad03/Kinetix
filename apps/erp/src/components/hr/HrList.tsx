'use client';

import { CheckCheck, FileDown, FileUp, Inbox, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type ReactNode } from 'react';
import { uploadLeaveDocument, uploadResume, uploadStaffDocument } from '@/app/(dashboard)/hr/depth-actions';
import { uploadCertificate } from '@/app/(dashboard)/hr/staff-actions';
import { bulkRecords } from '@/app/(dashboard)/records-actions';
import { BulkReportDialog } from '@/components/records/BulkReportDialog';
import { RecordsTable } from '@/components/records/RecordsTable';
import { tr } from '@/components/records/text';
import { Button } from '@/components/shadcn/button';
import { Dialog, EmptyState, FormField, SelectInput, StatusPill, TextInput, useToast, type BulkAction, type Column, type RowAction, type SelectionInfo, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { bulkTarget, type BulkReport, type ListState, type RecordMeta, type RecordsPage, type Row } from '@/lib/records';
import { HR_LISTS, type ColSpec, type HrEntity, type ListConfig, type ParamAction, type QuickAction } from './hr-lists';

/** A kit list of the HR and payroll area: its meta and the page of rows the URL asks for. */
export interface HrListData {
  meta: RecordMeta;
  page: RecordsPage<Row>;
  state: ListState;
}

export type Choices = Record<string, { value: string; label: string }[]>;

/**
 * The actions of a kit list that the kit's own confirm cannot run: quick actions on a row (approve, reject) and
 * actions that need answers first (a reason, a date, a percentage). Returns the meta without those, row and bulk
 * actions for `RecordsTable`, and the dialogs to render.
 */
export function useKitActions(entity: string, meta: RecordMeta, state: ListState, spec: { quick?: QuickAction[]; params?: ParamAction[] }, choices: Choices = {}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [asking, setAsking] = useState<{ action: ParamAction; target: Record<string, unknown>; count: number } | null>(null);
  const [report, setReport] = useState<{ report: BulkReport; title: string } | null>(null);
  const [busy, start] = useTransition();
  const allowed = new Set(meta.actions.map((a) => a.key));
  const actionLabel = (key: string) => tr(t, `rk.action.${entity}.${key}`, meta.actions.find((a) => a.key === key)?.label ?? key);
  const paramKeys = new Set((spec.params ?? []).map((p) => p.key));
  const shownMeta: RecordMeta = { ...meta, actions: meta.actions.filter((a) => !paramKeys.has(a.key)) };

  const run = (key: string, target: Record<string, unknown>, params?: Record<string, unknown>) =>
    new Promise<boolean>((resolve) =>
      start(async () => {
        const res = await bulkRecords(entity, { op: 'action', action: key, target, ...(params ? { params } : {}) });
        if (!res.ok) {
          toast.error(res.error);
          return resolve(false);
        }
        if (res.data.failed > 0 || res.data.total > 1) setReport({ report: res.data, title: actionLabel(key) });
        else toast.success(res.data.rows[0]?.message ? `${actionLabel(key)}: ${res.data.rows[0].message}` : t('hk.done'));
        router.refresh();
        resolve(true);
      }),
    );

  const rowActions = (r: Row): RowAction<Row>[] => {
    const out: RowAction<Row>[] = [];
    for (const q of spec.quick ?? []) if (allowed.has(q.key) && q.when(r)) out.push({ id: `q-${q.key}`, label: actionLabel(q.key), tone: q.tone, onSelect: () => void run(q.key, { ids: [r.id] }) });
    for (const p of spec.params ?? []) if (allowed.has(p.key) && (p.when?.(r) ?? true)) out.push({ id: `p-${p.key}`, label: actionLabel(p.key), tone: p.tone, onSelect: () => setAsking({ action: p, target: { ids: [r.id] }, count: 1 }) });
    return out;
  };
  const bulkActions: BulkAction<Row>[] = (spec.params ?? [])
    .filter((p) => allowed.has(p.key) && p.bulk !== false)
    .map((p) => ({ id: `p-${p.key}`, label: actionLabel(p.key), tone: p.tone, onClick: (_rows: Row[], sel: SelectionInfo) => setAsking({ action: p, target: bulkTarget(sel.target, state), count: sel.count }) }));
  const dialogs = (
    <>
      {asking && <ParamDialog action={asking.action} choices={choices} count={asking.count} title={actionLabel(asking.action.key)} busy={busy} onClose={() => setAsking(null)} onRun={(params) => void run(asking.action.key, asking.target, params).then((ok) => ok && setAsking(null))} />}
      {report && <BulkReportDialog report={report.report} title={report.title} onClose={() => setReport(null)} />}
    </>
  );
  return { shownMeta, rowActions, bulkActions, dialogs };
}

/**
 * One HR or payroll list on the record depth kit (`RecordsTable`), described in `hr-lists.tsx`: its columns in the
 * person's language, the record's page, quick actions on a row, actions that need answers, and file links.
 */
export function HrList({ entity, data, extraParams, toolbar, label, choices, createDefaults }: { entity: HrEntity; data: HrListData; extraParams?: Record<string, string>; toolbar?: ReactNode; label?: string; choices?: Choices; createDefaults?: Record<string, string> }) {
  const { t, fmt } = useI18n();
  const cfg: ListConfig = HR_LISTS[entity];
  const { meta, page, state } = data;
  const kit = useKitActions(entity, meta, state, cfg, choices);
  const toast = useToast();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const sendFile = (file: File) =>
    startUpload(async () => {
      if (!uploadFor || !cfg.upload) return;
      const form = new FormData();
      form.set('file', file);
      const fn = cfg.upload.kind === 'resume' ? uploadResume : cfg.upload.kind === 'leave-doc' ? uploadLeaveDocument : cfg.upload.kind === 'training-cert' ? uploadCertificate : uploadStaffDocument;
      const res = await fn(uploadFor, form);
      if (fileInput.current) fileInput.current.value = '';
      setUploadFor(null);
      if (!res.ok) return toast.error(res.error);
      toast.success(t('hk.uploaded'));
      router.refresh();
    });

  const text = (c: ColSpec, v: unknown): string => {
    if (v === null || v === undefined || v === '') return '–';
    if (c.kind === 'date') return fmt.date(String(v).slice(0, 10), 'short');
    if (c.kind === 'datetime') return fmt.dateTime(String(v));
    if (c.kind === 'money') return fmt.rupees(Math.round(Number(v) * 100));
    if (c.kind === 'num') return fmt.number(Number(v));
    if (c.kind === 'yesno') return v ? t('hk.yes') : t('hk.no');
    if (c.kind === 'month') return fmt.month(`${String(v)}-01`);
    if (c.kind === 'option' || c.kind === 'status') return tr(t, `rk.o.${entity}.${c.option ?? c.key}.${String(v)}`, String(v));
    return String(v);
  };

  const columns: Column<Row>[] = cfg.cols.map((c, i) => ({
    id: c.key,
    header: t(c.label),
    sortKey: c.sort,
    align: c.kind === 'money' || c.kind === 'num' ? 'right' : undefined,
    hideBelow: c.hideBelow,
    defaultHidden: c.hidden,
    rowHeader: i === 0,
    hideable: i === 0 ? false : undefined,
    csv: (r) => text(c, r[c.key]),
    cell: (r) => {
      const v = r[c.key];
      if (c.kind === 'status') return v ? <StatusPill tone={(c.tones?.[String(v)] as Tone) ?? 'neutral'}>{text(c, v)}</StatusPill> : '–';
      if (c.kind === 'yesno' && c.tick) return v ? <CheckCheck aria-label={t('hk.yes')} className="size-4 text-emerald-600" /> : <span className="text-muted-foreground">–</span>;
      const shown = text(c, v);
      const sub = c.sub ? r[c.sub] : null;
      const href = i === 0 ? cfg.rowHref?.(r) : undefined;
      const main = href ? (
        <Link className="font-medium text-primary underline-offset-4 hover:underline" href={href} onClick={(e) => e.stopPropagation()}>
          {shown}
        </Link>
      ) : (
        <span className={c.wrap ? 'line-clamp-2 max-w-[32ch] whitespace-normal' : i === 0 ? 'font-medium' : undefined}>{shown}</span>
      );
      return sub ? (
        <span className="grid">
          {main}
          <span className="text-xs text-muted-foreground">{String(sub)}</span>
        </span>
      ) : (
        main
      );
    },
  }));

  const rowActions = (r: Row): RowAction<Row>[] => [
    ...kit.rowActions(r),
    ...(cfg.links?.(r) ?? []).map((l) => ({ id: `l-${l.label}`, label: t(l.label), icon: <FileDown />, onSelect: () => window.open(l.href, '_blank', 'noopener') })),
    ...(cfg.upload && meta.can.write && (cfg.upload.when?.(r) ?? true)
      ? [
          {
            id: 'upload',
            label: t(cfg.upload.label),
            icon: <FileUp />,
            disabled: uploading,
            onSelect: () => {
              setUploadFor(r.id);
              fileInput.current?.click();
            },
          },
        ]
      : []),
  ];

  const Icon: LucideIcon = cfg.empty.icon ?? Inbox;
  return (
    <>
      <RecordsTable
        meta={kit.shownMeta}
        page={page}
        state={state}
        label={label ?? t(cfg.label)}
        columns={columns}
        rowHref={cfg.rowHref}
        extraRowActions={rowActions}
        extraBulkActions={kit.bulkActions}
        extraParams={extraParams}
        createDefaults={createDefaults}
        toolbar={toolbar}
        testId={`hr-${entity}`}
        emptyActions
        empty={
          <EmptyState icon={<Icon />} title={t(cfg.empty.title)}>
            {cfg.empty.body ? t(cfg.empty.body) : undefined}
          </EmptyState>
        }
      />
      {kit.dialogs}
      {cfg.upload && <input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png" hidden aria-hidden onChange={(e) => e.target.files?.[0] && sendFile(e.target.files[0])} />}
    </>
  );
}

/** Asks what a module action needs (a reason, a date, a percentage) before it runs. */
function ParamDialog({ action, choices, count, title, busy, onClose, onRun }: { action: ParamAction; choices: Choices; count: number; title: string; busy: boolean; onClose: () => void; onRun: (params: Record<string, unknown>) => void }) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(action.fields.map((f) => [f.name, f.initial ?? ''])));
  const missing = action.fields.some((f) => f.required && !values[f.name]?.trim()) || (action.oneOf ? action.oneOf.filter((n) => values[n]?.trim()).length !== 1 : false);
  const submit = () => {
    const params: Record<string, unknown> = {};
    for (const f of action.fields) {
      const v = values[f.name]?.trim() ?? '';
      if (v === '') continue;
      params[f.name] = f.type === 'number' ? Number(v) : v;
    }
    onRun(params);
  };
  return (
    <Dialog
      title={count > 1 ? `${title} (${count})` : title}
      onClose={onClose}
      busy={busy}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant={action.tone === 'danger' ? 'destructive' : 'default'} onClick={submit} disabled={busy || missing} data-testid="param-run">
            {title}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!missing && !busy) submit();
        }}
      >
        {action.help && <p className="m-0 text-[13px] text-muted-foreground">{t(action.help)}</p>}
        {action.fields.map((f) => (
          <FormField key={f.name} label={t(`hk.param.${f.name}` as MessageKey)} required={f.required} helper={f.help ? t(f.help) : undefined}>
            {f.type === 'select' ? (
              <SelectInput value={values[f.name] ?? ''} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} options={f.choices ? (choices[f.choices] ?? []) : (f.options ?? []).map((o) => ({ value: o.value, label: t(o.label) }))} empty={f.required ? undefined : '–'} />
            ) : (
              <TextInput
                type={f.type === 'textarea' || f.type === 'text' ? undefined : f.type}
                multiline={f.type === 'textarea'}
                minRows={f.type === 'textarea' ? 2 : undefined}
                value={values[f.name] ?? ''}
                onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                slotProps={f.type === 'number' ? { htmlInput: { inputMode: 'decimal', step: 'any' } } : undefined}
              />
            )}
          </FormField>
        ))}
      </form>
    </Dialog>
  );
}
