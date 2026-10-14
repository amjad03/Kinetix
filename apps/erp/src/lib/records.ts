// The record depth kit on the ERP side: the list state kept in the page URL, the API's shapes, and links for
// exports and import templates. Pure, so it is unit-tested. See docs/requirements/RECORD_DEPTH_KIT.md.
import type { BulkTarget } from './selection';

export type SortDir = 'asc' | 'desc';
/** A kit list row: its fields, its id and `_label`, the record's name ("R12 Asha Rao"). */
export type Row = Record<string, unknown> & { id: string; _label?: string };

/** What a list shows; it lives in the page URL (`q`, `sort=name:asc`, `page`, `pageSize`, `f.<filter>`), so links and Back work. */
export interface ListState {
  q: string;
  filters: Record<string, string>;
  sort: { id: string; dir: SortDir } | null;
  page: number;
  pageSize: number;
}

export const PAGE_SIZES = [10, 25, 50, 100, 200] as const;
export const ENTITY_KEY = /^[a-z][a-z0-9-]{1,40}$/;
const FILTER_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/;

type Params = Record<string, string | string[] | undefined> | URLSearchParams;
const one = (sp: Params, k: string): string | undefined => {
  if (sp instanceof URLSearchParams) return sp.get(k) ?? undefined;
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v;
};
const entries = (sp: Params): [string, string][] => (sp instanceof URLSearchParams ? [...sp.entries()] : Object.entries(sp).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? (v[0] ?? '') : v] as [string, string]])));

/** Reads the list state from the page's search params, ignoring anything malformed. */
export function readListState(sp: Params, defaults: { pageSize?: number } = {}): ListState {
  const filters: Record<string, string> = {};
  for (const [k, v] of entries(sp)) if (k.startsWith('f.') && FILTER_KEY.test(k.slice(2)) && v) filters[k.slice(2)] = v.slice(0, 200);
  const [id, dir] = (one(sp, 'sort') ?? '').split(':');
  const page = Number(one(sp, 'page'));
  const size = Number(one(sp, 'pageSize'));
  return {
    q: (one(sp, 'q') ?? '').slice(0, 200),
    filters,
    sort: id && /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(id) ? { id, dir: dir === 'desc' ? 'desc' : 'asc' } : null,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : (defaults.pageSize ?? 25),
  };
}

/** The list state as search params (defaults left out, so URLs stay short). `extra` keeps the page's own params (a tab). */
export function listSearch(state: Partial<ListState>, extra: Record<string, string> = {}): URLSearchParams {
  const sp = new URLSearchParams(extra);
  if (state.q) sp.set('q', state.q);
  if (state.sort) sp.set('sort', `${state.sort.id}:${state.sort.dir}`);
  for (const [k, v] of Object.entries(state.filters ?? {})) if (v) sp.set(`f.${k}`, v);
  if (state.page && state.page > 1) sp.set('page', String(state.page));
  if (state.pageSize && state.pageSize !== 25) sp.set('pageSize', String(state.pageSize));
  return sp;
}

/** The API path of one page of a kit list. */
export function apiListPath(entity: string, state: ListState): string {
  const sp = listSearch(state);
  sp.set('page', String(state.page));
  sp.set('pageSize', String(state.pageSize));
  return `/v1/records/${entity}?${sp.toString()}`;
}

/** A download through the ERP (the session token stays on the server): the list as CSV or Excel, or the import template. */
export function exportHref(entity: string, state: Pick<ListState, 'q' | 'filters' | 'sort'>, format: 'csv' | 'xlsx', opts: { columns?: string[]; ids?: string[]; except?: string[] } = {}): string {
  const sp = listSearch({ q: state.q, filters: state.filters, sort: state.sort });
  sp.set('entity', entity);
  sp.set('kind', 'export');
  sp.set('format', format);
  if (opts.columns?.length) sp.set('columns', opts.columns.join(','));
  if (opts.ids?.length) sp.set('ids', opts.ids.join(','));
  if (opts.except?.length) sp.set('except', opts.except.join(','));
  return `/api/records?${sp.toString()}`;
}

export const templateHref = (entity: string) => `/api/records?entity=${encodeURIComponent(entity)}&kind=template`;

/** A bulk request for the selection: chosen ids, or every row matching the list now shown (less the ones cleared). */
export function bulkTarget(target: BulkTarget, state: Pick<ListState, 'q' | 'filters' | 'sort'>) {
  return 'ids' in target ? { ids: target.ids } : { all: true as const, query: { q: state.q || undefined, filters: state.filters, sort: state.sort }, except: target.except };
}

/** Whether a saved view's state is what the list shows now (for "modified" in the views menu). */
export function sameView(a: SavedViewState, b: SavedViewState): boolean {
  const norm = (s: SavedViewState) =>
    JSON.stringify({ q: s.q ?? '', filters: Object.fromEntries(Object.entries(s.filters ?? {}).filter(([, v]) => v).sort()), sort: s.sort ?? null, columns: s.columns ?? null, density: s.density ?? 'comfortable', pageSize: s.pageSize ?? 25 });
  return norm(a) === norm(b);
}

// ---- the API's shapes ---------------------------------------------------------------------------

export interface FieldOption {
  value: string;
  label: string;
  group?: string;
}

export interface RecordField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'boolean' | 'date' | 'email' | 'phone';
  required: boolean;
  create: boolean;
  edit: boolean;
  bulk: boolean;
  help: string | null;
  rowKey: string;
  options: FieldOption[] | null;
}

export interface RecordMeta {
  key: string;
  module: string;
  subjectType: string;
  can: { write: boolean; import: boolean; reorder: boolean; duplicate: boolean; move: boolean; create: boolean };
  fields: RecordField[];
  filters: { key: string; label: string; options: FieldOption[] | null }[];
  sorts: string[];
  defaultSort: { id: string; dir: SortDir };
  columns: { key: string; header: string }[];
  move: { label: string; reason: boolean; options: FieldOption[] } | null;
  order: { scope: string[] } | null;
  actions: { key: string; label: string; tone: 'danger' | null; inputs?: ActionInput[] }[];
  import: { columns: { key: string; header: string; required: boolean; help: string | null }[]; key: string[] } | null;
}

/** A value asked for before a module action runs (money is typed in rupees and sent in paise). */
export interface ActionInput {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'money';
  required?: boolean;
  help?: string;
}

export interface RecordsPage<R = Row> {
  rows: R[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BulkRowResult {
  id: string;
  label: string;
  ok: boolean;
  message?: string;
  code?: string;
}

export interface BulkReport {
  op: 'update' | 'delete' | 'move' | 'action';
  atomic: boolean;
  committed: boolean;
  total: number;
  succeeded: number;
  failed: number;
  rows: BulkRowResult[];
}

export interface HistoryEntry {
  id: number;
  at: string;
  action: string;
  actor: { id: string | null; name: string | null; type: string };
  changes: { field: string; label: string; before: unknown; after: unknown }[];
  data: Record<string, unknown> | null;
}

export type ImportRowStatus = 'created' | 'updated' | 'skipped' | 'error';

export interface ImportBatch {
  id: string;
  entity: string;
  fileName: string;
  mode: 'insert' | 'upsert';
  status: 'validated' | 'committed' | 'failed';
  columns: string[];
  ignored: string[];
  totals: Record<ImportRowStatus | 'rows', number>;
  rows: { row: number; status: ImportRowStatus; message: string; code?: string; detail?: string; values: Record<string, string> }[];
  createdAt: string;
  committedAt: string | null;
  committed?: boolean;
}

export interface BinEntry {
  id: string;
  entity: string;
  module: string;
  label: string;
  recordId: string;
  rowCount: number;
  deletedAt: string;
  deletedBy: { id: string; name: string } | null;
  purgeOn: string;
}

export interface BinPage {
  rows: BinEntry[];
  total: number;
  page: number;
  pageSize: number;
  retentionDays: number;
  modules: string[];
  entities: { key: string; module: string }[];
}

export interface BinResult {
  id: string;
  label: string;
  ok: boolean;
  message?: string;
  code?: string;
}

export interface SavedViewState {
  q?: string;
  filters?: Record<string, string>;
  sort?: { id: string; dir: SortDir } | null;
  columns?: string[];
  density?: 'comfortable' | 'compact';
  pageSize?: number;
}

export interface SavedView {
  id: string;
  page: string;
  name: string;
  state: SavedViewState;
  sharedRoles: string[];
  isDefault: boolean;
  mine: boolean;
  owner?: string;
}

/** A value as text in history and reports. */
export function displayValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  if (Array.isArray(v)) return v.map(displayValue).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Option labels by value, for showing a field's value ("BCom Sem 3 A" for a class id). */
export function optionLabel(options: FieldOption[] | null | undefined, v: unknown): string {
  const hit = options?.find((o) => o.value === String(v));
  return hit ? hit.label : displayValue(v);
}

/** The form's text back to the value the API expects for the field type. */
export function fieldValue(type: RecordField['type'], text: string): unknown {
  if (type === 'number') return text.trim() === '' ? null : Number(text);
  if (type === 'boolean') return text === 'true';
  if (text === '' && type !== 'text' && type !== 'textarea') return null;
  return text;
}
