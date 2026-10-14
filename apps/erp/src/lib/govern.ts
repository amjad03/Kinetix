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
