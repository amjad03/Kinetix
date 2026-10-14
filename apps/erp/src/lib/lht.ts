// Library, hostel (with the mess) and transport: which record lists each module's records page shows (grouped
// into tabs), the inputs the lists' actions ask for, and the API paths the desks may call.

export type LhtModule = 'library' | 'hostel' | 'transport';

export interface LhtGroup {
  key: string;
  entities: string[];
}

export const LHT_GROUPS: Record<LhtModule, LhtGroup[]> = {
  library: [
    { key: 'catalogue', entities: ['library-books', 'library-copies', 'library-branches'] },
    { key: 'members', entities: ['library-members', 'library-member-categories', 'library-clearances'] },
    { key: 'circulation', entities: ['library-loans', 'library-fine-waivers', 'library-gate'] },
    { key: 'acquisitions', entities: ['library-acquisitions', 'library-budgets'] },
    { key: 'serials', entities: ['library-periodicals', 'library-issues'] },
    { key: 'digital', entities: ['library-eresources', 'library-repository', 'library-ill'] },
  ],
  hostel: [
    { key: 'buildings', entities: ['hostels', 'hostel-blocks', 'hostel-room-types', 'hostel-rooms', 'hostel-room-assets'] },
    { key: 'residents', entities: ['hostel-residents', 'hostel-applications', 'hostel-requests', 'hostel-bed-holds', 'hostel-deposits', 'hostel-settlements'] },
    { key: 'gate', entities: ['hostel-gate-passes', 'hostel-visitors', 'hostel-late-entries'] },
    { key: 'welfare', entities: ['hostel-complaints', 'hostel-incidents', 'hostel-sickbay'] },
    { key: 'staff', entities: ['hostel-staff', 'hostel-duties'] },
    { key: 'mess', entities: ['mess-plans', 'mess-subscriptions', 'mess-leaves', 'mess-bills'] },
  ],
  transport: [
    { key: 'fleet', entities: ['transport-vehicles', 'transport-drivers', 'transport-maintenance', 'transport-expenses'] },
    { key: 'routes', entities: ['transport-routes', 'transport-stops', 'transport-overrides'] },
    { key: 'riders', entities: ['transport-riders', 'transport-change-requests', 'transport-pickup-persons', 'transport-handovers'] },
    { key: 'operations', entities: ['transport-duty', 'transport-trips', 'transport-alerts', 'transport-incidents'] },
  ],
};

/** The group an entity of a module is in, or null when the module has no such list. */
export function groupOf(module: LhtModule, entity: string): LhtGroup | null {
  return LHT_GROUPS[module].find((g) => g.entities.includes(entity)) ?? null;
}

/** Lists that must have a filter chosen before their rows can be dragged into order. */
export const REORDER_SCOPE: Record<string, string[]> = { 'transport-stops': ['route'], 'hostel-blocks': ['hostel'] };

/** Option lists an action's input can take from another list's form (branches, free beds, drivers). */
export const OPTION_SOURCES = {
  branches: { entity: 'library-gate', field: 'branchId' },
  beds: { entity: 'hostel-residents', field: 'bedId' },
  drivers: { entity: 'transport-duty', field: 'substituteDriverId' },
} as const;
export type OptionSource = keyof typeof OPTION_SOURCES;

export interface ParamField {
  name: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'bool';
  required?: boolean;
  /** For selects: fixed values (worded as `lht.pv.<name>.<value>`), or another list's options. */
  values?: string[];
  source?: OptionSource;
  initial?: string;
}

const note: ParamField = { name: 'note', type: 'textarea' };
const reason: ParamField = { name: 'reason', type: 'textarea', required: true };

/** The inputs each action with parameters asks for; actions not listed run as they are. */
export const PARAM_ACTIONS: Record<string, Record<string, ParamField[]>> = {
  'library-books': {
    addCopies: [{ name: 'count', type: 'number', required: true, initial: '1' }, { name: 'branchId', type: 'select', source: 'branches' }, { name: 'source', type: 'select', values: ['purchase', 'donation', 'exchange', 'book_bank'], initial: 'purchase' }, { name: 'price', type: 'number' }, { name: 'vendor', type: 'text' }, { name: 'invoiceNo', type: 'text' }],
    withdraw: [reason],
  },
  'library-copies': { withdraw: [reason] },
  'library-members': {
    block: [reason],
    renew: [{ name: 'validUntil', type: 'date', required: true }],
    reissueCard: [{ name: 'fee', type: 'number' }],
    collectDeposit: [{ name: 'amount', type: 'number', required: true }, { name: 'receipt', type: 'text' }],
  },
  'library-loans': {
    return: [{ name: 'branchId', type: 'select', source: 'branches' }],
    requestWaiver: [{ name: 'amount', type: 'number', required: true }, reason],
    lost: [{ name: 'note', type: 'textarea', required: true }, { name: 'amount', type: 'number' }],
    damaged: [{ name: 'note', type: 'textarea', required: true }, { name: 'amount', type: 'number' }],
  },
  'library-fine-waivers': { approve: [note], reject: [note] },
  'library-acquisitions': {
    reject: [note],
    order: [{ name: 'vendor', type: 'text', required: true }, { name: 'orderNo', type: 'text' }, { name: 'orderedOn', type: 'date' }],
    receive: [{ name: 'quantity', type: 'number' }, { name: 'receivedOn', type: 'date' }, { name: 'price', type: 'number' }, { name: 'branchId', type: 'select', source: 'branches' }],
    invoice: [{ name: 'invoiceNo', type: 'text', required: true }, { name: 'invoiceDate', type: 'date' }, { name: 'amount', type: 'number', required: true }],
  },
  'library-periodicals': { renew: [{ name: 'until', type: 'date', required: true }, { name: 'cost', type: 'number' }] },
  'library-issues': { checkIn: [{ name: 'receivedOn', type: 'date' }], claim: [note] },
  'hostel-residents': {
    vacate: [{ name: 'on', type: 'date' }, { name: 'reason', type: 'text' }, { name: 'damages', type: 'number' }, { name: 'dues', type: 'number' }, { name: 'refundUnusedFee', type: 'bool', initial: 'true' }],
    transfer: [{ name: 'bedId', type: 'select', source: 'beds', required: true }, reason],
    internship: [{ name: 'from', type: 'date', required: true }, { name: 'until', type: 'date', required: true }, { name: 'note', type: 'text' }],
  },
  'hostel-applications': { reject: [note], allot: [{ name: 'bedId', type: 'select', source: 'beds', required: true }] },
  'hostel-requests': { approve: [{ name: 'bedId', type: 'select', source: 'beds' }, { name: 'damages', type: 'number' }, { name: 'dues', type: 'number' }], reject: [note] },
  'hostel-complaints': { resolve: [{ name: 'resolution', type: 'textarea', required: true }] },
  'hostel-deposits': { refund: [{ name: 'damages', type: 'number' }, note], forfeit: [{ name: 'note', type: 'textarea', required: true }] },
  'hostel-settlements': { paid: [{ name: 'reference', type: 'text' }] },
  'hostel-sickbay': { discharge: [note] },
  'transport-riders': { end: [{ name: 'on', type: 'date' }] },
  'transport-change-requests': { reject: [note] },
  'transport-maintenance': { done: [{ name: 'doneOn', type: 'date' }, { name: 'odometerKm', type: 'number' }, { name: 'cost', type: 'number' }] },
  'transport-incidents': {
    resolve: [{ name: 'resolution', type: 'textarea', required: true }],
    fileClaim: [{ name: 'insurer', type: 'text', required: true }, { name: 'claimNo', type: 'text', required: true }, { name: 'amount', type: 'number', required: true }],
    settleClaim: [{ name: 'amount', type: 'number', required: true }],
  },
  'transport-duty': { absent: [{ name: 'substituteDriverId', type: 'select', source: 'drivers' }] },
};

/** The option lists an entity's actions need. */
export function sourcesFor(entity: string): OptionSource[] {
  const out = new Set<OptionSource>();
  for (const fields of Object.values(PARAM_ACTIONS[entity] ?? {})) for (const f of fields) if (f.source) out.add(f.source);
  return [...out];
}

/** Turns the typed inputs into the action's parameters (numbers as numbers, blanks left out). */
export function paramBody(fields: ParamField[], values: Record<string, string>): { params: Record<string, unknown> } | { missing: string } {
  const params: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = (values[f.name] ?? f.initial ?? '').trim();
    if (f.type === 'bool') {
      params[f.name] = raw === 'true';
      continue;
    }
    if (!raw) {
      if (f.required) return { missing: f.name };
      continue;
    }
    if (f.type === 'number') {
      const n = Number(raw.replace(/,/g, ''));
      if (!Number.isFinite(n)) return { missing: f.name };
      params[f.name] = n;
    } else params[f.name] = raw;
  }
  return { params };
}

/** The API paths the library, hostel and transport desks may call (POST); anything else is refused. */
export const LHT_PATHS =
  /^\/v1\/(library\/(desk\/(issue|return)|dropbox|gate\/swipe|members\/enrol|new-arrivals\/notify|no-dues\/[0-9a-f-]{36}\/clear)|hostel\/(applications\/auto-allot|mess\/bills\/(run|charge)|duties\/plan)|transport\/(fees\/month|duty\/today|handovers\/(otp|photo|[0-9a-f-]{36}\/verify)))$/;

export const isLhtPath = (path: string) => LHT_PATHS.test(path);

/** The lookups the desks may read (GET): a scanned code, an ISBN, a student's no-dues in each module. */
export const LHT_READS = /^\/v1\/(library\/(desk\/lookup\?code=[A-Za-z0-9%._-]{1,80}|isbn\/[0-9Xx-]{10,17}|no-dues\/[0-9a-f-]{36})|hostel\/no-dues\/[0-9a-f-]{36}|transport\/no-dues\/[0-9a-f-]{36})$/;

export const isLhtRead = (path: string) => LHT_READS.test(path);

/** A column's API sort key: the same name, or the name without its unit ("dueOn" sorts by "due"). */
export function sortKeyFor(key: string, sorts: string[]): string | undefined {
  const alias: Record<string, string> = { fullName: 'name', pubYear: 'year', loansOut: 'loans', unpaidRupees: 'fines', studentName: 'name', regNo: 'vehicle', number: 'number', placeName: 'place', enteredAt: 'at', inAt: 'in', outAt: 'out', occurredAt: 'when', occurredOn: 'on', spentOn: 'on', startedAt: 'started', createdAt: 'asked', admittedAt: 'admitted', dischargedAt: 'discharged', collectedOn: 'collected', vacatedOn: 'vacated', netRupees: 'net', dutyOn: 'day', speedKmh: 'speed', minutesLate: 'minutes', effectiveOn: 'effective', expectedOn: 'expected', receivedOn: 'received', requestedOn: 'requested', licenceUntil: 'licence', licenseExpiresOn: 'licence', subscriptionTo: 'until', costRupees: 'cost', amountRupees: 'amount', totalRupees: 'total', balanceRupees: 'balance', distanceKm: 'distance', meritScore: 'merit', fineRupees: 'fine', effectiveFeeRupees: 'fee', feeRupees: 'fee', priceRupees: 'price', visitorName: 'visitor', checkedOn: 'checked', fromOn: 'from', untilOn: 'until', startsOn: 'from', capacity: 'capacity' };
  const candidates = [key, alias[key], key.replace(/(Name|No|On|At|Rupees|Km|Until)$/, '')].filter(Boolean) as string[];
  return candidates.find((c) => sorts.includes(c));
}

/** Column keys whose values are worded by a filter or field of another name. */
export const VALUE_FROM: Record<string, string> = { borrowerKind: 'kind', claimStatus: 'claim', returnedVia: 'via' };

/** Status tones for the coloured pills. */
const GOOD = ['active', 'available', 'approved', 'returned', 'resolved', 'done', 'paid', 'settled', 'published', 'riding', 'resident', 'present', 'charged', 'allotted', 'in_hand', 'received', 'refunded', 'converted', 'scheduled_ok', 'running'];
const WAIT = ['pending', 'requested', 'applied', 'overdue', 'waitlisted', 'out', 'in_transit', 'scheduled', 'draft', 'expected', 'open', 'parent_pending', 'claimed', 'binding', 'maintenance', 'filed', 'issued', 'ordered', 'suggested', 'leave', 'in_progress', 'held', 'invoiced'];
const BAD = ['rejected', 'missing', 'lost', 'damaged', 'blocked', 'withdrawn', 'cancelled', 'absent', 'forfeited', 'expired', 'retired', 'closed', 'left', 'ended', 'refused'];
export function toneOf(value: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (GOOD.includes(value)) return 'success';
  if (WAIT.includes(value)) return 'warning';
  if (BAD.includes(value)) return 'danger';
  return 'neutral';
}

/** Keys that hold a year or a coordinate: shown as they are, without digit grouping. */
export const RAW_NUMBERS = new Set(['pubYear', 'year', 'fiscalYear', 'budgetYear', 'lat', 'lng', 'floor', 'number']);
