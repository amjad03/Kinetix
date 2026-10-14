'use client';

import { Inbox } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { RecordsTable } from '@/components/records/RecordsTable';
import { Button } from '@/components/shadcn/button';
import { Dialog, EmptyState, StatusPill, useToast, type BulkAction, type Column, type RowAction } from '@/components/ui';
import { ConfirmDialog } from '@/components/records/ConfirmDialog';
import type { Field } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import { statusTone } from '@/lib/procurement';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';
import type { ActionResult } from '@/lib/types';
import { useDialog } from './useDialog';

type V = Record<string, string>;

/** One column of a list, described so a server page can hand it over: the row key and how to show it. */
export interface ColSpec {
  id: string;
  label: string;
  key: string;
  kind?: 'text' | 'date' | 'datetime' | 'rupees' | 'paise' | 'number' | 'status' | 'yesno' | 'lpa';
  /** A second key shown small under the value. */
  sub?: string;
  sortKey?: string;
  hideBelow?: 'sm' | 'md' | 'lg';
  defaultHidden?: boolean;
  rowHeader?: boolean;
  /** Status words to their label (kind status); a key `<value>` missing shows the value. */
  labels?: Record<string, string>;
  /** A link for the cell, `{id}` or `{<key>}` replaced from the row. */
  href?: string;
}

/** When a row action is offered: the row's `key` is one of `in` (or not, with `not`). */
export interface When {
  key: string;
  in?: (string | boolean | null)[];
  not?: (string | boolean | null)[];
}

/** A row action that runs a server action, after a form (fields) or a confirmation. */
export interface RowActionSpec {
  id: string;
  label: string;
  when?: When[];
  fields?: Field[];
  /** Asked before running when there is no form. */
  confirm?: string;
  danger?: boolean;
  done?: string;
  run?: (rowId: string, v: V) => Promise<ActionResult<unknown>>;
  /** Or a file to send (a letter): the dialog asks for it and `upload` gets it as the form's `file`. */
  upload?: { accept: string; help?: string; run: (rowId: string, form: FormData) => Promise<ActionResult<unknown>> };
  /** Or a page to open in a new tab, `{id}` or `{<key>}` from the row. */
  href?: string;
}

/** A toolbar button: a form whose values go to a server action. */
export interface ToolSpec {
  id: string;
  label: string;
  fields: Field[];
  done: string;
  disabled?: boolean;
  intro?: string;
  run: (v: V) => Promise<ActionResult<unknown>>;
  /** Where to go after it worked, `{id}` from the result. */
  go?: string;
}

/** A bulk action over the chosen rows' ids. */
export interface BulkSpec {
  id: string;
  label: string;
  done?: string;
  run?: (ids: string[]) => Promise<ActionResult<unknown>>;
  /** Or a page that opens in a new tab, `{ids}` replaced by the chosen ids (comma-separated). */
  href?: string;
}

/** A plain link next to the toolbar's buttons (a printout, another page). */
export interface LinkSpec {
  label: string;
  href: string;
  newTab?: boolean;
}

const text = (r: Row, k: string) => (r[k] === null || r[k] === undefined ? '' : String(r[k]));
const fill = (tpl: string, r: Row) => tpl.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(text(r, k)));
const matches = (r: Row, when?: When[]) =>
  (when ?? []).every((w) => {
    const v = r[w.key] as string | boolean | null | undefined;
    if (w.in && !w.in.includes(v ?? null)) return false;
    if (w.not && w.not.includes(v ?? null)) return false;
    return true;
  });

/** Builds the table's columns from their descriptions. */
export function useColumns(cols: ColSpec[]): Column<Row>[] {
  const { fmt } = useI18n();
  return cols.map((c) => {
    const show = (r: Row): ReactNode => {
      const v = r[c.key];
      if (v === null || v === undefined || v === '') return c.kind === 'status' ? '' : '—';
      switch (c.kind) {
        case 'date':
          // A day, or an instant (a created time) shown as its day.
          return fmt.date(String(v).slice(0, 10), 'short');
        case 'datetime':
          return fmt.dateTime(String(v));
        case 'rupees':
          return fmt.rupees(Math.round(Number(v) * 100));
        case 'paise':
          return fmt.rupees(Number(v));
        case 'number':
          return fmt.number(Number(v));
        case 'lpa':
          return fmt.number(Number(v), { maximumFractionDigits: 2 });
        case 'yesno':
          return v ? '✓' : '—';
        case 'status':
          return <StatusPill tone={statusTone(String(v))}>{c.labels?.[String(v)] ?? String(v)}</StatusPill>;
        default:
          return String(v);
      }
    };
    return {
      id: c.id,
      header: c.label,
      sortKey: c.sortKey,
      hideBelow: c.hideBelow,
      defaultHidden: c.defaultHidden,
      rowHeader: c.rowHeader,
      hideable: c.rowHeader ? false : undefined,
      align: c.kind && ['rupees', 'paise', 'number', 'lpa'].includes(c.kind) ? 'right' : undefined,
      csv: (r: Row) => (c.kind === 'status' ? (c.labels?.[text(r, c.key)] ?? text(r, c.key)) : text(r, c.key)),
      cell: (r: Row) => {
        const body = show(r);
        const main = c.href ? (
          <Link className="font-medium text-primary hover:underline" href={fill(c.href, r)}>
            {body}
          </Link>
        ) : (
          body
        );
        return c.sub && r[c.sub] ? (
          <div className="flex flex-col">
            <span>{main}</span>
            <span className="text-xs text-muted-foreground">{text(r, c.sub)}</span>
          </div>
        ) : (
          main
        );
      },
    };
  });
}

/**
 * A record-kit list (RecordsTable) whose columns, row actions, toolbar forms and bulk actions are described by the
 * server page; the actions are server actions, so the page stays a server component.
 */
export function KitList({
  meta,
  page,
  state,
  label,
  cols,
  rowHref,
  extraParams,
  rowActions = [],
  tools = [],
  bulk = [],
  links = [],
  emptyTitle,
  emptyBody,
  testId,
}: {
  meta: RecordMeta;
  page: RecordsPage<Row>;
  state: ListState;
  label: string;
  cols: ColSpec[];
  rowHref?: string;
  extraParams?: Record<string, string>;
  rowActions?: RowActionSpec[];
  tools?: ToolSpec[];
  bulk?: BulkSpec[];
  links?: LinkSpec[];
  emptyTitle: string;
  emptyBody?: string;
  testId?: string;
}) {
  const columns = useColumns(cols);
  const toast = useToast();
  const router = useRouter();
  const [open, dialog] = useDialog();
  const [confirming, setConfirming] = useState<{ spec: RowActionSpec; row: Row } | null>(null);
  const [uploading, setUploading] = useState<{ spec: RowActionSpec; row: Row } | null>(null);
  const [busy, setBusy] = useState(false);
  const { t } = useI18n();

  const runRow = (spec: RowActionSpec, row: Row) => {
    if (spec.href) return void window.open(fill(spec.href, row), '_blank', 'noopener');
    if (spec.upload) return setUploading({ spec, row });
    const run = spec.run;
    if (!run) return;
    if (spec.fields?.length) return open({ title: `${spec.label} · ${text(row, cols[0]?.key ?? 'id')}`, fields: spec.fields, done: spec.done, run: (v) => run(row.id, v) });
    setConfirming({ spec, row });
  };
  const finish = (r: ActionResult<unknown>, done: string | undefined, close: () => void) => {
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(done ?? t('ops.saved'));
    close();
    router.refresh();
  };
  const confirm = async () => {
    if (!confirming?.spec.run) return;
    setBusy(true);
    finish(await confirming.spec.run(confirming.row.id, {}), confirming.spec.done, () => setConfirming(null));
  };
  const upload = async (file: File | null) => {
    if (!uploading?.spec.upload || !file) return;
    const form = new FormData();
    form.set('file', file);
    setBusy(true);
    finish(await uploading.spec.upload.run(uploading.row.id, form), uploading.spec.done, () => setUploading(null));
  };

  const extraRowActions = (row: Row): RowAction<Row>[] =>
    rowActions.filter((a) => matches(row, a.when)).map((a, i) => ({ id: a.id, label: a.label, tone: a.danger ? 'danger' : undefined, separator: i === 0, onSelect: () => runRow(a, row) }));
  const extraBulkActions: BulkAction<Row>[] = bulk.map((b) => ({
    id: b.id,
    label: b.label,
    onClick: async (rows) => {
      const ids = rows.map((x) => x.id);
      if (b.href) return void window.open(b.href.replace('{ids}', ids.map(encodeURIComponent).join(',')), '_blank', 'noopener');
      if (!b.run) return;
      const r = await b.run(ids);
      if (!r.ok) return toast.error(r.error);
      if (b.done) toast.success(b.done);
      router.refresh();
    },
  }));

  return (
    <>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        label={label}
        columns={columns}
        extraParams={extraParams}
        testId={testId}
        rowHref={rowHref ? (r) => fill(rowHref, r) : undefined}
        extraRowActions={rowActions.length ? extraRowActions : undefined}
        extraBulkActions={bulk.length ? extraBulkActions : undefined}
        toolbar={
          tools.length || links.length ? (
            <>
              {links.map((l) => (
                <Button key={l.href} variant="outline" asChild>
                  <a href={l.href} target={l.newTab ? '_blank' : undefined} rel={l.newTab ? 'noopener' : undefined}>
                    {l.label}
                  </a>
                </Button>
              ))}
              {tools.map((x) => (
                <Button
                  key={x.id}
                  variant="outline"
                  disabled={x.disabled}
                  data-testid={`tool-${x.id}`}
                  onClick={() =>
                    open({
                      title: x.label,
                      fields: x.fields,
                      intro: x.intro,
                      done: x.done,
                      run: async (v) => {
                        const r = await x.run(v);
                        const id = r.ok ? (r.data as { id?: string } | undefined)?.id : undefined;
                        if (r.ok && x.go && id) router.push(x.go.replace('{id}', encodeURIComponent(id)));
                        return r;
                      },
                    })
                  }
                >
                  {x.label}
                </Button>
              ))}
            </>
          ) : undefined
        }
        // The empty state replaces the table and its toolbar: show it only where there is nothing to add from here.
        empty={
          meta.can.create || meta.can.import || tools.length ? undefined : (
            <EmptyState icon={<Inbox />} title={emptyTitle}>
              {emptyBody}
            </EmptyState>
          )
        }
      />
      {dialog}
      {uploading?.spec.upload && <UploadDialog title={`${uploading.spec.label} · ${text(uploading.row, cols[0]?.key ?? 'id')}`} accept={uploading.spec.upload.accept} help={uploading.spec.upload.help} busy={busy} onSend={(f) => void upload(f)} onClose={() => setUploading(null)} />}
      {confirming && (
        <ConfirmDialog title={confirming.spec.label} confirmLabel={confirming.spec.label} tone={confirming.spec.danger ? 'danger' : undefined} busy={busy} onConfirm={() => void confirm()} onClose={() => setConfirming(null)}>
          {confirming.spec.confirm}
        </ConfirmDialog>
      )}
    </>
  );
}

/** Asks for one file and sends it. */
function UploadDialog({ title, accept, help, busy, onSend, onClose }: { title: string; accept: string; help?: string; busy: boolean; onSend: (f: File | null) => void; onClose: () => void }) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  return (
    <Dialog
      title={title}
      onClose={onClose}
      busy={busy}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t('ops.cancel')}
          </Button>
          <Button onClick={() => onSend(file)} disabled={busy || !file} data-testid="upload-send">
            {t('ivd.upload')}
          </Button>
        </>
      }
    >
      {help && <p className="mb-3 text-sm text-muted-foreground">{help}</p>}
      <input type="file" accept={accept} aria-label={title} className="block w-full text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
    </Dialog>
  );
}
