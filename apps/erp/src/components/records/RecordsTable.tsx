'use client';

import { ArrowRightLeft, Copy, Eye, FileUp, History, Pencil, Plus, Trash2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, useSyncExternalStore, useTransition, type ReactNode } from 'react';
import { toast as sonner } from 'sonner';
import { bulkRecords, deleteRecord, duplicateRecord, moveRecord, reorderRecords, restoreFromBin } from '@/app/(dashboard)/records-actions';
import { Button } from '@/components/shadcn/button';
import { DataTable, useToast, type BulkAction, type Column, type Density, type RowAction, type SelectionInfo } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { bulkTarget, exportHref, listSearch, type BulkReport, type ListState, type RecordMeta, type RecordsPage, type Row, type SavedViewState } from '@/lib/records';
import { BulkEditDialog } from './BulkEditDialog';
import { BulkReportDialog } from './BulkReportDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { ImportWizard } from './ImportWizard';
import { MoveDialog } from './MoveDialog';
import { RecordForm } from './RecordForm';
import { RecordHistoryDrawer } from './RecordHistoryDrawer';
import { SavedViews } from './SavedViews';
import { entityText, filterText, options, tr } from './text';

type Pending =
  | { kind: 'form'; row?: Row }
  | { kind: 'history'; row: Row }
  | { kind: 'move'; rows: Row[]; sel?: SelectionInfo }
  | { kind: 'bulkEdit'; sel: SelectionInfo }
  | { kind: 'delete'; row: Row }
  | { kind: 'bulkDelete'; sel: SelectionInfo }
  | { kind: 'action'; action: RecordMeta['actions'][number]; sel: SelectionInfo }
  | { kind: 'report'; report: BulkReport; title: string }
  | { kind: 'import' };

const prefsKey = (entity: string) => `kx.records.${entity}`;

type Prefs = { columns?: string[]; density?: Density };
/** Where prefs live when the browser refuses storage (private mode): this tab's memory. */
const memory = new Map<string, string>();
const PREFS_EVENT = 'kx-records-prefs';
const readPref = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
};
const subscribe = (cb: () => void) => {
  window.addEventListener('storage', cb);
  window.addEventListener(PREFS_EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(PREFS_EVENT, cb);
  };
};

/** A list's columns and density for this person in this browser, kept in localStorage. */
function useStoredPrefs(key: string): [Prefs, (p: Prefs) => void] {
  const raw = useSyncExternalStore(subscribe, () => readPref(key), () => null);
  const prefs = useMemo<Prefs>(() => {
    try {
      return (JSON.parse(raw ?? 'null') as Prefs | null) ?? {};
    } catch {
      return {};
    }
  }, [raw]);
  const set = useCallback(
    (p: Prefs) => {
      const text = JSON.stringify(p);
      try {
        localStorage.setItem(key, text);
      } catch {
        memory.set(key, text);
      }
      window.dispatchEvent(new Event(PREFS_EVENT));
    },
    [key],
  );
  return [prefs, set];
}

/**
 * A module's list with the whole record depth kit: server-side paging, search, filters and sort kept in the URL;
 * add, view, edit, duplicate, move, history and delete (to the recycle bin, with Undo) per row; bulk edit, move,
 * the module's own actions, export and delete for the selection (including every matching row); drag reordering;
 * import with a checked preview; and saved views. The module gives its columns; everything else comes from the
 * entity's meta (GET /v1/records/:entity/meta). See docs/requirements/RECORD_DEPTH_KIT.md.
 */
export function RecordsTable({
  meta,
  page,
  state,
  label,
  columns,
  rowHref,
  onView,
  extraRowActions,
  extraBulkActions,
  toolbar,
  empty,
  reorderScope = [],
  extraParams = {},
  viewsPage,
  testId,
}: {
  meta: RecordMeta;
  page: RecordsPage<Row>;
  state: ListState;
  /** The table's name ("Students"). */
  label: string;
  columns: Column<Row>[];
  /** The record's own page (View). */
  rowHref?: (row: Row) => string | undefined;
  /** Or a panel that opens on this page (View). */
  onView?: (row: Row) => void;
  extraRowActions?: (row: Row) => RowAction<Row>[];
  extraBulkActions?: BulkAction<Row>[];
  /** More buttons next to Add and Import. */
  toolbar?: ReactNode;
  /** Shown when the list has no records at all. */
  empty?: ReactNode;
  /** Filters that must be chosen before reordering (the group an order belongs to: a programme's term). */
  reorderScope?: string[];
  /** The page's own URL parameters to keep (a tab). */
  extraParams?: Record<string, string>;
  /** The saved views' page key (default: the entity). */
  viewsPage?: string;
  testId?: string;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [navigating, startNav] = useTransition();
  const [busy, startBusy] = useTransition();
  const [open, setOpen] = useState<Pending | null>(null);
  const entity = meta.key;
  const name = entityText(t, entity);
  // Columns and density are remembered per person in this browser (saved views carry them too).
  const [prefs, setPrefs] = useStoredPrefs(prefsKey(entity));
  const visible = prefs.columns?.filter((c) => columns.some((x) => x.id === c));
  const density: Density = prefs.density ?? 'comfortable';
  const remember = (next: Prefs) => setPrefs({ ...prefs, ...next });

  const go = (next: Partial<ListState>) => {
    const merged = { ...state, ...next };
    const qs = listSearch(merged, extraParams).toString();
    startNav(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const viewState: SavedViewState = { q: state.q, filters: state.filters, sort: state.sort, columns: visible, density, pageSize: state.pageSize };
  const applyView = (v: SavedViewState) => {
    setPrefs({ columns: v.columns?.length ? v.columns : undefined, density: v.density ?? 'comfortable' });
    go({ q: v.q ?? '', filters: v.filters ?? {}, sort: v.sort ?? null, pageSize: v.pageSize ?? 25, page: 1 });
  };
  const listParamsGiven = !!(state.q || state.sort || Object.keys(state.filters).length);

  const filters = meta.filters.filter((f) => f.options?.length).map((f) => ({ id: f.key, label: filterText(t, entity, f), options: options(t, entity, f.key, f.options) }));
  const scopeMissing = reorderScope.filter((k) => !state.filters[k]);
  const canEdit = meta.can.write && meta.fields.some((f) => f.edit);
  const bulkFields = meta.fields.some((f) => f.bulk);

  // ---- operations ---------------------------------------------------------------------------------

  const runBulk = (body: Record<string, unknown>, title: string) =>
    new Promise<string | null>((resolve) =>
      startBusy(async () => {
        const res = await bulkRecords(entity, body);
        if (!res.ok) return resolve(res.error);
        resolve(null);
        setOpen({ kind: 'report', report: res.data, title });
      }),
    );
  const targetOf = (sel: SelectionInfo) => bulkTarget(sel.target, state);

  const remove = (row: Row) =>
    startBusy(async () => {
      const res = await deleteRecord(entity, row.id);
      setOpen(null);
      if (!res.ok) return toast.error(res.error);
      sonner.success(t('rk.deleted', { name: res.data.label }), {
        duration: 8000,
        action: {
          label: t('rk.undo'),
          onClick: async () => {
            const back = await restoreFromBin([res.data.binId]);
            if (back.ok && back.data.results[0]?.ok) toast.success(t('rk.restored', { name: res.data.label }));
            else toast.error(back.ok ? (back.data.results[0]?.message ?? t('error.generic')) : back.error);
          },
        },
      });
    });

  const duplicate = (row: Row) =>
    startBusy(async () => {
      const res = await duplicateRecord(entity, row.id);
      if (!res.ok) return toast.error(res.error);
      toast.success(t('rk.duplicated'));
      setOpen({ kind: 'form', row: res.data });
    });

  const exportList = (format: 'csv' | 'xlsx', sel: SelectionInfo | null) => {
    const t0 = sel?.target;
    const href = exportHref(entity, state, format, t0 && 'ids' in t0 ? { ids: t0.ids } : t0 ? { except: t0.except } : {});
    window.location.href = href;
  };

  const rowActions = (row: Row): RowAction<Row>[] => {
    const out: RowAction<Row>[] = [];
    const href = rowHref?.(row);
    if (href || onView) out.push({ id: 'view', label: t('rk.view'), icon: <Eye />, onSelect: (r) => (onView ? onView(r) : router.push(href!)) });
    if (canEdit) out.push({ id: 'edit', label: t('rk.edit'), icon: <Pencil />, onSelect: (r) => setOpen({ kind: 'form', row: r }) });
    if (meta.can.duplicate) out.push({ id: 'duplicate', label: t('rk.duplicate'), icon: <Copy />, onSelect: duplicate });
    if (meta.can.move && meta.move) out.push({ id: 'move', label: tr(t, `rk.move.${entity}`, meta.move.label), icon: <ArrowRightLeft />, onSelect: (r) => setOpen({ kind: 'move', rows: [r] }) });
    out.push(...(extraRowActions?.(row) ?? []));
    out.push({ id: 'history', label: t('rk.history'), icon: <History />, onSelect: (r) => setOpen({ kind: 'history', row: r }) });
    if (meta.can.write) out.push({ id: 'delete', label: t('rk.delete'), icon: <Trash2 />, tone: 'danger', separator: true, onSelect: (r) => setOpen({ kind: 'delete', row: r }) });
    return out;
  };

  const bulkActions: BulkAction<Row>[] = meta.can.write
    ? [
        ...(bulkFields ? [{ id: 'edit', label: t('rk.bulk.edit'), icon: <Pencil />, onClick: (_: Row[], sel: SelectionInfo) => setOpen({ kind: 'bulkEdit', sel }) }] : []),
        ...(meta.can.move && meta.move ? [{ id: 'move', label: t('rk.bulk.move'), icon: <ArrowRightLeft />, onClick: (rows: Row[], sel: SelectionInfo) => setOpen({ kind: 'move', rows, sel }) }] : []),
        ...meta.actions.map((a) => ({ id: `action-${a.key}`, label: tr(t, `rk.action.${entity}.${a.key}`, a.label), tone: a.tone ?? undefined, onClick: (_: Row[], sel: SelectionInfo) => setOpen({ kind: 'action', action: a, sel }) })),
        ...(extraBulkActions ?? []),
        { id: 'delete', label: t('rk.delete'), icon: <Trash2 />, tone: 'danger' as const, onClick: (_: Row[], sel: SelectionInfo) => setOpen({ kind: 'bulkDelete', sel }) },
      ]
    : (extraBulkActions ?? []);

  const toolbarButtons = (
    <>
      {toolbar}
      {meta.can.import && (
        <Button size="sm" variant="outline" className="h-9 rounded-md" onClick={() => setOpen({ kind: 'import' })} data-testid="records-import">
          <FileUp />
          {t('rk.import')}
        </Button>
      )}
      {meta.can.create && (
        <Button size="sm" className="h-9 rounded-md" onClick={() => setOpen({ kind: 'form' })} data-testid="records-add">
          <Plus />
          {t('rk.addOne', { name: tr(t, `rk.one.${entity}`, name) })}
        </Button>
      )}
    </>
  );

  const shownColumns = useMemo(() => columns, [columns]);
  const o = open;

  return (
    <>
      <DataTable<Row>
        testId={testId ?? `records-${entity}`}
        label={label}
        columns={shownColumns}
        rows={page.rows}
        rowId={(r) => r.id}
        filters={filters}
        selectable={meta.can.write || bulkActions.length > 0}
        bulkActions={bulkActions}
        onExport={exportList}
        rowHref={onView ? undefined : rowHref}
        onRowClick={onView}
        rowActions={rowActions}
        empty={!listParamsGiven && page.total === 0 ? empty : undefined}
        toolbar={toolbarButtons}
        views={<SavedViews page={viewsPage ?? entity} current={viewState} onApply={applyView} onDefault={(v) => !listParamsGiven && applyView(v.state)} />}
        visibleColumns={visible}
        onVisibleColumnsChange={(c) => remember({ columns: c })}
        density={density}
        onDensityChange={(d) => remember({ density: d })}
        stickyHeader
        server={{
          total: page.total,
          page: page.page,
          pageSize: page.pageSize,
          query: state.q,
          filters: state.filters,
          sort: state.sort,
          pending: navigating || busy,
          onChange: (next) => go({ ...(next.query !== undefined && { q: next.query }), ...(next.filters && { filters: Object.fromEntries(Object.entries(next.filters).filter(([, v]) => v)) }), ...(next.sort !== undefined && { sort: next.sort }), ...(next.page && { page: next.page }), ...(next.pageSize && { pageSize: next.pageSize }) }),
        }}
        reorder={
          meta.can.reorder
            ? {
                disabledReason: scopeMissing.length ? t('rk.reorder.chooseFirst', { filters: scopeMissing.map((k) => filters.find((f) => f.id === k)?.label ?? k).join(', ') }) : undefined,
                onActiveChange: (on) => on && go({ sort: null, page: 1, pageSize: 200 }),
                onReorder: async (ids) => {
                  const res = await reorderRecords(entity, ids);
                  if (!res.ok) toast.error(res.error);
                  else toast.success(t('rk.reorder.saved'));
                },
              }
            : undefined
        }
      />

      {o?.kind === 'form' && (
        <RecordForm
          meta={meta}
          row={o.row}
          title={o.row ? t('rk.editTitle', { name: o.row._label ?? '' }) : t('rk.addTitle', { name: tr(t, `rk.one.${entity}`, name) })}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            toast.success(o.row ? t('rk.saved') : t('rk.added'));
          }}
        />
      )}
      {o?.kind === 'history' && <RecordHistoryDrawer meta={meta} id={o.row.id} title={o.row._label ?? ''} onClose={() => setOpen(null)} />}
      {o?.kind === 'move' && meta.move && (
        <MoveDialog
          title={tr(t, `rk.move.${entity}`, meta.move.label)}
          places={meta.move.options}
          reasonRequired={meta.move.reason}
          count={o.sel?.count ?? o.rows.length}
          onClose={() => setOpen(null)}
          onMove={async (to, reason) => {
            if (o.sel) return runBulk({ op: 'move', target: targetOf(o.sel), to, ...(reason && { reason }) }, tr(t, `rk.move.${entity}`, meta.move!.label));
            const res = await moveRecord(entity, o.rows[0].id, to, reason);
            if (!res.ok) return res.error;
            setOpen(null);
            toast.success(t('rk.moved'));
            return null;
          }}
        />
      )}
      {o?.kind === 'bulkEdit' && <BulkEditDialog meta={meta} count={o.sel.count} onClose={() => setOpen(null)} onApply={(fields) => runBulk({ op: 'update', target: targetOf(o.sel), fields }, t('rk.bulk.edit'))} />}
      {o?.kind === 'delete' && (
        <ConfirmDialog title={o.row._label ? t('rk.delete.named', { name: o.row._label }) : t('rk.delete.title')} confirmLabel={t('rk.delete')} tone="danger" busy={busy} onClose={() => setOpen(null)} onConfirm={() => remove(o.row)}>
          <p className="m-0">{t('rk.delete.body')}</p>
        </ConfirmDialog>
      )}
      {o?.kind === 'bulkDelete' && (
        <ConfirmDialog
          title={t('rk.bulkDelete.title', { n: o.sel.count })}
          confirmLabel={t('rk.bulkDelete.confirm', { n: o.sel.count })}
          tone="danger"
          typeToConfirm={String(o.sel.count)}
          busy={busy}
          onClose={() => setOpen(null)}
          onConfirm={() => void runBulk({ op: 'delete', target: targetOf(o.sel) }, t('rk.delete')).then((e) => e && toast.error(e))}
        >
          <p className="m-0">{t('rk.bulkDelete.body')}</p>
        </ConfirmDialog>
      )}
      {o?.kind === 'action' && (
        <ConfirmDialog
          title={t('rk.action.title', { action: tr(t, `rk.action.${entity}.${o.action.key}`, o.action.label), n: o.sel.count })}
          confirmLabel={tr(t, `rk.action.${entity}.${o.action.key}`, o.action.label)}
          tone={o.action.tone ?? undefined}
          typeToConfirm={o.action.tone === 'danger' ? String(o.sel.count) : undefined}
          busy={busy}
          onClose={() => setOpen(null)}
          onConfirm={() => void runBulk({ op: 'action', action: o.action.key, target: targetOf(o.sel) }, tr(t, `rk.action.${entity}.${o.action.key}`, o.action.label)).then((e) => e && toast.error(e))}
        >
          <p className="m-0">{tr(t, `rk.actionHelp.${entity}.${o.action.key}`, t('rk.action.body'))}</p>
        </ConfirmDialog>
      )}
      {o?.kind === 'report' && <BulkReportDialog report={o.report} title={o.title} onClose={() => setOpen(null)} />}
      {o?.kind === 'import' && <ImportWizard meta={meta} title={t('rk.import.title', { name })} onClose={() => setOpen(null)} onDone={() => router.refresh()} />}
    </>
  );
}
