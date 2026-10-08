// Pure helpers behind the DataTable: sort, filter, paginate and export. No React, so they are unit-tested.

export type SortDir = 'asc' | 'desc';
export type Cell = string | number | boolean | null | undefined;

/** Locale-aware, numeric-aware comparison; empty values sort last in both directions. */
export function compareCells(a: Cell, b: Cell, dir: SortDir = 'asc'): number {
  const emptyA = a === null || a === undefined || a === '';
  const emptyB = b === null || b === undefined || b === '';
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
  const sign = dir === 'asc' ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * sign;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }) * sign;
}

/** A stable sort by one value per row. */
export function sortRows<T>(rows: readonly T[], value: ((row: T) => Cell) | undefined, dir: SortDir): T[] {
  if (!value) return [...rows];
  return rows
    .map((row, i) => ({ row, i, v: value(row) }))
    .sort((x, y) => compareCells(x.v, y.v, dir) || x.i - y.i)
    .map((x) => x.row);
}

/** Every word of the query must appear (case-insensitive) somewhere in the row's text. */
export function matchesQuery(text: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = text.toLowerCase();
  return words.every((w) => hay.includes(w));
}

export interface Page<T> {
  rows: T[];
  page: number;
  pages: number;
  from: number;
  to: number;
  total: number;
}

/** One page of rows; `page` is 0-based and clamped to what exists. */
export function paginate<T>(rows: readonly T[], page: number, size: number): Page<T> {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(0, page), pages - 1);
  const start = p * size;
  const slice = rows.slice(start, start + size);
  return { rows: slice, page: p, pages, from: total === 0 ? 0 : start + 1, to: start + slice.length, total };
}

/** One CSV field: quoted when it has a comma, quote or line break; formulas are defused (CSV injection). */
export function csvField(v: Cell): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: readonly string[], rows: readonly (readonly Cell[])[]): string {
  return [header, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n');
}
