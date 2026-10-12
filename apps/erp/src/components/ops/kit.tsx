'use client';
import { usePathname } from 'next/navigation';
import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { DataTable, Dialog, EmptyState, FormField, StatusPill, TextInput, type Column, type TableFilter } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { rupeesToPaise } from '@/lib/money';
import type { Cell } from '@/lib/table';
import { UUID_RE } from '@/lib/ops';
import type { ActionResult } from '@/lib/types';

import { Alert, Button, CircularProgress, MenuItem, Snackbar, Tab, Tabs } from '@/components/kx';
export type FieldKind = 'text' | 'multiline' | 'number' | 'rupees' | 'date' | 'time' | 'datetime' | 'select' | 'uuid';
export interface Field {
  name: string;
  label: string;
  kind?: FieldKind;
  options?: { value: string; label: string }[];
  required?: boolean;
  init?: string;
}

/**
 * A small form in a dialog. Required, number, rupee, date and id fields are checked here;
 * rupees reach `onSubmit` as paise and date-times as ISO instants. The API checks the rest.
 */
export function FormDialog({ title, fields, submitLabel, onSubmit, onClose, intro }: { title: string; fields: Field[]; submitLabel?: string; intro?: ReactNode; onSubmit: (v: Record<string, string>) => Promise<ActionResult<unknown>>; onClose: (done?: string) => void }) {
  const { t } = useI18n();
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, f.init ?? ''])));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    const out: Record<string, string> = {};
    for (const f of fields) {
      const raw = (v[f.name] ?? '').trim();
      if (!raw) {
        if (f.required) return setError(t('ops.err.field', { field: f.label }));
        out[f.name] = '';
        continue;
      }
      const k = f.kind ?? 'text';
      if (k === 'uuid' && !UUID_RE.test(raw)) return setError(t('ops.err.field', { field: f.label }));
      if (k === 'number' && !/^\d+$/.test(raw)) return setError(t('ops.err.field', { field: f.label }));
      if (k === 'rupees') {
        const p = rupeesToPaise(raw);
        if (p === null) return setError(t('ops.err.field', { field: f.label }));
        out[f.name] = String(p);
        continue;
      }
      if (k === 'datetime') {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return setError(t('ops.err.field', { field: f.label }));
        out[f.name] = d.toISOString();
        continue;
      }
      out[f.name] = raw;
    }
    setError(null);
    start(async () => {
      const res = await onSubmit(out);
      if (res.ok) onClose(t('ops.saved'));
      else setError(res.error);
    });
  };

  return (
    <Dialog
      title={title}
      onClose={() => onClose()}
      busy={pending}
      actions={
        <>
          <Button onClick={() => onClose()} disabled={pending}>
            {t('ops.cancel')}
          </Button>
          <Button variant="contained" onClick={submit} disabled={pending} startIcon={pending ? <CircularProgress size={16} /> : undefined} data-testid="ops-submit">
            {submitLabel ?? t('ops.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pt-2">
        {intro}
        {fields.map((f) => {
          const k = f.kind ?? 'text';
          const type = k === 'date' ? 'date' : k === 'time' ? 'time' : k === 'datetime' ? 'datetime-local' : 'text';
          return (
            <FormField key={f.name} label={f.label} required={f.required}>
              <TextInput
                value={v[f.name] ?? ''}
                onChange={(e) => setV({ ...v, [f.name]: e.target.value })}
                select={k === 'select'}
                multiline={k === 'multiline'}
                minRows={k === 'multiline' ? 2 : undefined}
                type={type}
                slotProps={{ htmlInput: k === 'number' ? { inputMode: 'numeric' } : k === 'rupees' ? { inputMode: 'decimal' } : undefined, select: k === 'select' ? { displayEmpty: true, SelectDisplayProps: { 'aria-label': f.label } as never } : undefined }}
                fullWidth
                data-testid={`f-${f.name}`}
              >
                {(f.options ?? []).map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
          );
        })}
        {error && <Alert severity="error">{error}</Alert>}
      </div>
    </Dialog>
  );
}

/** A read-only dialog (a detail view). */
export function InfoDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Dialog title={title} size="md" onClose={onClose} actions={<Button onClick={onClose}>{t('ops.close')}</Button>}>
      {children}
    </Dialog>
  );
}

export interface Col<T> {
  label: string;
  cell: (row: T) => ReactNode;
  num?: boolean;
  /** The value to sort and search by; defaults to the cell itself when it is text or a number. */
  sort?: (row: T) => Cell;
}

/** A list in the shared DataTable (sortable columns, search and paging once it is long), or an empty state. */
export function Grid<T>({ cols, rows, empty, testId, tint, exportName, filters }: { cols: Col<T>[]; rows: T[]; empty: string; testId?: string; tint?: (row: T) => boolean; exportName?: string; filters?: TableFilter<T>[] }) {
  const ids = useMemo(() => new Map(rows.map((r, i) => [r, String(i)])), [rows]);
  if (rows.length === 0) return <div className="mb-6 last:mb-0"><EmptyState icon={<span>·</span>} title={empty} dense testId={testId ? `${testId}-empty` : undefined} /></div>;
  const columns: Column<T>[] = cols.map((c, i) => ({
    id: `c${i}`,
    header: c.label,
    align: c.num ? 'right' : 'left',
    cell: c.num ? (r) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{c.cell(r)}</span> : c.cell,
    ...(c.label
      ? {
          sort:
            c.sort ??
            ((r: T) => {
              const v = c.cell(r);
              return typeof v === 'string' || typeof v === 'number' ? v : null;
            }),
        }
      : { csv: false as const }),
  }));
  return (
    <div className="mb-6 last:mb-0">
      <DataTable testId={testId} label={testId ?? 'list'} columns={columns} rows={rows} rowId={(r) => ids.get(r) ?? ''} rowTone={tint ? (r) => (tint(r) ? 'danger' : undefined) : undefined} exportName={exportName} filters={filters} bare={rows.length <= 10 && !filters && !exportName} />
    </div>
  );
}

/** A button that runs one server action and reports it in the toast. */
export function ActionButton({ label, run, onDone, tone, disabled }: { label: string; run: () => Promise<ActionResult<unknown>>; onDone: (msg: string) => void; tone?: 'error'; disabled?: boolean }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  return (
    <Button
      size="small"
      variant="text"
      color={tone}
      disabled={pending || disabled}
      onClick={() =>
        start(async () => {
          const res = await run();
          onDone(res.ok ? t('ops.saved') : res.error);
        })
      }
    >
      {label}
    </Button>
  );
}

export const Pill = ({ label, warn }: { label: string; warn?: boolean }) => (
  <StatusPill tone={warn ? 'danger' : 'neutral'}>{label}</StatusPill>
);

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const node = <Snackbar open={!!msg} autoHideDuration={6000} onClose={() => setMsg(null)} message={msg} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} />;
  return [setMsg, node] as const;
}

/** Tabs kept in the URL (`?tab=`) without a server round trip. */
export function Tabbed({ tabs, initial, label, actions }: { tabs: { id: string; label: string; node: ReactNode }[]; initial: string; label: string; actions?: ReactNode }) {
  const pathname = usePathname();
  const [tab, setTab] = useState(tabs.some((x) => x.id === initial) ? initial : tabs[0].id);
  const go = (next: string) => {
    setTab(next);
    window.history.replaceState(null, '', next === tabs[0].id ? pathname : `${pathname}?tab=${next}`);
  };
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mt-6 mb-4 border-b border-border">
        <Tabs className="flex-auto min-h-[48px]" value={tab} onChange={(_, v: string) => go(v)} aria-label={label} variant="scrollable" scrollButtons="auto">
          {tabs.map((x) => (
            <Tab key={x.id} value={x.id} label={x.label} data-testid={`tab-${x.id}`} />
          ))}
        </Tabs>
        {actions && <div className="flex gap-2 pb-2 flex-wrap">{actions}</div>}
      </div>
      {tabs.find((x) => x.id === tab)?.node}
    </>
  );
}

/** A row of buttons above a table. */
export const Bar = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-wrap gap-2 mb-3">{children}</div>
);
