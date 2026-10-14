'use client';

import { useRouter } from 'next/navigation';
import { cloneElement, useState, useTransition, type ReactElement, type ReactNode } from 'react';
import { bulkRecords } from '@/app/(dashboard)/records-actions';
import { optionText } from '@/components/records/text';
import { Button } from '@/components/shadcn/button';
import { Dialog, StatusPill, TextInput, type Column, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { RecordMeta, Row } from '@/lib/records';

/**
 * Small pieces the campus life, welfare, LMS and communication record lists share: columns from a short spec,
 * choice values in the person's language, and a module action run on one row with a typed-in note.
 */

export type ColKind = 'text' | 'date' | 'datetime' | 'number' | 'rupees' | 'choice' | 'bool' | 'wrap';

export interface ColSpec {
  /** The row key shown. */
  key: string;
  header: MessageKey;
  kind?: ColKind;
  /** The API's sort key (makes the column sortable). */
  sortKey?: string;
  /** For `choice`: the field or filter whose options name the value (default: the key). */
  choiceOf?: string;
  /** For `choice`: a pill tone per value. */
  tones?: Record<string, Tone>;
  rowHeader?: boolean;
  hideBelow?: 'sm' | 'md' | 'lg';
  defaultHidden?: boolean;
  align?: 'left' | 'right';
}

/** The person's words for a fixed value of a field or filter. */
export function choiceLabel(t: ReturnType<typeof useI18n>['t'], meta: RecordMeta, key: string, value: unknown): string {
  const v = String(value ?? '');
  const opts = meta.fields.find((f) => f.key === key)?.options ?? meta.filters.find((f) => f.key === key)?.options ?? [];
  const o = opts.find((x) => x.value === v);
  return o ? optionText(t, meta.key, key, o) : v;
}

/** Table columns from specs. */
export function useKitColumns(meta: RecordMeta, specs: ColSpec[]): Column<Row>[] {
  const { t, fmt } = useI18n();
  const muted = <span className="text-muted-foreground">-</span>;
  return specs.map((s) => {
    const kind = s.kind ?? 'text';
    const right = s.align === 'right' || kind === 'number' || kind === 'rupees';
    const cell = (r: Row): ReactNode => {
      const v = r[s.key];
      if (v === null || v === undefined || v === '') return kind === 'bool' ? t('ops.no') : muted;
      switch (kind) {
        case 'date':
          return fmt.date(String(v).slice(0, 10), 'short');
        case 'datetime':
          return fmt.dateTime(String(v));
        case 'number':
          return <span className="tabular-nums">{fmt.number(Number(v))}</span>;
        case 'rupees':
          return <span className="tabular-nums">{fmt.rupees(Math.round(Number(v) * 100))}</span>;
        case 'bool':
          return v ? t('ops.yes') : t('ops.no');
        case 'choice': {
          const label = choiceLabel(t, meta, s.choiceOf ?? s.key, v);
          const tone = s.tones?.[String(v)];
          return tone ? <StatusPill tone={tone}>{label}</StatusPill> : label;
        }
        case 'wrap':
          return <span className="block min-w-[180px] max-w-[360px] whitespace-normal">{String(v)}</span>;
        default:
          return String(v);
      }
    };
    return {
      id: s.key,
      header: t(s.header),
      cell,
      ...(s.sortKey ? { sortKey: s.sortKey } : {}),
      ...(right ? { align: 'right' as const } : {}),
      ...(s.rowHeader ? { rowHeader: true, hideable: false } : {}),
      ...(s.hideBelow ? { hideBelow: s.hideBelow } : {}),
      ...(s.defaultHidden ? { defaultHidden: true } : {}),
      csv: (r: Row) => {
        const v = r[s.key];
        return kind === 'choice' ? choiceLabel(t, meta, s.choiceOf ?? s.key, v) : (v as string | number | boolean | null | undefined) ?? '';
      },
    };
  });
}

/** Runs one of the entity's own actions on one record, with optional parameters; refreshes the page. */
export function useRowAction(entity: string) {
  const router = useRouter();
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const run = (action: string, id: string, params?: Record<string, unknown>) =>
    new Promise<string | null>((resolve) =>
      start(async () => {
        const res = await bulkRecords(entity, { op: 'action', action, target: { ids: [id] }, ...(params ? { params } : {}) });
        if (!res.ok) return resolve(res.error);
        const row = res.data.rows[0];
        if (row && !row.ok) return resolve(row.message ?? t('error.generic'));
        router.refresh();
        resolve(null);
      }),
    );
  return { run, pending };
}

/** Asks for a note (a reason, a reference number) and runs the action with it. */
export function NoteActionDialog({ title, label, param, required, confirm, tone, onRun, onClose }: { title: string; label: string; param: string; required?: boolean; confirm: string; tone?: 'danger'; onRun: (params: Record<string, string>) => Promise<string | null>; onClose: (done?: boolean) => void }) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const submit = () =>
    start(async () => {
      if (required && !value.trim()) return setError(t('ops.err.field', { field: label }));
      const err = await onRun({ [param]: value.trim() });
      if (err) return setError(err);
      onClose(true);
    });
  return (
    <Dialog
      title={title}
      size="sm"
      busy={busy}
      onClose={() => onClose()}
      actions={
        <>
          <Button variant="outline" onClick={() => onClose()} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant={tone === 'danger' ? 'destructive' : 'default'} onClick={submit} disabled={busy} data-testid="note-action-confirm">
            {confirm}
          </Button>
        </>
      }
    >
      <TextInput label={label} value={value} required={required} multiline onChange={(e) => setValue(e.target.value)} autoFocus />
      {error && <p className="mt-2 text-sm text-red-ink">{error}</p>}
    </Dialog>
  );
}

/**
 * The empty state for a kit list. A list people can add to keeps its table and toolbar (with the Add and Import
 * buttons) even when it has no rows; otherwise the empty state shows, with the list's own action when there is one.
 */
export function emptyFor(meta: RecordMeta, empty: ReactElement<{ action?: ReactNode }>, action?: ReactNode): ReactNode {
  if (meta.can.create || meta.can.import) return undefined;
  return action ? cloneElement(empty, { action }) : empty;
}
