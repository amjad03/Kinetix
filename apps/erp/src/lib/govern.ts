// Shapes from the audit-log, custom report, connector and alumni giving endpoints (services/api), and the text formats their forms read.

export interface AuditItem {
  id: number;
  at: string;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  subjectType: string | null;
  subjectId: string | null;
  data: unknown;
}
export interface AuditPage {
  items: AuditItem[];
  total: number;
  limit: number;
  offset: number;
}

export const AUDIT_PAGE_SIZE = 50;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuditSearch {
  action?: string;
  subjectType?: string;
  subjectId?: string;
  actorId?: string;
  from?: string;
  to?: string;
  page?: string;
}

/** The filters of the audit page as an API query; anything malformed is dropped rather than sent. */
export function auditParams(sp: AuditSearch): URLSearchParams {
  const q = new URLSearchParams();
  const text = (k: 'action' | 'subjectType', max: number) => {
    const v = sp[k]?.trim();
    if (v && v.length <= max && /^[\w.*:-]+$/.test(v)) q.set(k, v);
  };
  text('action', 120);
  text('subjectType', 80);
  if (sp.subjectId && UUID.test(sp.subjectId)) q.set('subjectId', sp.subjectId);
  if (sp.actorId && UUID.test(sp.actorId)) q.set('actorId', sp.actorId);
  if (sp.from && DAY.test(sp.from)) q.set('from', sp.from);
  if (sp.to && DAY.test(sp.to)) q.set('to', sp.to);
  return q;
}

export const auditPageNo = (page: string | undefined): number => (page && /^\d{1,5}$/.test(page) && Number(page) >= 1 ? Number(page) : 1);

/** The download link of the filtered log (the ERP's export route forwards it with the person's session). */
export const auditExportPath = (q: URLSearchParams) => `/api/export?path=${encodeURIComponent(`/v1/audit/export${q.toString() ? `?${q}` : ''}`)}`;

// ----- custom reports ---------------------------------------------------------------------------------

export type FieldType = 'text' | 'int' | 'number' | 'money' | 'date' | 'bool';
export interface DatasetMeta {
  key: string;
  label: string;
  description: string;
  fields: { key: string; label: string; type: FieldType }[];
}
export interface Definition {
  columns: string[];
  filters: { field: string; op: string; value?: string | number | boolean | (string | number)[] }[];
  groupBy: string[];
  aggregates: { fn: string; field?: string }[];
  sort: { field: string; dir: 'asc' | 'desc' }[];
  limit: number;
}
export interface SavedReport {
  id: string;
  name: string;
  description: string;
  dataset: string;
  definition: Definition;
  createdBy: string;
  schedule: { id: string; frequency: string; recipients: string[]; active: boolean; nextRunAt: string } | null;
}
export interface CustomResult {
  columns: { key: string; label: string; kind?: string }[];
  rows: Record<string, string | number | null>[];
  truncated: boolean;
}

export const OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'is_null', 'not_null'] as const;
const list = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

type Parsed<T> = { ok: true; value: T } | { ok: false; line: string };

/** Reads the builder's text boxes: columns "a, b"; aggregates "count, sum:amount"; filters "amount gte 5000" per line; sort "sum_amount desc". */
export function parseDefinition(v: { columns?: string; groupBy?: string; aggregates?: string; filters?: string; sort?: string; limit?: string }): Parsed<Definition> {
  const aggregates: Definition['aggregates'] = [];
  for (const a of list(v.aggregates ?? '')) {
    const [fn, field] = a.split(':').map((x) => x.trim());
    if (!['count', 'sum', 'avg', 'min', 'max'].includes(fn)) return { ok: false, line: a };
    aggregates.push(field ? { fn, field } : { fn });
  }
  const filters: Definition['filters'] = [];
  for (const line of (v.filters ?? '').split('\n').map((l) => l.trim()).filter(Boolean)) {
    const m = /^([a-z_]+)\s+([a-z_]+)(?:\s+(.*))?$/.exec(line);
    if (!m || !(OPS as readonly string[]).includes(m[2])) return { ok: false, line };
    const [, field, op, raw] = m;
    if (op === 'is_null' || op === 'not_null') filters.push({ field, op });
    else if (raw === undefined || raw === '') return { ok: false, line };
    else if (op === 'in') filters.push({ field, op, value: list(raw) });
    else filters.push({ field, op, value: raw === 'true' ? true : raw === 'false' ? false : raw.trim() });
  }
  const sort: Definition['sort'] = [];
  for (const s of list(v.sort ?? '')) {
    const [field, dir = 'asc'] = s.split(/\s+/);
    if (!/^[a-z_]+$/.test(field) || (dir !== 'asc' && dir !== 'desc')) return { ok: false, line: s };
    sort.push({ field, dir });
  }
  const limit = v.limit?.trim() ? Number(v.limit) : 1000;
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) return { ok: false, line: v.limit ?? '' };
  return { ok: true, value: { columns: list(v.columns ?? ''), filters, groupBy: list(v.groupBy ?? ''), aggregates, sort, limit } };
}

export const formatList = (a: string[]) => a.join(', ');
export const formatAggregates = (a: Definition['aggregates']) => a.map((x) => (x.field ? `${x.fn}:${x.field}` : x.fn)).join(', ');
export const formatFilters = (f: Definition['filters']) => f.map((x) => [x.field, x.op, Array.isArray(x.value) ? x.value.join(', ') : x.value === undefined ? '' : String(x.value)].filter((p) => p !== '').join(' ')).join('\n');
export const formatSort = (s: Definition['sort']) => s.map((x) => `${x.field} ${x.dir}`).join(', ');

export const customExportPath = (id: string) => `/api/export?path=${encodeURIComponent(`/v1/analytics/custom-reports/${id}/export?format=csv`)}`;

// ----- connectors -------------------------------------------------------------------------------------

export interface ConnectorField {
  key: string;
  label: string;
  kind: 'text' | 'url' | 'secret' | 'select' | 'events';
  required: boolean;
  options?: string[];
}
export interface ConnectorTypeMeta {
  type: string;
  label: string;
  description: string;
  available: boolean;
  fields: ConnectorField[];
}
export interface ConnectorRow {
  id: string;
  type: string;
  typeLabel: string;
  name: string;
  enabled: boolean;
  available: boolean;
  config: Record<string, unknown>;
  secretsSet: string[];
  lastTestAt: string | null;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
}
export interface DeliveryRow {
  id: string;
  eventType: string;
  status: 'pending' | 'delivered' | 'retrying' | 'dead';
  attempts: number;
  responseStatus: number | null;
  lastError: string | null;
  nextAttemptAt: string;
  createdAt: string;
}

/** Form values to a connector's settings: secrets left empty are left out (the API keeps the stored one); events one per line. */
export function connectorConfig(fields: ConnectorField[], v: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = (v[`c_${f.key}`] ?? '').trim();
    if (f.kind === 'events') out[f.key] = raw.split(/[\s,]+/).filter(Boolean);
    else if (raw) out[f.key] = raw;
  }
  return out;
}

// ----- alumni giving ----------------------------------------------------------------------------------

export interface CampaignRow {
  id: string;
  name: string;
  description: string;
  goalPaise: number;
  status: 'active' | 'closed';
  receiptNote: string;
  raisedPaise: number;
  donations: number;
  donors: number;
  pledgedOpenPaise: number;
  percent: number | null;
  startsOn: string | null;
  endsOn: string | null;
}
export interface DonationRow {
  id: string;
  campaignId: string;
  donorName: string;
  amountPaise: number;
  mode: string;
  reference: string | null;
  receivedOn: string;
  receiptSerial: string;
}
export interface OpportunityRow {
  id: string;
  title: string;
  description: string;
  startsOn: string | null;
  slots: number | null;
  status: 'open' | 'closed';
  signups: { alumniId: string; fullName: string; note: string }[];
}
export interface AlumniOption {
  id: string;
  fullName: string;
  graduationYear: number;
}

export const receiptPath = (donationId: string) => `/api/export?path=${encodeURIComponent(`/v1/alumni/donations/${donationId}/receipt`)}`;
export const DONATION_MODES = ['cash', 'cheque', 'upi', 'bank_transfer', 'card', 'other'] as const;
