'use client';

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FilterX,
  GripVertical,
  ListOrdered,
  MoreHorizontal,
  Search,
  SearchX,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/States';
import { Button } from '@/components/shadcn/button';
import { Checkbox } from '@/components/shadcn/checkbox';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/shadcn/dropdown-menu';
import { Input } from '@/components/shadcn/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/shadcn/table';
import { useI18n } from '@/i18n/client';
import { cn } from '@/lib/utils';
import { canSelectAllMatching, isSelected, NONE, pageState, pickRows, selectAllMatching, selectedCount, toggleRow, togglePage, toTarget, type BulkTarget, type Selection } from '@/lib/selection';
import { matchesQuery, moveItem, paginate, sortRows, toCsv, type Cell, type SortDir } from '@/lib/table';
import { SkeletonTable } from './Skeleton';
import { useToastOptional } from './Toast';

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Makes the column sortable, and is its value in search and export unless `csv` says otherwise. */
  sort?: (row: T) => Cell;
  /** Server-side lists: the API's sort key for this column (makes it sortable). */
  sortKey?: string;
  /** The value in the CSV export; `false` leaves the column out (an actions column). */
  csv?: ((row: T) => Cell) | false;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  /** Hidden below this breakpoint so a table fits a tablet or phone. */
  hideBelow?: 'sm' | 'md' | 'lg';
  /** The row's name for screen readers (rendered as a row header). One per table. */
  rowHeader?: boolean;
  /** Offered in the column chooser (default: every column but the row header). */
  hideable?: boolean;
  /** Starts hidden; the person can show it from the column chooser. */
  defaultHidden?: boolean;
}

export interface TableFilter<T> {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  /** Lists held in memory: whether a row matches the chosen value. Server-side lists filter on the server. */
  match?: (row: T, value: string) => boolean;
}

/** What is selected, for a bulk action: the rows loaded, and how to name all of them to the API. */
export interface SelectionInfo {
  /** Every matching row, including rows on pages not loaded (less `target.except`). */
  all: boolean;
  count: number;
  target: BulkTarget;
}

export interface BulkAction<T> {
  id: string;
  label: string;
  icon?: ReactNode;
  tone?: 'danger';
  onClick: (rows: T[], selection: SelectionInfo) => void | Promise<void>;
}

export interface RowAction<T> {
  id: string;
  label: string;
  icon?: ReactNode;
  tone?: 'danger';
  disabled?: boolean;
  /** Draws a line above this action. */
  separator?: boolean;
  onSelect: (row: T) => void;
}

/** A list the server pages, searches, filters and sorts: the table shows `rows` (one page) and reports changes. */
export interface ServerMode {
  total: number;
  /** 1-based. */
  page: number;
  pageSize: number;
  query: string;
  filters: Record<string, string>;
  sort: { id: string; dir: SortDir } | null;
  onChange: (next: { query?: string; filters?: Record<string, string>; sort?: { id: string; dir: SortDir } | null; page?: number; pageSize?: number }) => void;
  /** A new page is loading (dims the rows). */
  pending?: boolean;
}

export type Density = 'comfortable' | 'compact';

const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' } as const;
const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;
const ALL = '__all__';
const SIZES = [10, 25, 50, 100, 200];
const onBar = 'h-8 border border-primary-foreground/30 bg-transparent text-primary-foreground shadow-none hover:bg-primary-foreground/10 hover:text-primary-foreground';

/** Page numbers to show: first, last, and a window around the current page (null = gap). */
function pageList(page: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i);
  const out: (number | null)[] = [0];
  const lo = Math.max(1, Math.min(page - 1, pages - 4));
  const hi = Math.min(pages - 2, Math.max(page + 1, 3));
  if (lo > 1) out.push(null);
  for (let i = lo; i <= hi; i++) out.push(i);
  if (hi < pages - 2) out.push(null);
  out.push(pages - 1);
  return out;
}

/** A white card frame for plain tables (no search or paging); scrolls sideways on narrow screens. */
export function TableFrame({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className="overflow-x-auto rounded-lg border border-border bg-card shadow-card [&_th]:bg-card [&_tbody>tr:last-of-type>td]:border-b-0"
    >
      {children}
    </div>
  );
}

/**
 * The table for lists of records: search, filters, sortable columns, pagination (in memory, or on the server with
 * `server`), row selection with select-all-on-page and select-all-matching, a sticky bulk action bar, a column
 * chooser and density, a per-row actions menu, drag-handle reordering, a saved-views slot and export.
 *
 * Keyboard: Tab reaches the toolbar, then the rows. ArrowUp/ArrowDown/Home/End move between rows, Space selects a
 * row, Enter opens it (`onRowClick`/`rowHref`), Shift+F10 or the menu key opens its actions, and "/" jumps to the
 * search box. In reorder mode, Space on a row's handle picks it up, the arrows move it and Space drops it.
 */
export function DataTable<T>({
  columns,
  rows,
  rowId,
  label,
  searchText,
  filters,
  selectable,
  selectAllMatching: allMatching = true,
  bulkActions,
  exportName,
  onExport,
  pageSize = 25,
  initialSort,
  initialQuery = '',
  loading,
  empty,
  toolbar,
  views,
  onRowClick,
  rowHref,
  rowActions,
  rowTone,
  rowAttrs,
  highlight,
  bare,
  dense,
  density: densityProp,
  onDensityChange,
  visibleColumns,
  onVisibleColumnsChange,
  columnChooser,
  stickyHeader,
  server,
  reorder,
  testId,
}: {
  columns: Column<T>[];
  rows: readonly T[];
  rowId: (row: T) => string;
  /** The table's accessible name ("Students", "Fee invoices"). */
  label: string;
  /** What search looks at; defaults to every column's sort or csv value. */
  searchText?: (row: T) => string;
  filters?: TableFilter<T>[];
  selectable?: boolean;
  /** Offer "Select all N" once a page is selected (server-side lists: every matching row, not just those loaded). */
  selectAllMatching?: boolean;
  bulkActions?: BulkAction<T>[];
  /** Enables the Export CSV button (of what is shown, or of the selected rows); the file is `<exportName>.csv`. */
  exportName?: string;
  /** Export done elsewhere (a server-side file of the whole list): the button offers CSV and Excel. */
  onExport?: (format: 'csv' | 'xlsx', selection: SelectionInfo | null) => void;
  pageSize?: number;
  initialSort?: { id: string; dir: SortDir };
  /** Starts with this search text (a link from global search). */
  initialQuery?: string;
  loading?: boolean;
  /** Shown when there are no rows at all (not when filters hide them). */
  empty?: ReactNode;
  /** Buttons at the end of the toolbar (Add, Import). */
  toolbar?: ReactNode;
  /** At the start of the toolbar: the saved views menu. */
  views?: ReactNode;
  onRowClick?: (row: T) => void;
  /** The row's page. Click opens it; Ctrl/Cmd+click, middle-click or the right-click menu open it in a new workspace tab. */
  rowHref?: (row: T) => string | undefined;
  /** The ⋯ menu of a row (View, Edit, Duplicate, Move, History, Delete). */
  rowActions?: (row: T) => RowAction<T>[];
  /** Tint a row that needs attention. */
  rowTone?: (row: T) => 'warning' | 'danger' | undefined;
  /** Marks the row a detail panel is open for. */
  highlight?: (row: T) => boolean;
  /** Extra attributes on a row (data-testid, data-status) for tests and styling hooks. */
  rowAttrs?: (row: T) => Record<`data-${string}`, string | undefined>;
  /** A short, plain list: no search or filter bar (it still sorts, and exports when `exportName` is set). */
  bare?: boolean;
  /** Starts compact: tighter cells, for tables with many columns. */
  dense?: boolean;
  /** Controlled density (saved views); otherwise the table keeps its own. */
  density?: Density;
  onDensityChange?: (d: Density) => void;
  /** Controlled visible column ids, in any order (saved views); otherwise the table keeps its own. */
  visibleColumns?: string[];
  onVisibleColumnsChange?: (ids: string[]) => void;
  /** Shows the columns-and-density menu (default: on for lists with a toolbar and more than three columns). */
  columnChooser?: boolean;
  /** The header stays in view while the rows scroll (the table gets its own scroll area). */
  stickyHeader?: boolean;
  server?: ServerMode;
  /** Drag-to-reorder: the table offers a Reorder mode and reports the new order of the rows shown. */
  reorder?: { onReorder: (ids: string[]) => void | Promise<void>; onActiveChange?: (active: boolean) => void; disabledReason?: string };
  testId?: string;
}) {
  const { t } = useI18n();
  const toast = useToastOptional();
  const router = useRouter();
  const [localQuery, setLocalQuery] = useState(initialQuery);
  const [fv, setFv] = useState<Record<string, string>>({});
  const [localSort, setLocalSort] = useState<{ id: string; dir: SortDir } | null>(initialSort ?? null);
  const [localPage, setLocalPage] = useState(0);
  const [localSize, setLocalSize] = useState(pageSize);
  const [picked, setPicked] = useState<Selection>(NONE);
  const [ownDensity, setOwnDensity] = useState<Density>(dense ? 'compact' : 'comfortable');
  const [ownHidden, setOwnHidden] = useState<ReadonlySet<string>>(() => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.id)));
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [order, setOrder] = useState<string[] | null>(null);
  const [lifted, setLifted] = useState<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  const query = server ? server.query : localQuery;
  const values = server ? server.filters : fv;
  const sort = server ? server.sort : localSort;
  const density = densityProp ?? ownDensity;
  const setDensity = (d: Density) => (onDensityChange ? onDensityChange(d) : setOwnDensity(d));
  const hidden = useMemo(() => (visibleColumns ? new Set(columns.filter((c) => !visibleColumns.includes(c.id)).map((c) => c.id)) : ownHidden), [visibleColumns, columns, ownHidden]);
  const shown = columns.filter((c) => !hidden.has(c.id));
  const hideable = columns.filter((c) => c.hideable ?? !c.rowHeader);
  const setHidden = (next: Set<string>) => (onVisibleColumnsChange ? onVisibleColumnsChange(columns.filter((c) => !next.has(c.id)).map((c) => c.id)) : setOwnHidden(next));
  const sortKeyOf = (c: Column<T>) => (server ? c.sortKey : c.sort ? c.id : undefined);

  const text = (r: T) =>
    searchText
      ? searchText(r)
      : columns
          .map((c) => (c.csv ? c.csv(r) : c.sort?.(r)))
          .filter((v) => v !== null && v !== undefined)
          .join(' ');

  // In memory: filter, sort and page here. Server-side: the rows are already the page.
  const filtered = useMemo(() => {
    if (server) return rows as T[];
    const active = (filters ?? []).filter((f) => fv[f.id] && f.match);
    return rows.filter((r) => active.every((f) => f.match!(r, fv[f.id])) && matchesQuery(text(r), localQuery));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filters, fv, localQuery, server]);

  const sorted = useMemo(() => {
    if (server) return filtered;
    const col = columns.find((c) => c.id === localSort?.id);
    return localSort && col?.sort ? sortRows(filtered, col.sort, localSort.dir) : filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, localSort, server]);

  const view = server
    ? {
        rows: sorted,
        page: server.page - 1,
        pages: Math.max(1, Math.ceil(server.total / server.pageSize)),
        from: server.total === 0 ? 0 : (server.page - 1) * server.pageSize + 1,
        to: (server.page - 1) * server.pageSize + sorted.length,
        total: server.total,
      }
    : paginate(sorted, localPage, localSize);
  const size = server ? server.pageSize : localSize;
  const total = server ? server.total : sorted.length;
  const filtering = query.trim() !== '' || Object.values(values).some(Boolean);

  // Reorder mode shows the rows in the order being edited.
  const viewIds = view.rows.map(rowId);
  const orderedRows = ordering && order ? order.map((id) => view.rows.find((r) => rowId(r) === id)).filter((r): r is T => !!r) : view.rows;
  const pageIds = orderedRows.map(rowId);
  const headState = pageState(picked, pageIds);
  const nBulk = selectedCount(picked, total);
  const selectedRows = useMemo(() => pickRows(picked, rows, rowId), [picked, rows, rowId]);
  const selectionInfo = (): SelectionInfo => ({ all: picked.mode === 'all', count: nBulk, target: toTarget(picked) });

  // A new search or filter (server-side) starts a new selection; new rows restart the order being edited.
  const selectionKey = server ? JSON.stringify([server.query, server.filters]) : '';
  const idsKey = viewIds.join(',');
  const [seen, setSeen] = useState({ selectionKey, idsKey });
  if (seen.selectionKey !== selectionKey || seen.idsKey !== idsKey) {
    setSeen({ selectionKey, idsKey });
    if (seen.selectionKey !== selectionKey) setPicked(NONE);
    if (seen.idsKey !== idsKey) setOrder(ordering ? viewIds : null);
  }

  // "/" jumps to search (unless the person is typing somewhere).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const setQuery = (q: string) => (server ? server.onChange({ query: q, page: 1 }) : (setLocalQuery(q), setLocalPage(0)));
  const setFilter = (id: string, v: string) => (server ? server.onChange({ filters: { ...server.filters, [id]: v }, page: 1 }) : (setFv({ ...fv, [id]: v }), setLocalPage(0)));
  const setSort = (s: { id: string; dir: SortDir } | null) => (server ? server.onChange({ sort: s, page: 1 }) : (setLocalSort(s), setLocalPage(0)));
  const setPage = (p: number) => (server ? server.onChange({ page: p + 1 }) : setLocalPage(p));
  const setSize = (n: number) => (server ? server.onChange({ pageSize: n, page: 1 }) : (setLocalSize(n), setLocalPage(0)));
  const clearAll = () => (server ? server.onChange({ query: '', filters: {}, page: 1 }) : (setLocalQuery(''), setFv({}), setLocalPage(0)));

  const exportCsv = () => {
    const cols = shown.filter((c) => c.csv !== false && (c.csv || c.sort));
    const source = nBulk ? selectedRows : sorted;
    const csv = toCsv(
      cols.map((c) => c.header),
      source.map((r) => cols.map((c) => (c.csv ? c.csv(r) : c.sort!(r)))),
    );
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportName ?? 'export'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast?.success(t('ui.table.exported', { n: source.length }));
  };

  const toggleOrdering = (on: boolean) => {
    setOrdering(on);
    setOrder(on ? viewIds : null);
    setLifted(null);
    setPicked(NONE);
    reorder?.onActiveChange?.(on);
  };
  const commitOrder = async (ids: string[]) => {
    setOrder(ids);
    if (ids.join(',') !== viewIds.join(',')) await reorder?.onReorder(ids);
  };
  const onHandleKey = (e: KeyboardEvent<HTMLButtonElement>, id: string, i: number) => {
    const ids = order ?? viewIds;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (lifted === id) {
        setLifted(null);
        setAnnounce(t('ui.table.dropped', { n: i + 1, total: ids.length }));
        void commitOrder(ids);
      } else {
        setLifted(id);
        setAnnounce(t('ui.table.lifted', { n: i + 1, total: ids.length }));
      }
    } else if (lifted === id && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const to = Math.min(Math.max(i + (e.key === 'ArrowUp' ? -1 : 1), 0), ids.length - 1);
      setOrder(moveItem(ids, i, to));
      setAnnounce(t('ui.table.movedTo', { n: to + 1, total: ids.length }));
      requestAnimationFrame(() => bodyRef.current?.querySelector<HTMLButtonElement>(`[data-handle="${id}"]`)?.focus());
    } else if (e.key === 'Escape' && lifted) {
      setLifted(null);
      setOrder(viewIds);
      setAnnounce(t('ui.table.reorderCancelled'));
    }
  };
  const onDrop = (e: DragEvent, targetId: string) => {
    e.preventDefault();
    const ids = order ?? viewIds;
    if (!dragged || dragged === targetId) return;
    setDragged(null);
    void commitOrder(moveItem(ids, ids.indexOf(dragged), ids.indexOf(targetId)));
  };

  const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, row: T, i: number) => {
    if (e.target !== e.currentTarget) return;
    const go = (j: number) => {
      const rowsEl = bodyRef.current?.querySelectorAll<HTMLElement>('tr[data-row]');
      rowsEl?.[Math.min(Math.max(j, 0), rowsEl.length - 1)]?.focus();
      e.preventDefault();
    };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(orderedRows.length - 1);
    else if (e.key === ' ' && selectable && !ordering) {
      setPicked(toggleRow(picked, rowId(row), !isSelected(picked, rowId(row))));
      e.preventDefault();
    } else if ((e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) && rowActions) {
      setMenuFor(rowId(row));
      e.preventDefault();
    } else if (e.key === 'Enter' && onRowClick) onRowClick(row);
    else if (e.key === 'Enter' && rowHref?.(row)) router.push(rowHref(row)!);
  };

  if (loading) return <SkeletonTable rows={Math.min(size, 6)} cols={Math.min(columns.length, 5)} />;
  if (rows.length === 0 && empty && !filtering && (!server || server.total === 0)) return <>{empty}</>;

  const canSelect = !!selectable && !ordering;
  // Rows that open a record get a ⋯ button with the same menu as right-click (Open in new tab, side by side).
  const hrefMenu = !!rowHref && !onRowClick && !rowActions;
  const actionsCol = !!rowActions || hrefMenu;
  const colSpan = shown.length + (canSelect ? 1 : 0) + (actionsCol ? 1 : 0) + (ordering ? 1 : 0);
  const compact = density === 'compact';
  const cellPad = compact ? 'px-1.5' : 'px-3.5';
  const chooser = (columnChooser ?? (!bare && columns.length > 3)) && hideable.length > 0;
  const showToolbar = !(bare && !exportName && !onExport && !toolbar && !views);
  const showBar = nBulk > 0 || showToolbar;

  const exportButton = (sel: boolean) =>
    onExport ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className={sel ? onBar : 'h-9 rounded-md'} disabled={!sel && total === 0}>
            <Download />
            {sel ? t('ui.table.exportSelected') : t('ui.table.exportList')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onExport('xlsx', sel ? selectionInfo() : null)}>{t('ui.table.exportXlsx')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onExport('csv', sel ? selectionInfo() : null)}>{t('ui.table.exportCsv')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : exportName ? (
      <Button size="sm" variant="outline" onClick={exportCsv} disabled={!sel && sorted.length === 0} className={sel ? onBar : 'h-9 rounded-md'}>
        <Download />
        {t('ui.table.export')}
      </Button>
    ) : null;

  return (
    <div data-testid={testId} data-density={density} className="overflow-clip rounded-lg border border-border bg-card shadow-card">
      {/* Toolbar, or the bulk bar when rows are selected (it stays in view while the page scrolls). */}
      {nBulk > 0 ? (
        <div role="toolbar" aria-label={t('ui.table.bulk')} data-testid="bulk-bar" className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center gap-2 border-b border-border bg-primary px-4 py-2.5 text-primary-foreground">
          <Button size="icon-sm" variant="ghost" onClick={() => setPicked(NONE)} aria-label={t('ui.table.clearSelection')} className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
            <X />
          </Button>
          <span role="status" className="mr-2 text-sm font-bold">
            {picked.mode === 'all' ? t('ui.table.selectedAll', { n: nBulk }) : t('ui.table.selected', { n: nBulk })}
          </span>
          {allMatching && canSelectAllMatching(picked, pageIds, total) && (
            <Button size="sm" variant="link" onClick={() => setPicked(server ? selectAllMatching() : { mode: 'ids', ids: new Set(sorted.map(rowId)) })} className="h-8 px-1 text-primary-foreground underline">
              {t('ui.table.selectAllN', { n: total })}
            </Button>
          )}
          <div className="flex-1" />
          {(bulkActions ?? []).map((a) => (
            <Button key={a.id} size="sm" variant="outline" onClick={() => a.onClick(selectedRows, selectionInfo())} className={cn(onBar, a.tone === 'danger' && 'border-red-soft/60')}>
              {a.icon}
              {a.label}
            </Button>
          ))}
          {exportButton(true)}
        </div>
      ) : !showToolbar ? null : (
        <div role="search" aria-label={label} className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3.5">
          {views}
          {!bare && (
            <div className="relative max-w-[320px] flex-[1_1_220px]">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <SearchBox
                inputRef={searchRef}
                value={query}
                debounce={server ? 300 : 0}
                onChange={setQuery}
                placeholder={t('ui.table.search')}
                ariaLabel={t('ui.table.searchIn', { name: label })}
                disabled={ordering}
              />
            </div>
          )}
          {!bare &&
            (filters ?? []).map((f) => (
              <Select key={f.id} value={values[f.id] || ALL} onValueChange={(v) => setFilter(f.id, v === ALL ? '' : v)} disabled={ordering}>
                <SelectTrigger aria-label={f.label} className="h-9 min-w-[150px] rounded-md bg-background max-sm:w-full">
                  <span className="text-muted-foreground">{f.label}:</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t('ui.table.all')}</SelectItem>
                  {f.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
          {filtering && !ordering && (
            <Button size="sm" variant="ghost" onClick={clearAll} className="h-9">
              <FilterX />
              {t('common.clearFilters')}
            </Button>
          )}
          <div className="flex-1" />
          {ordering ? (
            <>
              <span className="text-[13px] text-muted-foreground">{t('ui.table.reorderHelp')}</span>
              <Button size="sm" onClick={() => toggleOrdering(false)} className="h-9" data-testid="reorder-done">
                <Check />
                {t('ui.table.reorderDone')}
              </Button>
            </>
          ) : (
            <>
              {toolbar}
              {reorder && (
                <Button size="sm" variant="outline" onClick={() => toggleOrdering(true)} disabled={!!reorder.disabledReason} title={reorder.disabledReason} className="h-9 rounded-md" data-testid="reorder-start">
                  <ListOrdered />
                  {t('ui.table.reorder')}
                </Button>
              )}
              {chooser && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" variant="outline" className="size-9 rounded-md" aria-label={t('ui.table.viewOptions')} data-testid="column-chooser">
                      <SlidersHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-56">
                    <DropdownMenuLabel>{t('ui.table.columns')}</DropdownMenuLabel>
                    {hideable.map((c) => (
                      <DropdownMenuCheckboxItem
                        key={c.id}
                        checked={!hidden.has(c.id)}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={(on) => {
                          const next = new Set(hidden);
                          if (on) next.delete(c.id);
                          else if (shown.length > 1) next.add(c.id);
                          setHidden(next);
                        }}
                      >
                        {c.header || c.id}
                      </DropdownMenuCheckboxItem>
                    ))}
                    <DropdownMenuItem onSelect={() => setHidden(new Set(columns.filter((c) => c.defaultHidden).map((c) => c.id)))}>{t('ui.table.resetColumns')}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>{t('ui.table.density')}</DropdownMenuLabel>
                    <DropdownMenuRadioGroup value={density} onValueChange={(v) => setDensity(v as Density)}>
                      <DropdownMenuRadioItem value="comfortable">{t('ui.table.comfortable')}</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="compact">{t('ui.table.compact')}</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {exportButton(false)}
            </>
          )}
        </div>
      )}

      <div className={cn(stickyHeader && '[&_[data-slot=table-container]]:max-h-[70vh] [&_[data-slot=table-container]]:overflow-y-auto', server?.pending && 'opacity-60 transition-opacity')} aria-busy={server?.pending || undefined}>
        <Table aria-label={label} aria-rowcount={total} className={cn(!showBar && 'border-t-0')}>
          <TableHeader className={cn('[&_tr]:border-b-0', stickyHeader && '[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card')}>
            <TableRow className="hover:bg-transparent">
              {ordering && <TableHead className="w-10 border-b border-border px-2" aria-label={t('ui.table.reorder')} />}
              {canSelect && (
                <TableHead className="h-auto w-12 border-b border-border px-3 py-2.5">
                  <Checkbox
                    checked={headState === 'all' ? true : headState === 'some' ? 'indeterminate' : false}
                    onCheckedChange={(v) => setPicked(togglePage(picked, pageIds, v === true))}
                    aria-label={t('ui.table.selectPage')}
                    data-testid="select-page"
                  />
                </TableHead>
              )}
              {shown.map((c) => {
                const key = sortKeyOf(c);
                const active = !!key && sort?.id === key && !ordering;
                const Icon = active ? (sort!.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <TableHead
                    key={c.id}
                    aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : key ? 'none' : undefined}
                    style={{ width: c.width }}
                    className={cn('h-auto border-b border-border bg-muted/40 py-2.5 text-[12.5px] font-[550] whitespace-nowrap text-muted-foreground', cellPad, ALIGN[c.align ?? 'left'], c.hideBelow && HIDE[c.hideBelow])}
                  >
                    {key && !ordering ? (
                      <button
                        type="button"
                        onClick={() => setSort(!active ? { id: key, dir: 'asc' } : sort!.dir === 'asc' ? { id: key, dir: 'desc' } : null)}
                        className={cn('group inline-flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring', active && 'text-foreground', c.align === 'right' && 'flex-row-reverse')}
                      >
                        {c.header}
                        <Icon aria-hidden className={cn('size-3.5', !active && 'opacity-0 group-hover:opacity-50 group-focus-visible:opacity-50')} />
                      </button>
                    ) : (
                      c.header
                    )}
                  </TableHead>
                );
              })}
              {actionsCol && <TableHead className="w-10 border-b border-border px-1" aria-label={t('ez.rowMenu')} />}
            </TableRow>
          </TableHeader>
          <TableBody ref={bodyRef} className="[&_tr:last-child>*]:border-b-0">
            {orderedRows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={colSpan} className="border-0 whitespace-normal">
                  <EmptyState dense icon={<SearchX />} title={t('ui.table.noMatch')} actions={filtering ? <Button variant="outline" onClick={clearAll}>{t('common.clearFilters')}</Button> : undefined}>
                    {t('ui.table.noMatchHelp')}
                  </EmptyState>
                </TableCell>
              </TableRow>
            ) : (
              orderedRows.map((r, i) => {
                const id = rowId(r);
                const on = canSelect && isSelected(picked, id);
                const tone = rowTone?.(r);
                const selected = on || highlight?.(r) === true;
                const actions = rowActions?.(r) ?? [];
                return (
                  <TableRow
                    key={id}
                    data-row
                    {...rowAttrs?.(r)}
                    data-state={selected ? 'selected' : undefined}
                    tabIndex={0}
                    onKeyDown={(e) => onRowKey(e, r, i)}
                    data-href={ordering ? undefined : rowHref?.(r)}
                    onClick={ordering ? undefined : onRowClick ? () => onRowClick(r) : rowHref?.(r) ? () => router.push(rowHref(r)!) : undefined}
                    aria-selected={canSelect ? on : undefined}
                    onDragOver={ordering ? (e) => e.preventDefault() : undefined}
                    onDrop={ordering ? (e) => onDrop(e, id) : undefined}
                    className={cn(
                      'border-b-0 outline-none hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                      (onRowClick || rowHref) && !ordering && 'cursor-pointer',
                      selected && 'bg-teal-soft hover:bg-teal-soft data-[state=selected]:bg-teal-soft',
                      (lifted === id || dragged === id) && 'bg-amber-soft hover:bg-amber-soft',
                      tone === 'danger' && 'shadow-[inset_3px_0_0_var(--color-red)]',
                      tone === 'warning' && 'shadow-[inset_3px_0_0_var(--color-amber)]',
                    )}
                  >
                    {ordering && (
                      <TableCell className="w-10 border-b border-border px-2">
                        <button
                          type="button"
                          draggable
                          data-handle={id}
                          aria-pressed={lifted === id}
                          aria-label={t('ui.table.moveRow', { n: i + 1 })}
                          onDragStart={(e) => {
                            setDragged(id);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragEnd={() => setDragged(null)}
                          onKeyDown={(e) => onHandleKey(e, id, i)}
                          className="inline-grid size-7 cursor-grab place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                        >
                          <GripVertical className="size-4" />
                        </button>
                      </TableCell>
                    )}
                    {canSelect && (
                      <TableCell className="w-12 border-b border-border px-3 py-2.5">
                        <Checkbox checked={on} onCheckedChange={(v) => setPicked(toggleRow(picked, id, v === true))} onClick={(e) => e.stopPropagation()} aria-label={t('ui.table.selectRow')} />
                      </TableCell>
                    )}
                    {shown.map((c) => {
                      const cls = cn('border-b border-border text-[13.5px] align-middle', compact ? 'py-2' : 'py-3', cellPad, ALIGN[c.align ?? 'left'], c.hideBelow && HIDE[c.hideBelow]);
                      return c.rowHeader ? (
                        <th key={c.id} scope="row" className={cn(cls, 'font-semibold')}>
                          {c.cell(r)}
                        </th>
                      ) : (
                        <TableCell key={c.id} className={cls}>
                          {c.cell(r)}
                        </TableCell>
                      );
                    })}
                    {actionsCol && (
                      <TableCell className="w-10 border-b border-border px-1 text-right" onClick={(e) => e.stopPropagation()}>
                        {rowActions ? (
                          actions.length > 0 && (
                            <DropdownMenu open={menuFor === id} onOpenChange={(o) => setMenuFor(o ? id : null)}>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  aria-label={t('ui.table.rowActions')}
                                  data-testid="row-actions"
                                  className="inline-grid size-7 place-items-center rounded-md text-muted-foreground opacity-70 hover:bg-background hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  <MoreHorizontal className="size-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-44">
                                {actions.map((a) => (
                                  <Fragment key={a.id}>
                                    {a.separator && <DropdownMenuSeparator />}
                                    <DropdownMenuItem variant={a.tone === 'danger' ? 'destructive' : 'default'} disabled={a.disabled} onSelect={() => a.onSelect(r)} data-testid={`row-action-${a.id}`}>
                                      {a.icon}
                                      {a.label}
                                    </DropdownMenuItem>
                                  </Fragment>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )
                        ) : (
                          rowHref!(r) && (
                            <button
                              type="button"
                              aria-label={t('ez.rowMenu')}
                              aria-haspopup="menu"
                              data-testid="row-menu"
                              className="inline-grid size-7 place-items-center rounded-md text-muted-foreground opacity-60 hover:bg-background hover:text-foreground hover:opacity-100 focus-visible:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                const b = e.currentTarget.getBoundingClientRect();
                                e.currentTarget.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.left - 160, clientY: b.bottom + 4 }));
                              }}
                            >
                              <MoreHorizontal className="size-4" />
                            </button>
                          )
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <span role="status" aria-live="assertive" className="sr-only">
        {announce}
      </span>

      {!ordering && (total > Math.min(size, 10) || view.pages > 1) ? (
        <nav aria-label={label} className="flex flex-wrap items-center gap-4 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span role="status" aria-live="polite">
            {t('ui.table.range', { from: view.from, to: view.to, total: view.total })}
          </span>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <label htmlFor={`${testId ?? 'kx'}-dt-size`}>{t('ui.table.rowsPerPage')}</label>
            <Select value={String(size)} onValueChange={(v) => setSize(Number(v))}>
              <SelectTrigger id={`${testId ?? 'kx'}-dt-size`} size="sm" className="w-[76px] rounded-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(server ? SIZES : SIZES.slice(0, 4)).map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="outline" onClick={() => setPage(view.page - 1)} disabled={view.page === 0} aria-label={t('ui.table.prev')} className="rounded-md">
              <ChevronLeft />
            </Button>
            {pageList(view.page, view.pages).map((p, k) =>
              p === null ? (
                <span key={`gap${k}`} aria-hidden className="w-6 text-center">
                  …
                </span>
              ) : (
                <Button
                  key={p}
                  size="icon-sm"
                  variant={p === view.page ? 'default' : 'outline'}
                  onClick={() => setPage(p)}
                  aria-current={p === view.page ? 'page' : undefined}
                  className={cn('rounded-md text-xs', p === view.page && 'border border-primary bg-primary text-primary-foreground')}
                >
                  {p + 1}
                </Button>
              ),
            )}
            <Button size="icon-sm" variant="outline" onClick={() => setPage(view.page + 1)} disabled={view.page >= view.pages - 1} aria-label={t('ui.table.next')} className="rounded-md">
              <ChevronRight />
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

/** The search box; server-side lists wait for a pause in typing before asking for a new page. */
function SearchBox({ value, onChange, debounce, placeholder, ariaLabel, inputRef, disabled }: { value: string; onChange: (v: string) => void; debounce: number; placeholder: string; ariaLabel: string; inputRef: React.RefObject<HTMLInputElement | null>; disabled?: boolean }) {
  const [text, setText] = useState(value);
  const [given, setGiven] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The list's search changed from outside (a saved view, Clear filters): show it.
  if (given !== value) {
    setGiven(value);
    setText(value);
  }
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Input
      ref={inputRef}
      type="search"
      value={text}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value;
        setText(v);
        clearTimeout(timer.current);
        if (!debounce) onChange(v);
        else timer.current = setTimeout(() => onChange(v), debounce);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && debounce) {
          clearTimeout(timer.current);
          onChange(text);
        }
      }}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-keyshortcuts="/"
      className="h-9 rounded-md bg-background pl-8"
    />
  );
}
