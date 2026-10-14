// Row selection for the DataTable: pick rows one by one, a whole page, or every row that matches the list
// (including rows on pages not loaded, for server-side lists). Pure functions, so they are unit-tested.

/**
 * `ids`: exactly these rows. `all`: every row matching the list's search and filters, except these.
 * "All" is how a person selects 1,200 students without loading them.
 */
export type Selection = { mode: 'ids'; ids: ReadonlySet<string> } | { mode: 'all'; except: ReadonlySet<string> };

export const NONE: Selection = { mode: 'ids', ids: new Set() };

export function isSelected(s: Selection, id: string): boolean {
  return s.mode === 'ids' ? s.ids.has(id) : !s.except.has(id);
}

/** Selects or clears one row. */
export function toggleRow(s: Selection, id: string, on: boolean): Selection {
  return toggleMany(s, [id], on);
}

/** Selects or clears every row of the current page. */
export function togglePage(s: Selection, pageIds: readonly string[], on: boolean): Selection {
  return toggleMany(s, pageIds, on);
}

function toggleMany(s: Selection, ids: readonly string[], on: boolean): Selection {
  if (s.mode === 'ids') {
    const next = new Set(s.ids);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    return { mode: 'ids', ids: next };
  }
  const except = new Set(s.except);
  for (const id of ids) {
    if (on) except.delete(id);
    else except.add(id);
  }
  return { mode: 'all', except };
}

/** Every row that matches the list. */
export function selectAllMatching(): Selection {
  return { mode: 'all', except: new Set() };
}

/** How many rows are selected, given how many match the list. */
export function selectedCount(s: Selection, total: number): number {
  if (s.mode === 'ids') return s.ids.size;
  return Math.max(0, total - s.except.size);
}

/** The page's header checkbox: all of its rows selected, some, or none. */
export function pageState(s: Selection, pageIds: readonly string[]): 'all' | 'some' | 'none' {
  if (pageIds.length === 0) return 'none';
  const n = pageIds.filter((id) => isSelected(s, id)).length;
  return n === pageIds.length ? 'all' : n > 0 ? 'some' : 'none';
}

/** Offer "Select all N matching" once the whole page is selected and more rows match than are selected. */
export function canSelectAllMatching(s: Selection, pageIds: readonly string[], total: number): boolean {
  return s.mode === 'ids' && pageState(s, pageIds) === 'all' && total > s.ids.size;
}

/** Nothing selected. */
export function isEmpty(s: Selection, total: number): boolean {
  return selectedCount(s, total) === 0;
}

/** What a bulk request names: the chosen ids, or "all matching this list, except…". */
export type BulkTarget = { ids: string[] } | { all: true; except: string[] };

export function toTarget(s: Selection): BulkTarget {
  return s.mode === 'ids' ? { ids: [...s.ids] } : { all: true, except: [...s.except] };
}

/** The selected rows among those loaded (all of them for a list held in memory). */
export function pickRows<T>(s: Selection, rows: readonly T[], rowId: (r: T) => string): T[] {
  return rows.filter((r) => isSelected(s, rowId(r)));
}
