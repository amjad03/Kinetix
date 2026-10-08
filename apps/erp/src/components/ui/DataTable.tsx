'use client';

import Close from '@mui/icons-material/Close';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import FilterListOff from '@mui/icons-material/FilterListOff';
import KeyboardArrowLeft from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import SearchOff from '@mui/icons-material/SearchOff';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { EmptyState } from '@/components/States';
import { useI18n } from '@/i18n/client';
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

const HIDE = { sm: 'sm', md: 'md', lg: 'lg' } as const;

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
  rowTone,
  rowAttrs,
  highlight,
  bare,
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
  /** Tint a row that needs attention. */
  rowTone?: (row: T) => 'warning' | 'danger' | undefined;
  /** Marks the row a detail panel is open for. */
  highlight?: (row: T) => boolean;
  /** Extra attributes on a row (data-testid, data-status) for tests and styling hooks. */
  rowAttrs?: (row: T) => Record<`data-${string}`, string | undefined>;
  /** A short, plain list: no search or filter bar (it still sorts, and exports when `exportName` is set). */
  bare?: boolean;
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
  };

  const clearAll = () => {
    setQuery('');
    setFv({});
    setPage(0);
  };

  if (loading) return <SkeletonTable rows={Math.min(size, 6)} cols={Math.min(columns.length, 5)} />;
  if (rows.length === 0 && empty) return <>{empty}</>;

  const nBulk = selectedRows.length;
  const colSpan = columns.length + (selectable ? 1 : 0);
  return (
    <Box data-testid={testId} sx={{ border: 1, borderColor: 'm3.outlineVariant', borderRadius: '16px', bgcolor: 'kx.pane', overflow: 'hidden', boxShadow: 'var(--kx-elev-card)' }}>
      {/* Toolbar, or the bulk bar when rows are selected */}
      {nBulk > 0 ? (
        <Box role="toolbar" aria-label={t('ui.table.bulk')} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, px: 2, py: 1, minHeight: 56, bgcolor: 'm3.primaryContainer', color: 'm3.onPrimaryContainer' }}>
          <IconButton size="small" onClick={() => setPicked(new Set())} aria-label={t('ui.table.clearSelection')} sx={{ color: 'inherit' }}>
            <Close fontSize="small" />
          </IconButton>
          <Typography variant="body2" role="status" sx={{ fontWeight: 700, mr: 1 }}>
            {t('ui.table.selected', { n: nBulk })}
          </Typography>
          {nBulk < sorted.length && allOnPage && (
            <Button size="small" onClick={() => setPicked(new Set(sorted.map(rowId)))} sx={{ color: 'inherit', textDecoration: 'underline' }}>
              {t('ui.table.selectAllN', { n: sorted.length })}
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          {(bulkActions ?? []).map((a) => (
            <Button key={a.id} size="small" variant="outlined" startIcon={a.icon} color={a.tone === 'danger' ? 'error' : 'inherit'} onClick={() => a.onClick(selectedRows)} sx={{ borderColor: 'currentColor' }}>
              {a.label}
            </Button>
          ))}
          {exportName && (
            <Button size="small" variant="outlined" startIcon={<FileDownloadOutlined />} onClick={exportCsv} color="inherit" sx={{ borderColor: 'currentColor' }}>
              {t('ui.table.export')}
            </Button>
          )}
        </Box>
      ) : bare && !exportName ? null : (
        <Box role="search" aria-label={label} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, minHeight: 56 }}>
          <TextField
            size="small"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            inputRef={searchRef}
            placeholder={t('ui.table.search')}
            slotProps={{
              htmlInput: { 'aria-label': t('ui.table.searchIn', { name: label }), 'aria-keyshortcuts': '/' },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ width: { xs: '100%', sm: 280 } }}
          />
          {(filters ?? []).map((f) => (
            <TextField
              key={f.id}
              select
              size="small"
              value={fv[f.id] ?? ''}
              onChange={(e) => {
                setFv({ ...fv, [f.id]: e.target.value });
                setPage(0);
              }}
              label={f.label}
              sx={{ minWidth: 150, width: { xs: '100%', sm: 'auto' } }}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            >
              <MenuItem value="">{t('ui.table.all')}</MenuItem>
              {f.options.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
          ))}
          {filtering && (
            <Button size="small" startIcon={<FilterListOff />} onClick={clearAll}>
              {t('common.clearFilters')}
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          {toolbar}
          {exportName && (
            <Button size="small" variant="outlined" startIcon={<FileDownloadOutlined />} onClick={exportCsv} disabled={sorted.length === 0}>
              {t('ui.table.export')}
            </Button>
          )}
        </Box>
      )}

      <Box sx={{ overflowX: 'auto', borderTop: bare && !exportName && nBulk === 0 ? 0 : 1, borderColor: 'm3.outlineVariant' }}>
        <Table size="small" aria-label={label} aria-rowcount={sorted.length} sx={{ '& .MuiTableRow-root:last-of-type > .MuiTableCell-body': { borderBottom: 0 } }}>
          <TableHead>
            <TableRow>
              {selectable && (
                <TableCell padding="checkbox" sx={{ bgcolor: 'm3.surfaceContainerLow', width: 48 }}>
                  <Checkbox size="small" checked={allOnPage} indeterminate={!allOnPage && someOnPage} onChange={(e) => toggle(pageIds, e.target.checked)} slotProps={{ input: { 'aria-label': t('ui.table.selectPage') } }} />
                </TableCell>
              )}
              {columns.map((c) => {
                const active = sort?.id === c.id;
                return (
                  <TableCell
                    key={c.id}
                    align={c.align}
                    aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : c.sort ? 'none' : undefined}
                    sx={{ bgcolor: 'm3.surfaceContainerLow', width: c.width, display: c.hideBelow ? { xs: 'none', [HIDE[c.hideBelow]]: 'table-cell' } : undefined }}
                  >
                    {c.sort ? (
                      <TableSortLabel
                        active={active}
                        direction={active ? sort!.dir : 'asc'}
                        onClick={() => {
                          setSort(!active ? { id: c.id, dir: 'asc' } : sort!.dir === 'asc' ? { id: c.id, dir: 'desc' } : null);
                          setPage(0);
                        }}
                      >
                        {c.header}
                      </TableSortLabel>
                    ) : (
                      c.header
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>
          <TableBody ref={bodyRef}>
            {view.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} sx={{ border: 0 }}>
                  <EmptyState dense icon={<SearchOff />} title={t('ui.table.noMatch')} actions={filtering ? <Button onClick={clearAll}>{t('common.clearFilters')}</Button> : undefined}>
                    {t('ui.table.noMatchHelp')}
                  </EmptyState>
                </TableCell>
              </TableRow>
            ) : (
              view.rows.map((r, i) => {
                const id = rowId(r);
                const on = picked.has(id);
                const tone = rowTone?.(r);
                return (
                  <TableRow
                    key={id}
                    data-row
                    {...rowAttrs?.(r)}
                    hover
                    selected={on || highlight?.(r) === true}
                    tabIndex={0}
                    onKeyDown={(e) => onRowKey(e, r, i)}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                    aria-selected={selectable ? on : undefined}
                    sx={{ cursor: onRowClick ? 'pointer' : undefined, '&:focus-visible': { outline: '2px solid var(--kx-palette-m3-primary)', outlineOffset: -2 }, ...(tone && { boxShadow: `inset 3px 0 0 var(--kx-palette-${tone === 'danger' ? 'm3-error' : 'kx-warning'})` }) }}
                  >
                    {selectable && (
                      <TableCell padding="checkbox">
                        <Checkbox size="small" checked={on} onChange={(e) => toggle([id], e.target.checked)} onClick={(e) => e.stopPropagation()} slotProps={{ input: { 'aria-label': t('ui.table.selectRow') } }} />
                      </TableCell>
                    )}
                    {columns.map((c) => (
                      <TableCell key={c.id} align={c.align} component={c.rowHeader ? 'th' : 'td'} scope={c.rowHeader ? 'row' : undefined} sx={{ fontWeight: c.rowHeader ? 600 : undefined, display: c.hideBelow ? { xs: 'none', [HIDE[c.hideBelow]]: 'table-cell' } : undefined }}>
                        {c.cell(r)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Box>

      {sorted.length > Math.min(size, 10) || view.pages > 1 ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 2, px: 2, py: 1, borderTop: 1, borderColor: 'm3.outlineVariant', color: 'text.secondary' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" component="label" htmlFor="kx-dt-size">
              {t('ui.table.rowsPerPage')}
            </Typography>
            <TextField
              select
              size="small"
              value={size}
              onChange={(e) => {
                setSize(Number(e.target.value));
                setPage(0);
              }}
              slotProps={{ htmlInput: { id: 'kx-dt-size' } }}
              sx={{ width: 76, '& .MuiSelect-select': { py: 0.5 } }}
            >
              {[10, 25, 50, 100].map((n) => (
                <MenuItem key={n} value={n}>
                  {n}
                </MenuItem>
              ))}
            </TextField>
          </Box>
          <Typography variant="caption" role="status" aria-live="polite">
            {t('ui.table.range', { from: view.from, to: view.to, total: view.total })}
          </Typography>
          <Box>
            <IconButton size="small" onClick={() => setPage(view.page - 1)} disabled={view.page === 0} aria-label={t('ui.table.prev')}>
              <KeyboardArrowLeft />
            </IconButton>
            <IconButton size="small" onClick={() => setPage(view.page + 1)} disabled={view.page >= view.pages - 1} aria-label={t('ui.table.next')}>
              <KeyboardArrowRight />
            </IconButton>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
