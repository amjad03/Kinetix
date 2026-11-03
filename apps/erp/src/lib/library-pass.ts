// The library production pass in the ERP: the API paths its desks may call, the files they may fetch, the OPAC's
// URL state and facets, and the kiosk's steps. Pure, so the pages, components and tests share them.

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** POSTs the library's desks and reports may send besides the shared desk paths. */
export const LIBRARY_PASS_POSTS = new RegExp(`^/v1/library/(overdue-notices/run|members/${UUID}/fines-to-fees|exits/staff/${UUID}/clear|reservations|reservations/${UUID}/cancel|loans/${UUID}/renew)$`);

export const isLibraryPassPost = (path: string) => typeof path === 'string' && LIBRARY_PASS_POSTS.test(path);

/** GETs the desk may read: the rules a member gets for a material. */
export const LIBRARY_PASS_READS = /^\/v1\/library\/rules\/preview\?memberCode=[A-Za-z0-9%._-]{1,80}&material=(book|reference|thesis|cd|map|other)$/;

export const isLibraryPassRead = (path: string) => typeof path === 'string' && LIBRARY_PASS_READS.test(path);

/** Accession numbers as people type them (ACC-0001); anything else is left out of a file request. */
const ACCESSION = /^[A-Za-z0-9/-]{1,40}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The label sheet or RFID list for a range of accession numbers, or copies acquired since a day. */
export function copyFileQuery(input: { from?: string; to?: string; since?: string; kind?: string }): string {
  const q = new URLSearchParams();
  const from = (input.from ?? '').trim();
  const to = (input.to ?? '').trim();
  const since = (input.since ?? '').trim();
  if (from && ACCESSION.test(from)) q.set('from', from);
  if (to && ACCESSION.test(to)) q.set('to', to);
  if (since && DAY.test(since)) q.set('since', since);
  if (input.kind && ['both', 'spine', 'barcode'].includes(input.kind)) q.set('kind', input.kind);
  return q.toString();
}

/** The library files the ERP fetches for the browser: a purchase order, copy labels and the RFID encoding list. */
export function libraryFilePath(kind: string, id: string, params: URLSearchParams): string | null {
  const uuid = new RegExp(`^${UUID}$`, 'i');
  if (kind === 'library-po') return uuid.test(id) ? `/v1/library/purchase-orders/${id}/pdf` : null;
  if (kind === 'copy-labels' || kind === 'rfid-list') {
    const q = copyFileQuery({ from: params.get('from') ?? '', to: params.get('to') ?? '', since: params.get('since') ?? '', kind: params.get('labels') ?? '' });
    return `/v1/library/copies/${kind === 'copy-labels' ? 'labels.pdf' : 'rfid.csv'}${q ? `?${q}` : ''}`;
  }
  return null;
}

/** The record lists whose rows offer a file: the purchase order's printable sheet. */
export const ROW_FILES: Record<string, string> = { 'library-purchase-orders': 'library-po' };

// ---- OPAC ---------------------------------------------------------------------------------------------------------------

export const OPAC_FIELDS = ['any', 'title', 'author', 'subject', 'isbn'] as const;
export const OPAC_SORTS = ['title', 'author', 'year', 'newest'] as const;
export const OPAC_FACETS = ['subject', 'material', 'language', 'author', 'decade', 'branch'] as const;
export type OpacFacet = (typeof OPAC_FACETS)[number];

export interface OpacState {
  q: string;
  field: (typeof OPAC_FIELDS)[number];
  sort: (typeof OPAC_SORTS)[number];
  available: boolean;
  page: number;
  facets: Partial<Record<OpacFacet, string>>;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** The OPAC's state from the page's URL; unknown or malformed values fall back to the defaults. */
export function opacState(sp: Record<string, string | string[] | undefined>): OpacState {
  const field = one(sp.field) as OpacState['field'];
  const sort = one(sp.sort) as OpacState['sort'];
  const page = Number(one(sp.page));
  const facets: OpacState['facets'] = {};
  for (const f of OPAC_FACETS) {
    const v = one(sp[f]).trim().slice(0, 200);
    if (!v) continue;
    if (f === 'decade' && !/^\d{4}$/.test(v)) continue;
    if (f === 'branch' && !new RegExp(`^${UUID}$`, 'i').test(v)) continue;
    facets[f] = v;
  }
  return {
    q: one(sp.q).trim().slice(0, 200),
    field: OPAC_FIELDS.includes(field) ? field : 'any',
    sort: OPAC_SORTS.includes(sort) ? sort : 'title',
    available: one(sp.available) === 'true',
    page: Number.isInteger(page) && page >= 1 && page <= 500 ? page : 1,
    facets,
  };
}

/** The OPAC API query for a state. */
export function opacApiQuery(s: OpacState): string {
  const q = new URLSearchParams();
  if (s.q) q.set('q', s.q);
  if (s.field !== 'any') q.set('field', s.field);
  if (s.sort !== 'title') q.set('sort', s.sort);
  if (s.available) q.set('available', 'true');
  if (s.page > 1) q.set('page', String(s.page));
  for (const [k, v] of Object.entries(s.facets)) if (v) q.set(k, v);
  return q.toString();
}

/** The page link for a state with some values changed (a facet set to '' is cleared); a new choice goes back to page 1. */
export function opacHref(s: OpacState, change: Partial<Omit<OpacState, 'facets'>> & { facets?: Partial<Record<OpacFacet, string>> } = {}): string {
  const facets = { ...s.facets, ...(change.facets ?? {}) };
  const next: OpacState = { ...s, ...change, facets, page: change.page ?? 1 };
  for (const k of Object.keys(facets) as OpacFacet[]) if (!facets[k]) delete next.facets[k];
  const q = opacApiQuery(next);
  return `/library/opac${q ? `?${q}` : ''}`;
}

// ---- kiosk ----------------------------------------------------------------------------------------------------------------

/** The kiosk forgets the reader after this long without a scan, so the next person starts fresh. */
export const KIOSK_IDLE_MS = 45_000;

/** Tags read by an RFID pad or typed: split, de-duplicated, at most 10 at a time (a reader's limit). */
export function kioskTags(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^[A-Za-z0-9/._-]{1,60}$/.test(x)))].slice(0, 10);
}
