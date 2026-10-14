'use client';

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, FilterX, MoreHorizontal, Search, SearchX, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/States';
import { Button } from '@/components/shadcn/button';
import { Checkbox } from '@/components/shadcn/checkbox';
import { Input } from '@/components/shadcn/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/shadcn/table';
import { useI18n } from '@/i18n/client';
import { cn } from '@/lib/utils';
import { matchesQuery, paginate, sortRows, toCsv, type Cell, type SortDir } from '@/lib/table';
import { SkeletonTable } from './Skeleton';
import { useToastOptional } from './Toast';

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Makes the column sortable, and is its value in search and export unless `csv` says otherwise. */
  sort?: (row: T) => Cell;
  /** The value in the CSV export; `false` leaves the column out (an actions column). */
  csv?: ((row: T) => Cell) | false;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  /** Hidden below this breakpoint so a table fits a tablet or phone. */
  hideBelow?: 'sm' | 'md' | 'lg';
  /** The row's name for screen readers (rendered as a row header). One per table. */
  rowHeader?: boolean;
}

export interface TableFilter<T> {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  match: (row: T, value: string) => boolean;
}

export interface BulkAction<T> {
  id: string;
  label: string;
  icon?: ReactNode;
  tone?: 'danger';
  onClick: (rows: T[]) => void | Promise<void>;
}

const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' } as const;
const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;
const ALL = '__all__';
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

/**
 * The table for lists of records: search, filters, sortable columns, pagination, row selection with
 * bulk actions, and CSV export of what is shown (or of the selected rows).
 *
 * Keyboard: Tab reaches the toolbar, then the rows. ArrowUp/ArrowDown/Home/End move between rows,
 * Space selects a row, Enter opens it (`onRowClick`), and "/" jumps to the search box.
 */
export function DataTable<T>({
  columns,
  rows,
  rowId,
  label,
  searchText,
  filters,
  selectable,
  bulkActions,
  exportName,
  pageSize = 25,
  initialSort,
  initialQuery = '',
  loading,
  empty,
  toolbar,
  onRowClick,
  rowHref,
  rowTone,
  rowAttrs,
  highlight,
  bare,
  dense,
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
  bulkActions?: BulkAction<T>[];
  /** Enables the Export CSV button; the file is `<exportName>.csv`. */
  exportName?: string;
  pageSize?: number;
  initialSort?: { id: string; dir: SortDir };
  /** Starts with this search text (a link from global search). */
  initialQuery?: string;
  loading?: boolean;
  /** Shown when there are no rows at all (not when filters hide them). */
  empty?: ReactNode;
  toolbar?: ReactNode;
  onRowClick?: (row: T) => void;
  /** The row's page. Click opens it; Ctrl/Cmd+click, middle-click or the right-click menu open it in a new workspace tab. */
  rowHref?: (row: T) => string | undefined;
  /** Tint a row that needs attention. */
  rowTone?: (row: T) => 'warning' | 'danger' | undefined;
  /** Marks the row a detail panel is open for. */
  highlight?: (row: T) => boolean;
  /** Extra attributes on a row (data-testid, data-status) for tests and styling hooks. */
  rowAttrs?: (row: T) => Record<`data-${string}`, string | undefined>;
  /** A short, plain list: no search or filter bar (it still sorts, and exports when `exportName` is set). */
  bare?: boolean;
  /** Tighter cell padding, for tables with many columns that must fit without scrolling sideways. */
  dense?: boolean;
  testId?: string;
}) {
  const { t } = useI18n();
  const toast = useToastOptional();
  const [query, setQuery] = useState(initialQuery);
  const [fv, setFv] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ id: string; dir: SortDir } | null>(initialSort ?? null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(pageSize);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  const text = (r: T) =>
    searchText
      ? searchText(r)
      : columns
          .map((c) => (c.csv ? c.csv(r) : c.sort?.(r)))
          .filter((v) => v !== null && v !== undefined)
          .join(' ');

  const filtered = useMemo(() => {
    const active = (filters ?? []).filter((f) => fv[f.id]);
    return rows.filter((r) => active.every((f) => f.match(r, fv[f.id])) && matchesQuery(text(r), query));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filters, fv, query]);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.id === sort?.id);
    return sort && col?.sort ? sortRows(filtered, col.sort, sort.dir) : filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort]);

  const view = paginate(sorted, page, size);
  const filtering = query.trim() !== '' || Object.values(fv).some(Boolean);
  const selectedRows = useMemo(() => rows.filter((r) => picked.has(rowId(r))), [rows, picked, rowId]);
  const pageIds = view.rows.map(rowId);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => picked.has(id));
  const someOnPage = pageIds.some((id) => picked.has(id));

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

  const toggle = (ids: string[], on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const exportCsv = () => {
    const cols = columns.filter((c) => c.csv !== false && (c.csv || c.sort));
    const source = selectedRows.length ? sorted.filter((r) => picked.has(rowId(r))) : sorted;
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

  const router = useRouter();
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
    else if (e.key === 'End') go(view.rows.length - 1);
    else if (e.key === ' ' && selectable) {
      toggle([rowId(row)], !picked.has(rowId(row)));
      e.preventDefault();
    } else if (e.key === 'Enter' && onRowClick) onRowClick(row);
    else if (e.key === 'Enter' && rowHref?.(row)) router.push(rowHref(row)!);
  };

  const clearAll = () => {
    setQuery('');
    setFv({});
    setPage(0);
  };

  if (loading) return <SkeletonTable rows={Math.min(size, 6)} cols={Math.min(columns.length, 5)} />;
  if (rows.length === 0 && empty) return <>{empty}</>;

  const nBulk = selectedRows.length;
  // Rows that open a record get a ⋯ button with the same menu as right-click (Open in new tab, side by side).
  const rowMenu = !!rowHref && !onRowClick;
  const colSpan = columns.length + (selectable ? 1 : 0) + (rowMenu ? 1 : 0);
  const cellPad = dense ? 'px-1.5' : 'px-3.5';
  const showBar = nBulk > 0 || !(bare && !exportName);
  return (
    <div data-testid={testId} className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
      {/* Toolbar, or the bulk bar when rows are selected */}
      {nBulk > 0 ? (
        <div role="toolbar" aria-label={t('ui.table.bulk')} className="flex min-h-14 flex-wrap items-center gap-2 border-b border-border bg-primary px-4 py-2.5 text-primary-foreground">
          <Button size="icon-sm" variant="ghost" onClick={() => setPicked(new Set())} aria-label={t('ui.table.clearSelection')} className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
            <X />
          </Button>
          <span role="status" className="mr-2 text-sm font-bold">
            {t('ui.table.selected', { n: nBulk })}
          </span>
          {nBulk < sorted.length && allOnPage && (
            <Button size="sm" variant="link" onClick={() => setPicked(new Set(sorted.map(rowId)))} className="h-8 px-1 text-primary-foreground underline">
              {t('ui.table.selectAllN', { n: sorted.length })}
            </Button>
          )}
          <div className="flex-1" />
          {(bulkActions ?? []).map((a) => (
            <Button key={a.id} size="sm" variant="outline" onClick={() => a.onClick(selectedRows)} className={cn(onBar, a.tone === 'danger' && 'border-red-soft/60')}>
              {a.icon}
              {a.label}
            </Button>
          ))}
          {exportName && (
            <Button size="sm" variant="outline" onClick={exportCsv} className={onBar}>
              <Download />
              {t('ui.table.export')}
            </Button>
          )}
        </div>
      ) : bare && !exportName ? null : (
        <div role="search" aria-label={label} className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3.5">
          <div className="relative max-w-[320px] flex-[1_1_220px]">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder={t('ui.table.search')}
              aria-label={t('ui.table.searchIn', { name: label })}
              aria-keyshortcuts="/"
              className="h-9 rounded-md bg-background pl-8"
            />
          </div>
          {(filters ?? []).map((f) => (
            <Select
              key={f.id}
              value={fv[f.id] || ALL}
              onValueChange={(v) => {
                setFv({ ...fv, [f.id]: v === ALL ? '' : v });
                setPage(0);
              }}
            >
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
          {filtering && (
            <Button size="sm" variant="ghost" onClick={clearAll} className="h-9">
              <FilterX />
              {t('common.clearFilters')}
            </Button>
          )}
          <div className="flex-1" />
          {toolbar}
          {exportName && (
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={sorted.length === 0} className="h-9 rounded-md">
              <Download />
              {t('ui.table.export')}
            </Button>
          )}
        </div>
      )}

      <Table aria-label={label} aria-rowcount={sorted.length} className={cn(!showBar && 'border-t-0')}>
        <TableHeader className="[&_tr]:border-b-0">
          <TableRow className="hover:bg-transparent">
            {selectable && (
              <TableHead className="h-auto w-12 border-b border-border bg-muted/40 px-3 py-2.5">
                <Checkbox
                  checked={allOnPage ? true : someOnPage ? 'indeterminate' : false}
                  onCheckedChange={(v) => toggle(pageIds, v === true)}
                  aria-label={t('ui.table.selectPage')}
                />
              </TableHead>
            )}
            {columns.map((c) => {
              const active = sort?.id === c.id;
              const Icon = active ? (sort!.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <TableHead
                  key={c.id}
                  aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : c.sort ? 'none' : undefined}
                  style={{ width: c.width }}
                  className={cn('h-auto border-b border-border bg-muted/40 py-2.5 text-[12.5px] font-[550] whitespace-nowrap text-muted-foreground', cellPad, ALIGN[c.align ?? 'left'], c.hideBelow && HIDE[c.hideBelow])}
                >
                  {c.sort ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSort(!active ? { id: c.id, dir: 'asc' } : sort!.dir === 'asc' ? { id: c.id, dir: 'desc' } : null);
                        setPage(0);
                      }}
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
            {rowMenu && <TableHead className="h-auto w-10 border-b border-border bg-muted/40 px-1 py-2.5" aria-label={t('ez.rowMenu')} />}
          </TableRow>
        </TableHeader>
        <TableBody ref={bodyRef} className="[&_tr:last-child>*]:border-b-0">
          {view.rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={colSpan} className="border-0 whitespace-normal">
                <EmptyState dense icon={<SearchX />} title={t('ui.table.noMatch')} actions={filtering ? <Button variant="outline" onClick={clearAll}>{t('common.clearFilters')}</Button> : undefined}>
                  {t('ui.table.noMatchHelp')}
                </EmptyState>
              </TableCell>
            </TableRow>
          ) : (
            view.rows.map((r, i) => {
              const id = rowId(r);
              const on = picked.has(id);
              const tone = rowTone?.(r);
              const selected = on || highlight?.(r) === true;
              return (
                <TableRow
                  key={id}
                  data-row
                  {...rowAttrs?.(r)}
                  data-state={selected ? 'selected' : undefined}
                  tabIndex={0}
                  onKeyDown={(e) => onRowKey(e, r, i)}
                  data-href={rowHref?.(r)}
                  onClick={onRowClick ? () => onRowClick(r) : rowHref?.(r) ? () => router.push(rowHref(r)!) : undefined}
                  aria-selected={selectable ? on : undefined}
                  className={cn(
                    'border-b-0 outline-none hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                    (onRowClick || rowHref) && 'cursor-pointer',
                    selected && 'bg-teal-soft hover:bg-teal-soft data-[state=selected]:bg-teal-soft',
                    tone === 'danger' && 'shadow-[inset_3px_0_0_var(--color-red)]',
                    tone === 'warning' && 'shadow-[inset_3px_0_0_var(--color-amber)]',
                  )}
                >
                  {selectable && (
                    <TableCell className="w-12 border-b border-border px-3 py-2.5">
                      <Checkbox checked={on} onCheckedChange={(v) => toggle([id], v === true)} onClick={(e) => e.stopPropagation()} aria-label={t('ui.table.selectRow')} />
                    </TableCell>
                  )}
                  {columns.map((c) => {
                    const cls = cn('border-b border-border text-[13.5px] align-middle', dense ? 'py-2' : 'py-3', cellPad, ALIGN[c.align ?? 'left'], c.hideBelow && HIDE[c.hideBelow]);
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
                  {rowMenu && (
                    <TableCell className="w-10 border-b border-border px-1 text-right">
                      {rowHref(r) && (
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
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {sorted.length > Math.min(size, 10) || view.pages > 1 ? (
        <nav aria-label={label} className="flex flex-wrap items-center gap-4 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span role="status" aria-live="polite">
            {t('ui.table.range', { from: view.from, to: view.to, total: view.total })}
          </span>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <label htmlFor="kx-dt-size">{t('ui.table.rowsPerPage')}</label>
            <Select
              value={String(size)}
              onValueChange={(v) => {
                setSize(Number(v));
                setPage(0);
              }}
            >
              <SelectTrigger id="kx-dt-size" size="sm" className="w-[76px] rounded-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((n) => (
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
