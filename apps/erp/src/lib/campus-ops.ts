// Pure helpers behind the admissions and campus-operations record pages, reports and settings
// (API: services/api/src/campus-ops). Kept free of React so they can be unit-tested.
import type { Tone } from '@/components/ui/Badge';

export const OPS_MODULES = ['admissions', 'library', 'hostel', 'transport', 'canteen', 'inventory', 'assets', 'procurement'] as const;
export type OpsModule = (typeof OPS_MODULES)[number];
export const isOpsModule = (m: string): m is OpsModule => (OPS_MODULES as readonly string[]).includes(m);

export const RECORD_KINDS = ['enquiry', 'application', 'cycle', 'book', 'loan', 'stock-check', 'hostel-block', 'hostel-room', 'gate-pass', 'hostel-complaint', 'route', 'vehicle', 'driver', 'trip', 'canteen-item', 'item', 'store', 'vendor', 'requisition', 'rfq', 'purchase-order', 'invoice', 'asset'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];
export const isRecordKind = (k: string): k is RecordKind => (RECORD_KINDS as readonly string[]).includes(k);

export const recordHref = (kind: RecordKind, id: string) => `/records/${kind}/${id}`;

export interface OpsRecord {
  kind: RecordKind;
  module: OpsModule;
  id: string;
  title: string;
  record: Record<string, unknown>;
  related: { key: string; count: number; rows: Record<string, unknown>[] }[];
  activity: { id: number; action: string; at: string; actor: string | null; data: unknown }[];
}

/** The record's workflow status: `status`, an enquiry's `stage`, or open/returned for a loan. */
export function statusOf(kind: RecordKind, r: Record<string, unknown>): string | undefined {
  if (typeof r.status === 'string') return r.status;
  if (typeof r.stage === 'string') return r.stage;
  if (kind === 'loan') return r.returned_at ? 'returned' : 'open';
  if (typeof r.active === 'boolean') return r.active ? 'active' : 'inactive';
  return undefined;
}

const GOOD = ['approved', 'paid', 'closed', 'resolved', 'received', 'returned', 'active', 'enrolled', 'accepted', 'converted', 'awarded', 'matched', 'verified', 'allotted', 'ok', 'open_ok'];
const WAIT = ['submitted', 'requested', 'pending', 'open', 'under_review', 'in_progress', 'issued', 'partially_received', 'mismatch', 'offered', 'waitlisted', 'new', 'contacted', 'counselling', 'applied', 'eligible', 'out', 'running', 'correction_requested', 'reorder'];
const BAD = ['rejected', 'cancelled', 'declined', 'ineligible', 'lost', 'withdrawn', 'inactive', 'disposed'];
export function toneOf(status: string | undefined): Tone {
  if (!status) return 'neutral';
  if (GOOD.includes(status)) return 'success';
  if (BAD.includes(status)) return 'danger';
  if (WAIT.includes(status)) return 'warning';
  return 'info';
}

/** The happy path of each workflow, in order; a status off the path (rejected, cancelled…) ends it. */
export const FLOWS: Partial<Record<RecordKind, string[]>> = {
  enquiry: ['new', 'contacted', 'counselling', 'applied', 'converted'],
  application: ['submitted', 'under_review', 'eligible', 'offered', 'accepted', 'enrolled'],
  loan: ['open', 'returned'],
  'stock-check': ['open', 'closed'],
  'gate-pass': ['requested', 'approved', 'out', 'returned'],
  'hostel-complaint': ['open', 'in_progress', 'resolved'],
  requisition: ['submitted', 'approved', 'ordered'],
  rfq: ['open', 'awarded'],
  'purchase-order': ['issued', 'partially_received', 'received'],
  invoice: ['mismatch', 'approved', 'paid'],
};

export interface Step {
  id: string;
  state: 'done' | 'current' | 'upcoming' | 'rejected' | 'skipped';
}

/** Stepper states for a record: steps before the current one are done; an off-path end status marks the next step rejected. */
export function workflowSteps(kind: RecordKind, status: string | undefined): Step[] {
  let flow = FLOWS[kind];
  if (!flow || !status) return [];
  // A gate pass issued by the warden skips the request; a matched invoice needs no approval.
  if (kind === 'gate-pass' && status !== 'requested' && status !== 'rejected') flow = ['issued', 'out', 'returned'].includes(status) ? ['issued', 'out', 'returned'] : flow;
  if (kind === 'invoice' && status === 'matched') return [{ id: 'matched', state: 'current' }, { id: 'paid', state: 'upcoming' }];
  if (kind === 'invoice' && status === 'paid') flow = ['matched', 'paid'];
  const at = flow.indexOf(status);
  const last = flow.length - 1;
  if (at >= 0) return flow.map((id, i) => ({ id, state: i < at || (i === at && i === last) ? 'done' : i === at ? 'current' : 'upcoming' }));
  // Off the path: everything up to where it stopped is done, the rest is rejected/skipped.
  const stopAt = kind === 'application' ? 2 : 1;
  return [...flow.slice(0, stopAt).map((id) => ({ id, state: 'done' as const })), { id: status, state: 'rejected' as const }];
}

/** A one-click action on a record, run through the API endpoint the module already has. */
export interface RecordAction {
  key: string;
  /** Statuses in which the action is offered. */
  when: string[];
  path: (id: string) => string;
  body?: (note: string) => Record<string, unknown>;
  /** The approval decision this action stands for (shown in the approval panel instead of a button). */
  decision?: 'approve' | 'reject';
  needsNote?: boolean;
}

export const ACTIONS: Partial<Record<RecordKind, RecordAction[]>> = {
  enquiry: [
    { key: 'contacted', when: ['new'], path: (id) => `/v1/admissions/enquiries/${id}/stage`, body: () => ({ stage: 'contacted' }) },
    { key: 'counselling', when: ['new', 'contacted'], path: (id) => `/v1/admissions/enquiries/${id}/stage`, body: () => ({ stage: 'counselling' }) },
    { key: 'lost', when: ['new', 'contacted', 'counselling'], path: (id) => `/v1/admissions/enquiries/${id}/stage`, body: (n) => ({ stage: 'lost', reason: n || undefined }) },
  ],
  application: [
    { key: 'review', when: ['submitted'], path: (id) => `/v1/admissions/applications/${id}/status`, body: () => ({ status: 'under_review' }) },
    { key: 'approve', decision: 'approve', when: ['under_review'], path: (id) => `/v1/admissions/applications/${id}/status`, body: (n) => ({ status: 'eligible', reason: n || undefined }) },
    { key: 'reject', decision: 'reject', when: ['under_review'], path: (id) => `/v1/admissions/applications/${id}/status`, body: (n) => ({ status: 'ineligible', reason: n }) },
    { key: 'offer', when: ['eligible', 'waitlisted'], path: (id) => `/v1/admissions/applications/${id}/status`, body: () => ({ status: 'offered' }) },
    { key: 'waitlist', when: ['eligible'], path: (id) => `/v1/admissions/applications/${id}/status`, body: () => ({ status: 'waitlisted' }) },
    { key: 'enrol', when: ['accepted'], path: (id) => `/v1/admissions/applications/${id}/enroll`, body: () => ({}) },
  ],
  loan: [
    { key: 'renew', when: ['open'], path: (id) => `/v1/library/loans/${id}/renew` },
    { key: 'return', when: ['open'], path: (id) => `/v1/library/loans/${id}/return` },
  ],
  'stock-check': [{ key: 'closeCheck', when: ['open'], path: (id) => `/v1/library/stock-checks/${id}/close` }],
  'gate-pass': [
    { key: 'approve', decision: 'approve', when: ['requested'], path: (id) => `/v1/hostel/gate-passes/${id}/approve` },
    { key: 'reject', decision: 'reject', when: ['requested'], path: (id) => `/v1/hostel/gate-passes/${id}/reject` },
    { key: 'markOut', when: ['approved', 'issued'], path: (id) => `/v1/hostel/gate-passes/${id}/out` },
    { key: 'markIn', when: ['out'], path: (id) => `/v1/hostel/gate-passes/${id}/in` },
    { key: 'cancel', when: ['approved', 'issued', 'requested'], path: (id) => `/v1/hostel/gate-passes/${id}/cancel` },
  ],
  'hostel-complaint': [
    { key: 'start', when: ['open'], path: (id) => `/v1/hostel/complaints/${id}/status`, body: () => ({ status: 'in_progress' }) },
    { key: 'resolve', when: ['open', 'in_progress'], path: (id) => `/v1/hostel/complaints/${id}/status`, body: (n) => ({ status: 'resolved', resolution: n || undefined }) },
  ],
  requisition: [
    { key: 'approve', decision: 'approve', when: ['submitted'], path: (id) => `/v1/inventory/requisitions/${id}/decision`, body: (n) => ({ approve: true, note: n || undefined }) },
    { key: 'reject', decision: 'reject', when: ['submitted'], path: (id) => `/v1/inventory/requisitions/${id}/decision`, body: (n) => ({ approve: false, note: n }) },
  ],
  invoice: [
    { key: 'approve', decision: 'approve', when: ['mismatch'], path: (id) => `/v1/inventory/invoices/${id}/approve` },
    { key: 'markPaid', when: ['matched', 'approved'], path: (id) => `/v1/inventory/invoices/${id}/paid` },
  ],
};

export const actionsFor = (kind: RecordKind, status: string | undefined) => (ACTIONS[kind] ?? []).filter((a) => status !== undefined && a.when.includes(status));

const HIDDEN = /^(id|tenant_id|.*_id|created_by|updated_by|.*_hash|version|data|payload|summary|search|.*_json)$/;
const UUID_V = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A field worth showing: not an internal id or a bare user/record id, not empty, not nested. */
const shown = (k: string, v: unknown) => !HIDDEN.test(k) && v !== null && v !== '' && typeof v !== 'object' && !(typeof v === 'string' && UUID_V.test(v));
const PRIORITY = ['number', 'application_no', 'applicant_name', 'name', 'title', 'reg_no', 'tag', 'sku', 'status', 'stage', 'category', 'amount_paise', 'total_paise', 'cost_paise', 'price_paise', 'monthly_fee_paise', 'copies', 'author', 'phone', 'email', 'due_on', 'issued_at', 'expected_back_at', 'destination', 'reason', 'invoice_no', 'location', 'purchased_on', 'capacity', 'created_at'];

/** Up to `max` facts for the header strip: known important fields first, then any other plain field. */
export function factsOf(r: Record<string, unknown>, max = 6, skip: string[] = []): [string, unknown][] {
  const plain = Object.entries(r).filter(([k, v]) => shown(k, v) && !skip.includes(k));
  const rank = (k: string) => (PRIORITY.includes(k) ? PRIORITY.indexOf(k) : PRIORITY.length);
  return plain.sort(([a], [b]) => rank(a) - rank(b)).slice(0, max);
}

/** All plain fields, for the overview. */
export const fieldsOf = (r: Record<string, unknown>) => Object.entries(r).filter(([k, v]) => shown(k, v));

/** Display text for one field: paise as rupees, timestamps as dates, booleans as yes/no keys. */
export function formatField(key: string, v: unknown, yesNo: [string, string] = ['Yes', 'No']): string {
  if (typeof v === 'boolean') return v ? yesNo[0] : yesNo[1];
  if (key.endsWith('_paise') && typeof v === 'number') return `₹${(v / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return v.slice(0, 16).replace('T', ' ');
  return String(v);
}

/** `amount_paise` → `Amount`; the ERP prefers a dictionary label and falls back to this. */
export const humanize = (key: string) => {
  const s = key.replace(/_paise$/, '').replace(/_(at|on)$/, '').replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Which record kind the rows of a related list open, if any. */
export const RELATED_KIND: Record<string, RecordKind> = { applications: 'application', loans: 'loan', orders: 'purchase-order', invoices: 'invoice', rfqs: 'rfq', rooms: 'hostel-room', complaints: 'hostel-complaint', trips: 'trip' };

/** Reports each module offers (ids match the API catalogue). */
export const MODULE_REPORTS: Record<OpsModule, string[]> = {
  admissions: ['admissions.register', 'admissions.funnel'],
  library: ['library.circulation', 'library.fines', 'library.stock'],
  hostel: ['hostel.occupancy', 'hostel.outpasses', 'hostel.complaints'],
  transport: ['transport.riders', 'transport.compliance', 'transport.expenses'],
  canteen: ['canteen.sales'],
  inventory: ['inventory.stock', 'inventory.ledger', 'inventory.stockRegister', 'inventory.slowMoving', 'inventory.consumption', 'inventory.verification', 'inventory.gate'],
  assets: ['assets.register', 'assets.maintenance', 'assets.deadStock', 'assets.naacInfra', 'assets.transfers', 'assets.condemned', 'assets.bookings', 'assets.tickets'],
  procurement: ['procurement.orders', 'procurement.vendors', 'procurement.register', 'procurement.indents', 'procurement.debitNotes'],
};
export const REPORT_IDS = Object.values(MODULE_REPORTS).flat();
export const isReportId = (id: string) => REPORT_IDS.includes(id);
