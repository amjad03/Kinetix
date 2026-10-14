'use client';

import { Inbox } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { bulkRecords } from '@/app/(dashboard)/records-actions';
import { BulkReportDialog } from '@/components/records/BulkReportDialog';
import { RecordsTable } from '@/components/records/RecordsTable';
import { tr } from '@/components/records/text';
import { Button } from '@/components/shadcn/button';
import { Dialog, EmptyState, StatusPill, TextInput, useToast, type Column, type RowAction, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { bulkTarget, type BulkReport, type ListState, type RecordMeta, type RecordsPage, type Row } from '@/lib/records';
import type { SelectionInfo } from '@/components/ui';

/** How a column shows its value. */
export type ColKind = 'text' | 'strong' | 'wrap' | 'date' | 'datetime' | 'money' | 'number' | 'choice' | 'bool' | 'list';

export interface ColSpec {
  /** The list row's key (the API's field or extra value). */
  key: string;
  header: MessageKey;
  kind?: ColKind;
  /** The API sort key (defaults to the key for kinds the API sorts). */
  sortKey?: string | false;
  hideBelow?: 'sm' | 'md' | 'lg';
  defaultHidden?: boolean;
  /** For choices: the pill colour of a value. */
  tone?: (value: string) => Tone;
  /** For a value whose words live under another field (a person's name under `ownerUserIdName`). */
  from?: string;
}

/** A module action that needs values (a date, a reason): asked for in a dialog, then run like the kit's own actions. */
export interface ParamAction {
  key: string;
  fields: { name: string; label: MessageKey; type?: 'date' | 'text' | 'textarea'; required?: boolean }[];
  tone?: 'danger';
  /** Offered only for rows this says yes to. */
  when?: (row: Row) => boolean;
}

/**
 * A register as a record kit list (docs/requirements/RECORD_DEPTH_KIT.md) from a short description of its columns:
 * add, view and edit, delete to the bin, bulk edit, import, export, history and saved views come from the kit; module
 * actions that need values open a small form first.
 */
export function KitList({
  meta,
  page,
  state,
  label,
  columns,
  empty,
  extraParams,
  paramActions = [],
  rowHref,
  toolbar,
  testId,
  rowActions,
}: {
  meta: RecordMeta;
  page: RecordsPage<Row>;
  state: ListState;
  label: MessageKey;
  columns: ColSpec[];
  empty: { icon?: ReactNode; title: MessageKey; body: MessageKey };
  extraParams?: Record<string, string>;
  paramActions?: ParamAction[];
  rowHref?: (row: Row) => string | undefined;
  toolbar?: ReactNode;
  testId?: string;
  /** Row actions of the page's own (open the timeline, compare with the last version). */
  rowActions?: (row: Row) => RowAction<Row>[];
}) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [ask, setAsk] = useState<{ action: ParamAction; ids: string[] | null; sel?: SelectionInfo } | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [report, setReport] = useState<{ report: BulkReport; title: string } | null>(null);
  const entity = meta.key;
  const withParams = new Set(paramActions.map((a) => a.key));
  // Actions that need values are offered through their own form, not the kit's plain confirm.
  const kitMeta = useMemo(() => ({ ...meta, actions: meta.actions.filter((a) => !withParams.has(a.key)) }), [meta]); // eslint-disable-line react-hooks/exhaustive-deps
  const allowed = paramActions.filter((a) => meta.actions.some((m) => m.key === a.key));
  const actionLabel = (key: string) => tr(t, `rk.action.${entity}.${key}`, meta.actions.find((a) => a.key === key)?.label ?? key);

  const cols = useMemo<Column<Row>[]>(
    () =>
      columns.map((c, i) => {
        const kind = c.kind ?? 'text';
        const v = (x: Row) => x[c.from ?? c.key];
        const cell = (x: Row): ReactNode => {
          const val = v(x);
          if (val === null || val === undefined || val === '') return <span className="text-muted-foreground">-</span>;
          switch (kind) {
            case 'strong':
              return <b className="font-[550]">{String(val)}</b>;
            case 'wrap':
              return <span className="block max-w-[420px] whitespace-normal">{String(val)}</span>;
            case 'date':
              return fmt.date(String(val), 'short');
            case 'datetime':
              return String(val);
            case 'money':
              return <span className="tabular-nums">{fmt.rupees(Math.round(Number(val) * 100))}</span>;
            case 'number':
              return <span className="tabular-nums">{fmt.number(Number(val))}</span>;
            case 'bool':
              return val ? t('common.yes') : t('common.no');
            case 'choice':
              return <StatusPill tone={c.tone?.(String(val)) ?? 'neutral'}>{tr(t, `rk.o.${entity}.${c.key}.${String(val)}`, String(val).replace(/_/g, ' '))}</StatusPill>;
            case 'list':
              return <span className="block max-w-[320px] whitespace-normal text-muted-foreground">{String(val)}</span>;
            default:
              return String(val);
          }
        };
        const sortable = c.sortKey !== false && kind !== 'list';
        return {
          id: c.key,
          header: t(c.header),
          cell,
          sortKey: sortable ? (c.sortKey || c.key) : undefined,
          align: kind === 'money' || kind === 'number' ? 'right' : undefined,
          hideBelow: c.hideBelow,
          defaultHidden: c.defaultHidden,
          rowHeader: i === 0,
          hideable: i !== 0,
          csv: (x: Row) => {
            const val = v(x);
            return val === null || val === undefined ? '' : typeof val === 'number' ? val : String(val);
          },
        } satisfies Column<Row>;
      }),
    [columns, entity, fmt, t],
  );

  const run = (a: ParamAction, target: ReturnType<typeof bulkTarget>) =>
    start(async () => {
      const params = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ''));
      const res = await bulkRecords(entity, { op: 'action', action: a.key, target, params });
      if (!res.ok) return toast.error(res.error);
      setAsk(null);
      setValues({});
      router.refresh();
      if (res.data.failed) setReport({ report: res.data, title: actionLabel(a.key) });
      else toast.success(t('reg.actionDone', { action: actionLabel(a.key), n: res.data.succeeded }));
    });

  const missing = ask ? ask.action.fields.some((f) => f.required && !values[f.name]?.trim()) : false;

  return (
    <>
      <RecordsTable
        meta={kitMeta}
        page={page}
        state={state}
        label={t(label)}
        columns={cols}
        extraParams={extraParams}
        rowHref={rowHref}
        toolbar={toolbar}
        testId={testId}
        extraRowActions={(x) => [...(rowActions?.(x) ?? []), ...allowed.filter((a) => !a.when || a.when(x)).map((a) => ({ id: `p-${a.key}`, label: actionLabel(a.key), tone: a.tone, onSelect: () => setAsk({ action: a, ids: [x.id as string] }) }))]}
        extraBulkActions={allowed.map((a) => ({ id: `p-${a.key}`, label: actionLabel(a.key), tone: a.tone, onClick: (_rows, sel) => setAsk({ action: a, ids: null, sel }) }))}
        empty={
          <EmptyState icon={empty.icon ?? <Inbox />} title={t(empty.title)} testId={`${entity}-empty`}>
            {t(empty.body)}
          </EmptyState>
        }
      />
      {ask && (
        <Dialog
          title={actionLabel(ask.action.key)}
          busy={busy}
          onClose={() => {
            setAsk(null);
            setValues({});
          }}
          actions={
            <>
              <Button variant="outline" onClick={() => setAsk(null)} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button variant={ask.action.tone === 'danger' ? 'destructive' : 'default'} disabled={busy || missing} onClick={() => run(ask.action, ask.ids ? { ids: ask.ids } : bulkTarget(ask.sel!.target, state))} data-testid="reg-action-run">
                {actionLabel(ask.action.key)}
              </Button>
            </>
          }
        >
          <div className="grid gap-4">
            {ask.action.fields.map((f) => (
              <TextInput
                key={f.name}
                label={t(f.label)}
                type={f.type === 'date' ? 'date' : 'text'}
                multiline={f.type === 'textarea'}
                minRows={f.type === 'textarea' ? 3 : undefined}
                required={f.required}
                value={values[f.name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                slotProps={f.type === 'date' ? { inputLabel: { shrink: true } } : undefined}
                fullWidth
              />
            ))}
          </div>
        </Dialog>
      )}
      {report && <BulkReportDialog report={report.report} title={report.title} onClose={() => setReport(null)} />}
    </>
  );
}
