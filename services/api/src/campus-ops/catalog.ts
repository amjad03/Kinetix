// What the admissions and campus-operations depth layer knows about each module: settings with their
// defaults, the numbering series it owns, the record kinds a record page can open, and its reports.
import type { RoleName } from '../auth/principal.js';

export const OPS_MODULES = ['admissions', 'library', 'hostel', 'transport', 'canteen', 'inventory', 'assets', 'procurement'] as const;
export type OpsModule = (typeof OPS_MODULES)[number];

type Value = number | boolean | string;
/** A module's rules, templates and defaults; every key has a typed default and the API rejects unknown keys. */
export interface ModuleDefaults {
  rules: Record<string, Value>;
  templates: Record<string, string>;
  defaults: Record<string, Value>;
}

const LEAD: RoleName[] = ['tenant_admin', 'principal'];

/** Who may read and change a module's settings and run its reports. */
export const MODULE_ROLES: Record<OpsModule, RoleName[]> = {
  admissions: [...LEAD, 'admissions_officer'],
  library: [...LEAD, 'librarian'],
  hostel: [...LEAD, 'hostel_warden'],
  transport: [...LEAD, 'transport_manager'],
  canteen: [...LEAD, 'canteen_manager'],
  inventory: [...LEAD, 'store_keeper'],
  assets: [...LEAD, 'store_keeper', 'accountant'],
  procurement: [...LEAD, 'store_keeper', 'accountant'],
};

/** The document kinds whose numbers `nextNumber` issues, by the module whose settings page owns the series. */
export const NUMBERING: Record<OpsModule, string[]> = {
  admissions: [],
  library: ['LSC'],
  hostel: [],
  transport: [],
  canteen: [],
  inventory: ['TRF', 'RTN'],
  assets: ['AST'],
  procurement: ['REQ', 'RFQ', 'PO'],
};

export const DEFAULTS: Record<OpsModule, ModuleDefaults> = {
  admissions: {
    rules: { documentsBeforeOffer: false, interviewRequired: false, offerValidDays: 7, admissionFeeBeforeEnrolment: true },
    templates: { offerLetter: 'Dear {name}, you have been offered a seat in {program}. Please pay the admission fee by {due}.', rejectionNote: 'Thank you for applying. We are unable to offer you a seat this year.' },
    defaults: { counsellorFollowUpDays: 2, enquirySource: 'walk_in' },
  },
  library: {
    rules: { loanDays: 14, finePaisePerDay: 200, maxRenewals: 2, maxBooksPerStudent: 4, holdDays: 3 },
    templates: { overdueReminder: '{name}, "{title}" was due on {due}. Please return it to avoid further fines.' },
    defaults: { stockCheckScope: 'all' },
  },
  hostel: {
    rules: { outpassNeedsApproval: true, curfew: '21:00', maxLeaveDays: 7, parentNotifiedOnOut: true },
    templates: { outpassSlip: 'Out-pass for {name} ({room}) to {destination}, back by {back}.' },
    defaults: { messPlan: '', vacateNoticeDays: 15 },
  },
  transport: {
    rules: { passValidMonths: 12, feeDueDay: 10, overspeedKmh: 50, docExpiryWarnDays: 30 },
    templates: { busPass: '{name} · Route {route} · Stop {stop} · valid till {until}' },
    defaults: { direction: 'to_campus' },
  },
  canteen: {
    rules: { minTopupPaise: 0, allowNegativeBalance: false, dailySpendLimitPaise: 0 },
    templates: { lowBalance: '{name}, your canteen balance is ₹{balance}. Please top up.' },
    defaults: { lowBalancePaise: 5000 },
  },
  inventory: {
    rules: { allowNegativeStock: false, reorderAlerts: true, issueNeedsRequisition: false },
    templates: { issueSlip: 'Issued {qty} {unit} of {item} to {to} from {store}.' },
    defaults: { unit: 'nos', category: 'general' },
  },
  assets: {
    rules: { depreciationMethod: 'slm', capitaliseAbovePaise: 500000, amcReminderDays: 30, maintenanceEveryMonths: 6 },
    templates: { assetTag: '{tag} · {name} · {location}' },
    defaults: { usefulLifeYears: 5, salvagePct: 5 },
  },
  procurement: {
    rules: { quotesRequiredAbovePaise: 2500000, minQuotes: 3, invoiceTolerancePaise: 100, approvalAbovePaise: 0 },
    templates: { purchaseOrderTerms: 'Delivery within {days} days. Payment 30 days from a matched invoice.' },
    defaults: { paymentTermsDays: 30, deliveryDays: 15 },
  },
};

/** A record kind a record page can open: its table, how to title it, and the lists shown beside it. */
export interface RecordKind {
  module: OpsModule;
  table: string;
  /** SQL expression (over alias `r`) used as the page title. */
  title: string;
  related?: { key: string; table: string; fk: string; order?: string }[];
}

export const RECORD_KINDS: Record<string, RecordKind> = {
  enquiry: { module: 'admissions', table: 'enquiries', title: 'r.name', related: [{ key: 'activities', table: 'enquiry_activities', fk: 'enquiry_id' }, { key: 'applications', table: 'applications', fk: 'enquiry_id' }] },
  application: { module: 'admissions', table: 'applications', title: "r.application_no || ' · ' || r.applicant_name", related: [{ key: 'documents', table: 'application_documents', fk: 'application_id' }, { key: 'payments', table: 'application_payments', fk: 'application_id' }, { key: 'interviews', table: 'admission_interviews', fk: 'application_id' }] },
  cycle: { module: 'admissions', table: 'admission_cycles', title: 'r.name', related: [{ key: 'applications', table: 'applications', fk: 'cycle_id' }, { key: 'meritLists', table: 'merit_lists', fk: 'cycle_id' }] },
  book: { module: 'library', table: 'library_books', title: 'r.title', related: [{ key: 'loans', table: 'library_loans', fk: 'book_id' }, { key: 'reservations', table: 'library_reservations', fk: 'book_id' }] },
  loan: { module: 'library', table: 'library_loans', title: "'Loan ' || to_char(r.issued_at, 'DD Mon YYYY')" },
  'stock-check': { module: 'library', table: 'library_stock_checks', title: 'r.number', related: [{ key: 'scanned', table: 'library_stock_check_items', fk: 'check_id', order: 'scanned_at' }] },
  'hostel-block': { module: 'hostel', table: 'hostel_blocks', title: 'r.name', related: [{ key: 'rooms', table: 'hostel_rooms', fk: 'block_id' }] },
  'hostel-room': { module: 'hostel', table: 'hostel_rooms', title: "'Room ' || r.number", related: [{ key: 'beds', table: 'hostel_beds', fk: 'room_id' }, { key: 'complaints', table: 'hostel_complaints', fk: 'room_id' }] },
  'gate-pass': { module: 'hostel', table: 'hostel_gate_passes', title: "'Out-pass · ' || r.destination" },
  'hostel-complaint': { module: 'hostel', table: 'hostel_complaints', title: "initcap(r.category) || ' complaint'" },
  route: { module: 'transport', table: 'transport_routes', title: 'r.name', related: [{ key: 'stops', table: 'transport_stops', fk: 'route_id' }, { key: 'riders', table: 'transport_assignments', fk: 'route_id' }, { key: 'trips', table: 'transport_trips', fk: 'route_id', order: 'started_at' }] },
  vehicle: { module: 'transport', table: 'transport_vehicles', title: 'r.reg_no', related: [{ key: 'incidents', table: 'transport_incidents', fk: 'vehicle_id' }, { key: 'expenses', table: 'transport_expenses', fk: 'vehicle_id' }] },
  driver: { module: 'transport', table: 'transport_drivers', title: 'r.full_name' },
  trip: { module: 'transport', table: 'transport_trips', title: "'Trip · ' || r.direction", related: [{ key: 'events', table: 'transport_trip_events', fk: 'trip_id' }] },
  'canteen-item': { module: 'canteen', table: 'canteen_items', title: 'r.name' },
  item: { module: 'inventory', table: 'inv_items', title: "r.sku || ' · ' || r.name", related: [{ key: 'stock', table: 'inv_stock', fk: 'item_id' }, { key: 'moves', table: 'inv_stock_moves', fk: 'item_id' }] },
  store: { module: 'inventory', table: 'inv_stores', title: 'r.name', related: [{ key: 'stock', table: 'inv_stock', fk: 'store_id' }] },
  vendor: { module: 'procurement', table: 'inv_vendors', title: 'r.name', related: [{ key: 'orders', table: 'inv_purchase_orders', fk: 'vendor_id' }, { key: 'invoices', table: 'inv_invoices', fk: 'vendor_id' }] },
  requisition: { module: 'procurement', table: 'inv_requisitions', title: 'r.number', related: [{ key: 'lines', table: 'inv_requisition_lines', fk: 'requisition_id' }, { key: 'rfqs', table: 'inv_rfqs', fk: 'requisition_id' }, { key: 'orders', table: 'inv_purchase_orders', fk: 'requisition_id' }] },
  rfq: { module: 'procurement', table: 'inv_rfqs', title: 'r.number', related: [{ key: 'quotes', table: 'inv_quotes', fk: 'rfq_id' }] },
  'purchase-order': { module: 'procurement', table: 'inv_purchase_orders', title: 'r.number', related: [{ key: 'lines', table: 'inv_po_lines', fk: 'po_id' }, { key: 'receipts', table: 'inv_goods_receipts', fk: 'po_id', order: 'received_at' }, { key: 'invoices', table: 'inv_invoices', fk: 'po_id' }] },
  invoice: { module: 'procurement', table: 'inv_invoices', title: 'r.invoice_no' },
  asset: { module: 'assets', table: 'assets', title: "r.tag || ' · ' || r.name", related: [{ key: 'allocations', table: 'asset_allocations', fk: 'asset_id' }, { key: 'maintenance', table: 'asset_maintenance', fk: 'asset_id' }] },
};

/** A report: a parameterised query over the tenant's rows (RLS applies). `$from`/`$to`/`$status` are bound, never interpolated. */
export interface ReportDef {
  module: OpsModule;
  /** Columns in display order: key and English heading (the ERP translates by key). */
  columns: [string, string][];
  sql: string;
  /** Which of the standard filters the report honours. */
  filters: ('from' | 'to' | 'status')[];
}

const D = `coalesce($1::date, '1900-01-01')`;
const T = `coalesce($2::date, '2999-12-31')`;
const S = `($3::text is null or status::text = $3)`;

export const REPORTS: Record<string, ReportDef> = {
  'admissions.register': {
    module: 'admissions',
    columns: [['applicationNo', 'Application no.'], ['applicantName', 'Applicant'], ['program', 'Programme'], ['category', 'Category'], ['status', 'Status'], ['feeStatus', 'Fee'], ['submittedOn', 'Submitted']],
    sql: `select a.application_no as "applicationNo", a.applicant_name as "applicantName", coalesce(p.name, '') as program, coalesce(a.category, '') as category, a.status::text as status, a.fee_status::text as "feeStatus", to_char(a.submitted_at, 'YYYY-MM-DD') as "submittedOn"
          from applications a join admission_cycles c on c.id = a.cycle_id left join programs p on p.id = c.program_id
          where a.submitted_at::date between ${D} and ${T} and ($3::text is null or a.status::text = $3) order by a.submitted_at desc limit 2000`,
    filters: ['from', 'to', 'status'],
  },
  'admissions.funnel': {
    module: 'admissions',
    columns: [['stage', 'Stage'], ['count', 'Count']],
    sql: `select stage::text as stage, count(*)::int as count from enquiries where created_at::date between ${D} and ${T} and $3::text is null group by stage order by count desc`,
    filters: ['from', 'to'],
  },
  'library.circulation': {
    module: 'library',
    columns: [['title', 'Title'], ['student', 'Student'], ['issuedOn', 'Issued'], ['dueOn', 'Due'], ['returnedOn', 'Returned'], ['fine', 'Fine (₹)']],
    sql: `select b.title, s.full_name as student, to_char(l.issued_at, 'YYYY-MM-DD') as "issuedOn", l.due_on::text as "dueOn", coalesce(to_char(l.returned_at, 'YYYY-MM-DD'), '') as "returnedOn", round(coalesce(l.fine_paise, 0) / 100.0, 2) as fine
          from library_loans l join library_books b on b.id = l.book_id join students s on s.id = l.student_id
          where l.issued_at::date between ${D} and ${T} and ($3::text is null or ($3 = 'open' and l.returned_at is null) or ($3 = 'returned' and l.returned_at is not null)) order by l.issued_at desc limit 2000`,
    filters: ['from', 'to', 'status'],
  },
  'library.fines': {
    module: 'library',
    columns: [['student', 'Student'], ['loans', 'Late returns'], ['fine', 'Fine (₹)'], ['paid', 'Paid (₹)']],
    sql: `select s.full_name as student, count(*)::int as loans, round(sum(l.fine_paise) / 100.0, 2) as fine, round(sum(case when l.fine_paid_at is not null then l.fine_paise else 0 end) / 100.0, 2) as paid
          from library_loans l join students s on s.id = l.student_id where l.fine_paise > 0 and l.issued_at::date between ${D} and ${T} and $3::text is null group by s.full_name order by fine desc`,
    filters: ['from', 'to'],
  },
  'library.stock': {
    module: 'library',
    columns: [['title', 'Title'], ['author', 'Author'], ['callNo', 'Call no.'], ['copies', 'Copies'], ['out', 'On loan'], ['onShelf', 'On shelf']],
    sql: `select b.title, coalesce(b.author, '') as author, coalesce(b.call_no, '') as "callNo", b.copies, count(l.id) filter (where l.returned_at is null)::int as out, (b.copies - count(l.id) filter (where l.returned_at is null))::int as "onShelf"
          from library_books b left join library_loans l on l.book_id = b.id where $1::date is null and $2::date is null and $3::text is null group by b.id order by b.title`,
    filters: [],
  },
  'hostel.occupancy': {
    module: 'hostel',
    columns: [['block', 'Block'], ['room', 'Room'], ['beds', 'Beds'], ['occupied', 'Occupied'], ['vacant', 'Vacant']],
    sql: `select hb.name as block, r.number as room, count(b.id)::int as beds, count(a.id)::int as occupied, (count(b.id) - count(a.id))::int as vacant
          from hostel_rooms r join hostel_blocks hb on hb.id = r.block_id left join hostel_beds b on b.room_id = r.id left join hostel_allotments a on a.bed_id = b.id and a.vacated_on is null
          where $1::date is null and $2::date is null and $3::text is null group by hb.name, r.number order by hb.name, r.number`,
    filters: [],
  },
  'hostel.outpasses': {
    module: 'hostel',
    columns: [['student', 'Student'], ['destination', 'Destination'], ['reason', 'Reason'], ['status', 'Status'], ['expectedBack', 'Expected back'], ['created', 'Requested']],
    sql: `select s.full_name as student, g.destination, g.reason, g.status, to_char(g.expected_back_at, 'YYYY-MM-DD HH24:MI') as "expectedBack", to_char(g.created_at, 'YYYY-MM-DD') as created
          from hostel_gate_passes g join students s on s.id = g.student_id where g.created_at::date between ${D} and ${T} and ($3::text is null or g.status = $3) order by g.created_at desc limit 2000`,
    filters: ['from', 'to', 'status'],
  },
  'hostel.complaints': {
    module: 'hostel',
    columns: [['category', 'Category'], ['description', 'Complaint'], ['status', 'Status'], ['raised', 'Raised'], ['resolved', 'Resolved']],
    sql: `select category, description, status, to_char(created_at, 'YYYY-MM-DD') as raised, coalesce(to_char(resolved_at, 'YYYY-MM-DD'), '') as resolved
          from hostel_complaints where created_at::date between ${D} and ${T} and ${S} order by created_at desc limit 2000`,
    filters: ['from', 'to', 'status'],
  },
  'transport.riders': {
    module: 'transport',
    columns: [['route', 'Route'], ['stop', 'Stop'], ['student', 'Student'], ['from', 'From'], ['fee', 'Monthly fee (₹)']],
    sql: `select r.name as route, coalesce(st.name, '') as stop, s.full_name as student, a.starts_on::text as "from", round(r.monthly_fee_paise / 100.0, 2) as fee
          from transport_assignments a join transport_routes r on r.id = a.route_id join students s on s.id = a.student_id left join transport_stops st on st.id = a.stop_id
          where a.ended_on is null and $1::date is null and $2::date is null and $3::text is null order by r.name, st.name, s.full_name`,
    filters: [],
  },
  'transport.compliance': {
    module: 'transport',
    columns: [['vehicle', 'Vehicle'], ['insurance', 'Insurance till'], ['fitness', 'Fitness till'], ['puc', 'PUC till'], ['status', 'Status']],
    sql: `select reg_no as vehicle, coalesce(insurance_expires_on::text, '') as insurance, coalesce(fitness_expires_on::text, '') as fitness, coalesce(puc_expires_on::text, '') as puc, status
          from transport_vehicles where $1::date is null and $2::date is null and ${S} order by least(insurance_expires_on, fitness_expires_on, puc_expires_on) nulls last`,
    filters: ['status'],
  },
  'transport.expenses': {
    module: 'transport',
    columns: [['vehicle', 'Vehicle'], ['kind', 'Kind'], ['entries', 'Entries'], ['amount', 'Amount (₹)']],
    sql: `select v.reg_no as vehicle, e.kind, count(*)::int as entries, round(sum(e.amount_paise) / 100.0, 2) as amount from transport_expenses e join transport_vehicles v on v.id = e.vehicle_id
          where e.spent_on between ${D} and ${T} and $3::text is null group by v.reg_no, e.kind order by v.reg_no, e.kind`,
    filters: ['from', 'to'],
  },
  'canteen.sales': {
    module: 'canteen',
    columns: [['day', 'Day'], ['kind', 'Kind'], ['entries', 'Entries'], ['amount', 'Amount (₹)']],
    sql: `select to_char(created_at, 'YYYY-MM-DD') as day, kind, count(*)::int as entries, round(sum(abs(delta_paise)) / 100.0, 2) as amount from canteen_wallet_txns
          where created_at::date between ${D} and ${T} and $3::text is null group by 1, 2 order by 1 desc, 2`,
    filters: ['from', 'to'],
  },
  'inventory.stock': {
    module: 'inventory',
    columns: [['store', 'Store'], ['sku', 'SKU'], ['item', 'Item'], ['qty', 'Quantity'], ['unit', 'Unit'], ['reorder', 'Reorder level'], ['status', 'Status']],
    sql: `select * from (select st.name as store, i.sku, i.name as item, s.qty, i.unit, i.reorder_level as reorder, case when s.qty <= i.reorder_level then 'reorder' else 'ok' end as status
          from inv_stock s join inv_items i on i.id = s.item_id join inv_stores st on st.id = s.store_id) x where $1::date is null and $2::date is null and ${S} order by store, item`,
    filters: ['status'],
  },
  'inventory.ledger': {
    module: 'inventory',
    columns: [['at', 'Date'], ['store', 'Store'], ['item', 'Item'], ['kind', 'Movement'], ['qty', 'Quantity'], ['note', 'Note']],
    sql: `select to_char(m.created_at, 'YYYY-MM-DD') as at, st.name as store, i.name as item, m.kind, m.delta as qty, coalesce(m.note, '') as note
          from inv_stock_moves m join inv_items i on i.id = m.item_id join inv_stores st on st.id = m.store_id where m.created_at::date between ${D} and ${T} and $3::text is null order by m.created_at desc limit 3000`,
    filters: ['from', 'to'],
  },
  'assets.register': {
    module: 'assets',
    columns: [['tag', 'Tag'], ['name', 'Asset'], ['category', 'Category'], ['location', 'Location'], ['purchasedOn', 'Purchased'], ['cost', 'Cost (₹)'], ['status', 'Status']],
    sql: `select tag, name, category, coalesce(location, '') as location, coalesce(purchased_on::text, '') as "purchasedOn", round(cost_paise / 100.0, 2) as cost, status
          from assets where coalesce(purchased_on, created_at::date) between ${D} and ${T} and ${S} order by tag`,
    filters: ['from', 'to', 'status'],
  },
  'assets.maintenance': {
    module: 'assets',
    columns: [['tag', 'Tag'], ['asset', 'Asset'], ['on', 'Date'], ['kind', 'Kind'], ['cost', 'Cost (₹)'], ['note', 'Note']],
    sql: `select a.tag, a.name as asset, m.done_on::text as on, m.kind, round(coalesce(m.cost_paise, 0) / 100.0, 2) as cost, coalesce(m.description, '') as note
          from asset_maintenance m join assets a on a.id = m.asset_id where m.done_on between ${D} and ${T} and $3::text is null order by m.done_on desc`,
    filters: ['from', 'to'],
  },
  'procurement.orders': {
    module: 'procurement',
    columns: [['number', 'PO'], ['vendor', 'Vendor'], ['status', 'Status'], ['total', 'Total (₹)'], ['issuedOn', 'Issued']],
    sql: `select po.number, v.name as vendor, po.status, round(po.total_paise / 100.0, 2) as total, to_char(po.created_at, 'YYYY-MM-DD') as "issuedOn"
          from inv_purchase_orders po join inv_vendors v on v.id = po.vendor_id where po.created_at::date between ${D} and ${T} and ($3::text is null or po.status = $3) order by po.created_at desc limit 2000`,
    filters: ['from', 'to', 'status'],
  },
  'procurement.vendors': {
    module: 'procurement',
    columns: [['vendor', 'Vendor'], ['orders', 'Orders'], ['ordered', 'Ordered (₹)'], ['invoiced', 'Invoiced (₹)'], ['paid', 'Paid (₹)']],
    sql: `select v.name as vendor, count(distinct po.id)::int as orders, round(coalesce(sum(distinct po.total_paise), 0) / 100.0, 2) as ordered,
            round(coalesce((select sum(amount_paise) from inv_invoices i where i.vendor_id = v.id and i.created_at::date between ${D} and ${T}), 0) / 100.0, 2) as invoiced,
            round(coalesce((select sum(amount_paise) from inv_invoices i where i.vendor_id = v.id and i.status = 'paid' and i.created_at::date between ${D} and ${T}), 0) / 100.0, 2) as paid
          from inv_vendors v left join inv_purchase_orders po on po.vendor_id = v.id and po.created_at::date between ${D} and ${T} where $3::text is null group by v.id order by v.name`,
    filters: ['from', 'to'],
  },
};
