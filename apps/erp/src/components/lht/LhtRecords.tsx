'use client';

import { BookOpen, Bus, BedDouble, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { bulkRecords } from '@/app/(dashboard)/records-actions';
import { RecordsTable } from '@/components/records/RecordsTable';
import { optionText, tr } from '@/components/records/text';
import { Button } from '@/components/shadcn/button';
import { Dialog, EmptyState, FormGrid, SelectInput, Sheet, StatusPill, SwitchField, TextInput, useToast, type BulkAction, type Column, type RowAction, type SelectionInfo } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { humanize } from '@/lib/campus-ops';
import { PARAM_ACTIONS, paramBody, RAW_NUMBERS, REORDER_SCOPE, sortKeyFor, toneOf, VALUE_FROM, type LhtModule, type OptionSource, type ParamField } from '@/lib/lht';
import { bulkTarget, type FieldOption, type ListState, type RecordMeta, type RecordsPage, type Row } from '@/lib/records';

const ICONS: Record<LhtModule, ReactNode> = { library: <BookOpen />, hostel: <BedDouble />, transport: <Bus /> };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STAMP = /^\d{4}-\d{2}-\d{2}T/;

type Pending = { action: RecordMeta['actions'][number]; fields: ParamField[]; ids?: string[]; sel?: SelectionInfo; label: string };

/**
 * A library, hostel or transport list with the whole record kit (RecordsTable), its columns taken from the API's
 * export columns and worded in the person's language; actions that need inputs (a reason, an amount, a bed) ask
 * for them in a dialog, for one row or the selection.
 */
export function LhtRecords({ module, meta, page, state, view, sources }: { module: LhtModule; meta: RecordMeta; page: RecordsPage<Row>; state: ListState; view: string; sources: Partial<Record<OptionSource, FieldOption[]>> }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [pending, setPending] = useState<Pending | null>(null);
  const [viewing, setViewing] = useState<Row | null>(null);
  const entity = meta.key;
  const paramActions = PARAM_ACTIONS[entity] ?? {};
  const label = tr(t, `rk.entity.${entity}`, entity);
  const header = (key: string, fallback: string) => tr(t, `lht.c.${entity}.${key}`, fallback);

  // The words for a column's fixed values: from the list's filter or form field of that name.
  const wordsFor = useMemo(() => {
    const out = new Map<string, (v: string) => string>();
    for (const c of meta.columns) {
      const key = VALUE_FROM[c.key] ?? c.key;
      const filter = meta.filters.find((f) => f.key === key && f.options?.length);
      const field = meta.fields.find((f) => f.key === key && f.type === 'select' && f.options?.length);
      const opts = filter?.options ?? field?.options;
      if (!opts) continue;
      out.set(c.key, (v: string) => {
        const o = opts.find((x) => x.value === v);
        return o ? optionText(t, entity, key, o) : tr(t, `lht.v.${v}`, humanize(v));
      });
    }
    return out;
  }, [meta, t, entity]);

  const show = (key: string, value: unknown): ReactNode => {
    if (value === null || value === undefined || value === '') return <span className="text-muted-foreground">—</span>;
    if (typeof value === 'boolean') return value ? t('lht.yes') : t('lht.no');
    const words = wordsFor.get(key);
    if (typeof value === 'string' && words) return key === 'status' || key.endsWith('Status') ? <StatusPill tone={toneOf(value)}>{words(value)}</StatusPill> : words(value);
    if (key === 'status' && typeof value === 'string') return <StatusPill tone={toneOf(value)}>{tr(t, `lht.v.${value}`, humanize(value))}</StatusPill>;
    if (key.endsWith('Rupees') && typeof value === 'number') return fmt.rupees(Math.round(value * 100));
    if (typeof value === 'number') return RAW_NUMBERS.has(key) ? String(value) : fmt.number(value);
    if (typeof value === 'string' && DATE.test(value)) return fmt.date(value, 'day');
    if (typeof value === 'string' && STAMP.test(value)) return fmt.dateTime(value);
    if (key === 'url' && typeof value === 'string' && /^https?:\/\//.test(value))
      return (
        <a href={value} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
          {t('lht.open')}
        </a>
      );
    return String(value);
  };

  const columns: Column<Row>[] = meta.columns.map((c, i) => ({
    id: c.key,
    header: header(c.key, c.header),
    sortKey: sortKeyFor(c.key, meta.sorts),
    rowHeader: i === 0,
    hideable: i !== 0,
    defaultHidden: i >= 7,
    hideBelow: i >= 3 ? 'sm' : undefined,
    align: typeof page.rows.find((r) => r[c.key] !== null && r[c.key] !== undefined)?.[c.key] === 'number' && !RAW_NUMBERS.has(c.key) ? 'right' : undefined,
    cell: (r) => show(c.key, r[c.key]),
    csv: (r) => {
      const v = r[c.key];
      return v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? t('lht.yes') : t('lht.no')) : (wordsFor.get(c.key)?.(String(v)) ?? (v as string | number));
    },
  }));

  const actionLabel = (a: RecordMeta['actions'][number]) => tr(t, `rk.action.${entity}.${a.key}`, a.label);

  const runAction = (p: Pending, params?: Record<string, unknown>) =>
    new Promise<string | null>((resolve) =>
      start(async () => {
        const target = p.ids ? { ids: p.ids } : bulkTarget(p.sel!.target, state);
        const res = await bulkRecords(entity, { op: 'action', action: p.action.key, target, ...(params && { params }) });
        if (!res.ok) return resolve(res.error);
        const failed = res.data.rows.filter((r) => !r.ok);
        if (failed.length && !res.data.succeeded) return resolve(failed[0].message ?? t('error.generic'));
        setPending(null);
        router.refresh();
        if (failed.length) toast.error(t('lht.partly', { ok: res.data.succeeded, failed: failed.length, why: failed[0].message ?? '' }));
        else toast.success(res.data.rows.length === 1 && res.data.rows[0].message ? t('lht.doneWith', { what: res.data.rows[0].message }) : t('lht.done', { n: res.data.succeeded }));
        resolve(null);
      }),
    );

  // Actions with inputs leave the kit's plain confirm and ask for their inputs here.
  const plainMeta: RecordMeta = { ...meta, actions: meta.actions.filter((a) => !paramActions[a.key]) };
  const bulkExtra: BulkAction<Row>[] = meta.actions
    .filter((a) => paramActions[a.key])
    .map((a) => ({ id: `lht-${a.key}`, label: actionLabel(a), tone: a.tone ?? undefined, onClick: (_rows: Row[], sel: SelectionInfo) => setPending({ action: a, fields: paramActions[a.key], sel, label: actionLabel(a) }) }));

  const rowExtra = (row: Row): RowAction<Row>[] =>
    meta.actions.map((a) => ({
      id: `lht-row-${a.key}`,
      label: actionLabel(a),
      icon: <Zap />,
      tone: a.tone ?? undefined,
      onSelect: () => {
        const fields = paramActions[a.key];
        if (fields || a.tone === 'danger') setPending({ action: a, fields: fields ?? [], ids: [row.id], label: actionLabel(a) });
        else void runAction({ action: a, fields: [], ids: [row.id], label: actionLabel(a) }).then((e) => e && toast.error(e));
      },
    }));

  return (
    <>
      <RecordsTable
        meta={plainMeta}
        page={page}
        state={state}
        label={label}
        columns={columns}
        onView={(r) => setViewing(r)}
        extraRowActions={meta.can.write ? rowExtra : undefined}
        extraBulkActions={meta.can.write ? bulkExtra : undefined}
        reorderScope={REORDER_SCOPE[entity] ?? []}
        extraParams={{ view }}
        testId={`lht-${entity}`}
        empty={
          <EmptyState icon={ICONS[module]} title={t('lht.empty.title', { name: label })} testId={`lht-empty-${entity}`}>
            {t(meta.can.create ? 'lht.empty.add' : 'lht.empty.none')}
          </EmptyState>
        }
      />
      {pending && <ParamDialog pending={pending} entity={entity} sources={sources} busy={busy} count={pending.ids?.length ?? pending.sel?.count ?? 0} onClose={() => setPending(null)} onRun={(params) => runAction(pending, params)} />}
      <Sheet open={!!viewing} title={viewing?._label ?? label} subtitle={tr(t, `rk.one.${entity}`, label)} onClose={() => setViewing(null)} width={520}>
        {viewing && (
          <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,160px)_1fr]" data-testid="lht-detail">
            {meta.columns.map((c) => (
              <div key={c.key} className="contents">
                <dt className="text-[13px] text-muted-foreground">{header(c.key, c.header)}</dt>
                <dd className="m-0 text-sm break-words">{show(c.key, viewing[c.key])}</dd>
              </div>
            ))}
          </dl>
        )}
      </Sheet>
    </>
  );
}

/** Asks for an action's inputs, then runs it on the row or the selection. */
function ParamDialog({ pending, entity, sources, busy, count, onClose, onRun }: { pending: Pending; entity: string; sources: Partial<Record<OptionSource, FieldOption[]>>; busy: boolean; count: number; onClose: () => void; onRun: (params: Record<string, unknown>) => Promise<string | null> }) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(pending.fields.map((f) => [f.name, f.initial ?? ''])));
  const [error, setError] = useState('');
  const set = (k: string, v: string) => setValues((x) => ({ ...x, [k]: v }));
  const fieldLabel = (f: ParamField) => `${tr(t, `lht.p.${entity}.${f.name}`, tr(t, `lht.p.${f.name}`, humanize(f.name)))}${f.required ? ' *' : ''}`;
  const submit = async () => {
    const body = paramBody(pending.fields, values);
    if ('missing' in body) return setError(t('lht.fill', { field: fieldLabel(pending.fields.find((f) => f.name === body.missing)!).replace(' *', '') }));
    setError('');
    const e = await onRun(body.params);
    if (e) setError(e);
  };
  return (
    <Dialog
      title={t('rk.action.title', { action: pending.label, n: count })}
      onClose={onClose}
      busy={busy}
      size="sm"
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant={pending.action.tone === 'danger' ? 'destructive' : 'default'} onClick={() => void submit()} disabled={busy} data-testid="lht-param-run">
            {pending.label}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pt-1">
        {!pending.fields.length && <p className="m-0 text-sm">{t('rk.action.body')}</p>}
        <FormGrid cols={1}>
          {pending.fields.map((f) => {
            const common = { label: fieldLabel(f), value: values[f.name] ?? '', onChange: (e: { target: { value: string } }) => set(f.name, e.target.value), fullWidth: true };
            if (f.type === 'bool') return <SwitchField key={f.name} label={fieldLabel(f)} checked={(values[f.name] ?? '') === 'true'} onChange={(c) => set(f.name, c ? 'true' : 'false')} />;
            if (f.type === 'select') {
              const opts = f.source ? (sources[f.source] ?? []).map((o) => ({ value: o.value, label: o.group && !o.label.includes(o.group) ? `${o.group} · ${o.label}` : o.label })) : (f.values ?? []).map((v) => ({ value: v, label: tr(t, `lht.pv.${f.name}.${v}`, humanize(v)) }));
              return <SelectInput key={f.name} {...common} options={opts} empty={f.required ? undefined : t('lht.none')} />;
            }
            if (f.type === 'date') return <TextInput key={f.name} {...common} type="date" slotProps={{ inputLabel: { shrink: true } }} />;
            if (f.type === 'number') return <TextInput key={f.name} {...common} type="number" inputMode="decimal" />;
            return <TextInput key={f.name} {...common} multiline={f.type === 'textarea'} minRows={f.type === 'textarea' ? 2 : undefined} />;
          })}
        </FormGrid>
        {error && (
          <p role="alert" className="m-0 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

