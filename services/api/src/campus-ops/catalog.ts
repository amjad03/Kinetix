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
  library: ['LSC', 'ACC', 'MEM', 'ACQ'],
  hostel: ['HAP'],
  transport: [],
  canteen: [],
  inventory: ['TRF', 'RTN', 'SV', 'GE'],
  assets: ['AST', 'CND', 'MT', 'FB'],
  procurement: ['REQ', 'RFQ', 'PO', 'GRN', 'DN', 'PV'],
};

export const DEFAULTS: Record<OpsModule, ModuleDefaults> = {
  admissions: {
    rules: { documentsBeforeOffer: false, interviewRequired: false, offerValidDays: 7, admissionFeeBeforeEnrolment: true },
    templates: { offerLetter: 'Dear {name}, you have been offered a seat in {program}. Please pay the admission fee by {due}.', rejectionNote: 'Thank you for applying. We are unable to offer you a seat this year.' },
    defaults: { counsellorFollowUpDays: 2, enquirySource: 'walk_in' },
  },
  library: {
    rules: { loanDays: 14, finePaisePerDay: 200, maxRenewals: 2, maxBooksPerStudent: 4, holdDays: 3, blockIssueAtFinePaise: 10000, bookBankDays: 150, cardReissueFeePaise: 5000, claimAfterDays: 15 },
    templates: { overdueReminder: '{name}, "{title}" was due on {due}. Please return it to avoid further fines.' },
    defaults: { stockCheckScope: 'all' },
  },
  hostel: {
    rules: { outpassNeedsApproval: true, curfew: '21:00', maxLeaveDays: 7, parentNotifiedOnOut: true, outpassNeedsParentApproval: false, lateEntryEscalateAfter: 3, lateEntryWindowDays: 30, cautionDepositPaise: 500000, allotWeightDistance: 1, allotWeightMerit: 1, allotWeightSeniority: 1 },
    templates: { outpassSlip: 'Out-pass for {name} ({room}) to {destination}, back by {back}.' },
    defaults: { messPlan: '', vacateNoticeDays: 15 },
  },
  transport: {
    rules: { passValidMonths: 12, feeDueDay: 10, overspeedKmh: 50, docExpiryWarnDays: 30, deviationMeters: 500, handoverOtpMinutes: 30, alertGapMinutes: 10 },
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
    // Maintenance tickets fall due this many hours after they are raised, by priority; bookings of halls wait for approval when bookingNeedsApproval is on.
    rules: { depreciationMethod: 'slm', capitaliseAbovePaise: 500000, amcReminderDays: 30, maintenanceEveryMonths: 6, slaUrgentHours: 4, slaHighHours: 24, slaNormalHours: 72, slaLowHours: 168, bookingNeedsApproval: true },
    templates: { assetTag: '{tag} · {name} · {location}' },
    defaults: { usefulLifeYears: 5, salvagePct: 5 },
  },
  procurement: {
    // Up to quotesRequiredAbovePaise an order may go direct to one vendor; above it quotations, a rate contract or GeM;
    // above tenderAbovePaise a tender or GeM. Orders above approvalAbovePaise (0 = every order) wait for an approver.
    rules: { quotesRequiredAbovePaise: 2500000, minQuotes: 3, invoiceTolerancePaise: 100, approvalAbovePaise: 5000000, tenderAbovePaise: 50000000, indentBudgetCheck: true },
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
  // ---- library, hostel and transport registers (0168-0170) ----
  'library.accession': {
    module: 'library',
    columns: [['accessionNo', 'Accession no.'], ['title', 'Title'], ['author', 'Author'], ['callNo', 'Call no.'], ['branch', 'Branch'], ['status', 'Status'], ['acquired', 'Acquired'], ['source', 'Source'], ['vendor', 'Vendor'], ['invoice', 'Invoice'], ['price', 'Price (₹)']],
    sql: `select c.accession_no as "accessionNo", b.title, b.author, coalesce(b.call_no, '') as "callNo", coalesce(br.name, '') as branch, c.status, coalesce(c.acquired_on::text, '') as acquired, c.source, c.vendor, c.invoice_no as invoice, round(c.price_paise / 100.0, 2) as price
          from library_copies c join library_books b on b.id = c.book_id left join library_branches br on br.id = c.branch_id
          where coalesce(c.acquired_on, c.created_at::date) between ${D} and ${T} and ($3::text is null or c.status = $3) order by length(c.accession_no), c.accession_no limit 20000`,
    filters: ['from', 'to', 'status'],
  },
  'library.overdue': {
    module: 'library',
    columns: [['title', 'Title'], ['accessionNo', 'Accession no.'], ['borrower', 'Borrower'], ['card', 'Card'], ['dueOn', 'Due'], ['daysOverdue', 'Days overdue'], ['phone', 'Phone']],
    sql: `select b.title, coalesce(c.accession_no, '') as "accessionNo", coalesce(m.full_name, s.full_name) as borrower, coalesce(m.card_no, '') as card, l.due_on::text as "dueOn", (current_date - l.due_on)::int as "daysOverdue", coalesce(m.phone, '') as phone
          from library_loans l join library_books b on b.id = l.book_id left join library_copies c on c.id = l.copy_id left join library_members m on m.id = l.member_id left join students s on s.id = l.student_id
          where l.returned_at is null and l.due_on < current_date and $1::date is null and $2::date is null and $3::text is null order by l.due_on`,
    filters: [],
  },
  'library.most-borrowed': {
    module: 'library',
    columns: [['title', 'Title'], ['author', 'Author'], ['issues', 'Times issued'], ['borrowers', 'Borrowers'], ['copies', 'Copies']],
    sql: `select b.title, b.author, count(l.id)::int as issues, count(distinct coalesce(l.member_id, l.student_id))::int as borrowers, b.copies
          from library_loans l join library_books b on b.id = l.book_id where l.issued_at::date between ${D} and ${T} and $3::text is null group by b.id order by issues desc, b.title limit 200`,
    filters: ['from', 'to'],
  },
  'library.circulation-stats': {
    module: 'library',
    columns: [['month', 'Month'], ['issued', 'Issued'], ['returned', 'Returned'], ['renewed', 'Renewals'], ['borrowers', 'Borrowers'], ['fines', 'Fines (₹)']],
    sql: `with m as (select generate_series(date_trunc('month', coalesce($1::date, current_date - 335)), date_trunc('month', least(coalesce($2::date, current_date), current_date)), interval '1 month')::date as d where $3::text is null)
          select to_char(m.d, 'YYYY-MM') as month,
            (select count(*)::int from library_loans l where date_trunc('month', l.issued_at)::date = m.d) as issued,
            (select count(*)::int from library_loans l where date_trunc('month', l.returned_at)::date = m.d) as returned,
            (select coalesce(sum(l.renew_count), 0)::int from library_loans l where date_trunc('month', l.issued_at)::date = m.d) as renewed,
            (select count(distinct coalesce(l.member_id, l.student_id))::int from library_loans l where date_trunc('month', l.issued_at)::date = m.d) as borrowers,
            (select round(coalesce(sum(l.fine_paise), 0) / 100.0, 2) from library_loans l where date_trunc('month', l.returned_at)::date = m.d) as fines
          from m order by m.d`,
    filters: ['from', 'to'],
  },
  'library.footfall': {
    module: 'library',
    columns: [['day', 'Day'], ['visits', 'Visits'], ['members', 'Members'], ['visitors', 'Visitors'], ['minutes', 'Average minutes']],
    sql: `select to_char(g.in_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as day, count(*)::int as visits, count(distinct g.member_id)::int as members, count(*) filter (where g.member_id is null)::int as visitors,
            coalesce(round(avg(extract(epoch from (g.out_at - g.in_at)) / 60) filter (where g.out_at is not null)), 0)::int as minutes
          from library_gate_log g where (g.in_at at time zone 'Asia/Kolkata')::date between ${D} and ${T} and $3::text is null group by 1 order by 1 desc`,
    filters: ['from', 'to'],
  },
  'library.naac': {
    module: 'library',
    columns: [['year', 'Financial year'], ['booksAdded', 'Copies added'], ['booksSpend', 'Books (₹)'], ['journals', 'Journals subscribed'], ['journalsSpend', 'Journals (₹)'], ['eresources', 'E-resources'], ['eresourceOpens', 'E-resource uses'], ['footfallPerDay', 'Readers a day'], ['issuesPerDay', 'Books issued a day']],
    sql: `with y as (select distinct case when extract(month from d) >= 4 then extract(year from d)::int else extract(year from d)::int - 1 end as fy
                     from generate_series(coalesce($1::date, current_date - 1095), least(coalesce($2::date, current_date), current_date), interval '1 month') d where $3::text is null)
          select y.fy || '-' || lpad(((y.fy + 1) % 100)::text, 2, '0') as year,
            (select count(*)::int from library_copies c where coalesce(c.acquired_on, c.created_at::date) between make_date(y.fy, 4, 1) and make_date(y.fy + 1, 3, 31)) as "booksAdded",
            (select round(coalesce(sum(c.price_paise), 0) / 100.0, 2) from library_copies c where coalesce(c.acquired_on, c.created_at::date) between make_date(y.fy, 4, 1) and make_date(y.fy + 1, 3, 31)) as "booksSpend",
            (select count(*)::int from library_periodicals p where p.subscription_from <= make_date(y.fy + 1, 3, 31) and coalesce(p.subscription_to, '2999-12-31') >= make_date(y.fy, 4, 1)) as journals,
            (select round(coalesce(sum(p.cost_paise), 0) / 100.0, 2) from library_periodicals p where p.subscription_from between make_date(y.fy, 4, 1) and make_date(y.fy + 1, 3, 31)) as "journalsSpend",
            (select count(*)::int from library_eresources e where e.created_at::date <= make_date(y.fy + 1, 3, 31)) as eresources,
            (select count(*)::int from library_eresource_access a where a.accessed_at::date between make_date(y.fy, 4, 1) and make_date(y.fy + 1, 3, 31)) as "eresourceOpens",
            (select round(count(*)::numeric / greatest(count(distinct (g.in_at at time zone 'Asia/Kolkata')::date), 1), 1) from library_gate_log g where (g.in_at at time zone 'Asia/Kolkata')::date between make_date(y.fy, 4, 1) and make_date(y.fy + 1, 3, 31)) as "footfallPerDay",
            (select round(count(*)::numeric / greatest(count(distinct (l.issued_at at time zone 'Asia/Kolkata')::date), 1), 1) from library_loans l where (l.issued_at at time zone 'Asia/Kolkata')::date between make_date(y.fy, 4, 1) and make_date(y.fy + 1, 3, 31)) as "issuesPerDay"
          from y order by y.fy desc`,
    filters: ['from', 'to'],
  },
  'library.withdrawals': {
    module: 'library',
    columns: [['accessionNo', 'Accession no.'], ['title', 'Title'], ['author', 'Author'], ['withdrawnOn', 'Withdrawn on'], ['reason', 'Reason'], ['price', 'Price (₹)']],
    sql: `select c.accession_no as "accessionNo", b.title, b.author, c.withdrawn_on::text as "withdrawnOn", c.withdrawn_reason as reason, round(c.price_paise / 100.0, 2) as price
          from library_copies c join library_books b on b.id = c.book_id where c.status = 'withdrawn' and c.withdrawn_on between ${D} and ${T} and $3::text is null order by c.withdrawn_on desc`,
    filters: ['from', 'to'],
  },
  'hostel.vacancy': {
    module: 'hostel',
    columns: [['hostel', 'Hostel'], ['block', 'Block'], ['room', 'Room'], ['type', 'Room type'], ['gender', 'For'], ['free', 'Free beds'], ['fee', 'Fee a month (₹)']],
    sql: `select coalesce(h.name, '') as hostel, k.name as block, r.number as room, coalesce(t.name, '') as type, coalesce(nullif(k.gender, 'mixed'), h.gender, 'mixed') as gender,
            (count(b.id) - count(a.id))::int as free, round(r.monthly_fee_paise / 100.0, 2) as fee
          from hostel_rooms r join hostel_blocks k on k.id = r.block_id left join hostels h on h.id = k.hostel_id left join hostel_room_types t on t.id = r.room_type_id
          left join hostel_beds b on b.room_id = r.id left join hostel_allotments a on a.bed_id = b.id and a.vacated_on is null
          where r.status = 'available' and $1::date is null and $2::date is null and $3::text is null group by h.name, h.gender, k.name, k.gender, r.number, t.name, r.monthly_fee_paise having count(b.id) > count(a.id) order by h.name, k.name, r.number`,
    filters: [],
  },
  'hostel.fee-dues': {
    module: 'hostel',
    columns: [['student', 'Student'], ['rollNo', 'Roll no.'], ['title', 'Fee'], ['dueOn', 'Due'], ['amount', 'Amount (₹)'], ['paid', 'Paid (₹)'], ['balance', 'Balance (₹)']],
    sql: `select s.full_name as student, s.roll_no as "rollNo", i.title, i.due_on::text as "dueOn", round(i.amount_paise / 100.0, 2) as amount, round(i.paid_paise / 100.0, 2) as paid, round((i.amount_paise - i.paid_paise) / 100.0, 2) as balance
          from fee_invoices i join students s on s.id = i.student_id where (i.title ilike 'hostel%' or i.title ilike 'mess%') and i.amount_paise > i.paid_paise and i.due_on between ${D} and ${T} and $3::text is null order by i.due_on, s.full_name`,
    filters: ['from', 'to'],
  },
  'hostel.night-absent': {
    module: 'hostel',
    columns: [['night', 'Night'], ['student', 'Student'], ['rollNo', 'Roll no.'], ['place', 'Block · Room']],
    sql: `select n.night::text as night, s.full_name as student, s.roll_no as "rollNo",
            coalesce((select k.name || ' · ' || r.number from hostel_allotments a join hostel_beds b on b.id = a.bed_id join hostel_rooms r on r.id = b.room_id join hostel_blocks k on k.id = r.block_id where a.student_id = s.id and a.starts_on <= n.night and (a.vacated_on is null or a.vacated_on >= n.night) limit 1), '') as place
          from hostel_night_attendance n join students s on s.id = n.student_id where n.status = 'absent' and n.night between ${D} and ${T} and $3::text is null order by n.night desc, s.full_name`,
    filters: ['from', 'to'],
  },
  'hostel.residents': {
    module: 'hostel',
    columns: [['hostel', 'Hostel'], ['block', 'Block'], ['room', 'Room'], ['bed', 'Bed'], ['student', 'Student'], ['rollNo', 'Roll no.'], ['since', 'Since']],
    sql: `select coalesce(h.name, '') as hostel, k.name as block, r.number as room, b.label as bed, s.full_name as student, s.roll_no as "rollNo", a.starts_on::text as since
          from hostel_allotments a join students s on s.id = a.student_id join hostel_beds b on b.id = a.bed_id join hostel_rooms r on r.id = b.room_id join hostel_blocks k on k.id = r.block_id left join hostels h on h.id = k.hostel_id
          where a.vacated_on is null and $1::date is null and $2::date is null and $3::text is null order by h.name, k.name, r.number, b.label`,
    filters: [],
  },
  'hostel.late-entries': {
    module: 'hostel',
    columns: [['at', 'Came in'], ['student', 'Student'], ['rollNo', 'Roll no.'], ['minutes', 'Minutes late'], ['reason', 'Reason'], ['escalated', 'Escalated']],
    sql: `select to_char(e.entered_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as at, s.full_name as student, s.roll_no as "rollNo", e.minutes_late as minutes, e.reason, case when e.escalated then 'yes' else '' end as escalated
          from hostel_late_entries e join students s on s.id = e.student_id where (e.entered_at at time zone 'Asia/Kolkata')::date between ${D} and ${T} and $3::text is null order by e.entered_at desc`,
    filters: ['from', 'to'],
  },
  'hostel.mess-bills': {
    module: 'hostel',
    columns: [['month', 'Month'], ['student', 'Student'], ['rollNo', 'Roll no.'], ['days', 'Days'], ['rebateDays', 'Rebate days'], ['gross', 'Gross (₹)'], ['rebate', 'Rebate (₹)'], ['net', 'Net (₹)'], ['status', 'Status']],
    sql: `select b.month, s.full_name as student, s.roll_no as "rollNo", b.days, b.rebate_days as "rebateDays", round(b.gross_paise / 100.0, 2) as gross, round(b.rebate_paise / 100.0, 2) as rebate, round(b.net_paise / 100.0, 2) as net, b.status
          from mess_bills b join students s on s.id = b.student_id where to_date(b.month || '-01', 'YYYY-MM-DD') between date_trunc('month', ${D}::date) and ${T} and ($3::text is null or b.status = $3) order by b.month desc, s.full_name`,
    filters: ['from', 'to', 'status'],
  },
  'transport.stop-list': {
    module: 'transport',
    columns: [['route', 'Route'], ['stop', 'Stop'], ['pickup', 'Pick-up'], ['drop', 'Drop'], ['rider', 'Rider'], ['rollNo', 'Roll no.'], ['className', 'Class']],
    sql: `select r.name as route, st.name as stop, coalesce(st.pickup_time, '') as pickup, coalesce(st.drop_time, '') as drop, coalesce(s.full_name, u.full_name) as rider, coalesce(s.roll_no, '') as "rollNo", coalesce(sec.display_name, 'Staff') as "className"
          from transport_assignments a join transport_routes r on r.id = a.route_id join transport_stops st on st.id = a.stop_id left join students s on s.id = a.student_id left join sections sec on sec.id = s.section_id left join users u on u.id = a.staff_user_id
          where a.ended_on is null and $1::date is null and $2::date is null and $3::text is null order by r.name, st.sort_order, st.seq, rider`,
    filters: [],
  },
  'transport.expiry-calendar': {
    module: 'transport',
    columns: [['due', 'Due'], ['subject', 'Vehicle or driver'], ['document', 'Paper'], ['daysLeft', 'Days left']],
    sql: `select due::text as due, subject, document, (due - current_date)::int as "daysLeft" from (
            select insurance_expires_on as due, reg_no as subject, 'insurance' as document from transport_vehicles where status <> 'retired'
            union all select fitness_expires_on, reg_no, 'fitness' from transport_vehicles where status <> 'retired'
            union all select puc_expires_on, reg_no, 'puc' from transport_vehicles where status <> 'retired'
            union all select permit_expires_on, reg_no, 'permit' from transport_vehicles where status <> 'retired'
            union all select road_tax_expires_on, reg_no, 'road_tax' from transport_vehicles where status <> 'retired'
            union all select license_expires_on, full_name, 'licence' from transport_drivers where active
          ) x where due is not null and due between ${D} and ${T} and $3::text is null order by due, subject`,
    filters: ['from', 'to'],
  },
  'transport.fee-dues': {
    module: 'transport',
    columns: [['route', 'Route'], ['student', 'Student'], ['rollNo', 'Roll no.'], ['title', 'Fee'], ['dueOn', 'Due'], ['balance', 'Balance (₹)']],
    sql: `select coalesce((select r.name from transport_assignments a join transport_routes r on r.id = a.route_id where a.student_id = s.id order by a.ended_on nulls first, a.starts_on desc limit 1), '') as route,
            s.full_name as student, s.roll_no as "rollNo", i.title, i.due_on::text as "dueOn", round((i.amount_paise - i.paid_paise) / 100.0, 2) as balance
          from fee_invoices i join students s on s.id = i.student_id where i.title ilike 'transport%' and i.amount_paise > i.paid_paise and i.due_on between ${D} and ${T} and $3::text is null order by route, s.full_name`,
    filters: ['from', 'to'],
  },
  'transport.maintenance': {
    module: 'transport',
    columns: [['vehicle', 'Vehicle'], ['kind', 'Work'], ['dueOn', 'Due'], ['doneOn', 'Done'], ['cost', 'Cost (₹)'], ['vendor', 'Workshop'], ['status', 'Status']],
    sql: `select v.reg_no as vehicle, m.kind, coalesce(m.due_on::text, '') as "dueOn", coalesce(m.done_on::text, '') as "doneOn", round(m.cost_paise / 100.0, 2) as cost, m.vendor, m.status
          from transport_maintenance m join transport_vehicles v on v.id = m.vehicle_id where coalesce(m.done_on, m.due_on, m.created_at::date) between ${D} and ${T} and ($3::text is null or m.status = $3) order by coalesce(m.due_on, m.done_on) desc`,
    filters: ['from', 'to', 'status'],
  },
  'transport.incidents': {
    module: 'transport',
    columns: [['at', 'When'], ['vehicle', 'Vehicle'], ['kind', 'Kind'], ['severity', 'Severity'], ['description', 'What happened'], ['status', 'Status'], ['claim', 'Claim'], ['claimed', 'Claimed (₹)'], ['settled', 'Settled (₹)']],
    sql: `select to_char(i.occurred_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as at, coalesce(v.reg_no, '') as vehicle, i.kind, i.severity, i.description, i.status, i.claim_status as claim, round(i.claim_amount_paise / 100.0, 2) as claimed, round(i.settled_paise / 100.0, 2) as settled
          from transport_incidents i left join transport_vehicles v on v.id = i.vehicle_id where (i.occurred_at at time zone 'Asia/Kolkata')::date between ${D} and ${T} and ($3::text is null or i.status = $3) order by i.occurred_at desc`,
    filters: ['from', 'to', 'status'],
  },
  'transport.alerts': {
    module: 'transport',
    columns: [['at', 'When'], ['route', 'Route'], ['kind', 'Alert'], ['speed', 'Speed (km/h)'], ['detail', 'Detail']],
    sql: `select to_char(e.at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as at, r.name as route, e.kind, coalesce(e.speed_kmh, 0) as speed, coalesce(e.detail, '') as detail
          from transport_trip_events e join transport_trips t on t.id = e.trip_id join transport_routes r on r.id = t.route_id where e.kind in ('overspeed', 'deviation') and (e.at at time zone 'Asia/Kolkata')::date between ${D} and ${T} and $3::text is null order by e.at desc limit 5000`,
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
  // ---- stores, procurement, assets and facilities depth (migrations 0171, 0172) ----
  'inventory.stockRegister': {
    module: 'inventory',
    columns: [['store', 'Store'], ['sku', 'SKU'], ['item', 'Item'], ['unit', 'Unit'], ['opening', 'Opening'], ['received', 'Received'], ['issued', 'Issued and used'], ['closing', 'Closing'], ['value', 'Closing value (₹)']],
    sql: `select st.name as store, i.sku, i.name as item, i.unit,
            coalesce(sum(m.delta) filter (where m.created_at::date < ${D}), 0)::int as opening,
            coalesce(sum(m.delta) filter (where m.delta > 0 and m.created_at::date between ${D} and ${T}), 0)::int as received,
            coalesce(-sum(m.delta) filter (where m.delta < 0 and m.created_at::date between ${D} and ${T}), 0)::int as issued,
            coalesce(sum(m.delta) filter (where m.created_at::date <= ${T}), 0)::int as closing,
            round(coalesce(sum(m.delta) filter (where m.created_at::date <= ${T}), 0) * max(i.last_price_paise) / 100.0, 2) as value
          from inv_stock_moves m join inv_items i on i.id = m.item_id join inv_stores st on st.id = m.store_id where $3::text is null group by st.name, i.id order by st.name, i.name`,
    filters: ['from', 'to'],
  },
  'inventory.slowMoving': {
    module: 'inventory',
    columns: [['store', 'Store'], ['sku', 'SKU'], ['item', 'Item'], ['qty', 'In stock'], ['lastOut', 'Last issued'], ['value', 'Value (₹)']],
    sql: `select st.name as store, i.sku, i.name as item, s.qty, coalesce((select max(m.created_at)::date::text from inv_stock_moves m where m.store_id = s.store_id and m.item_id = s.item_id and m.delta < 0), '') as "lastOut", round(s.qty * i.last_price_paise / 100.0, 2) as value
          from inv_stock s join inv_items i on i.id = s.item_id join inv_stores st on st.id = s.store_id
          where s.qty > 0 and not exists (select 1 from inv_stock_moves m where m.store_id = s.store_id and m.item_id = s.item_id and m.delta < 0 and m.created_at::date >= coalesce($1::date, current_date - 365)) and $2::date is null and $3::text is null order by value desc`,
    filters: ['from'],
  },
  'inventory.consumption': {
    module: 'inventory',
    columns: [['department', 'Department'], ['sku', 'SKU'], ['item', 'Item'], ['qty', 'Quantity'], ['unit', 'Unit'], ['value', 'Value (₹)']],
    sql: `select coalesce(d.name, m.issued_to, '') as department, i.sku, i.name as item, (-sum(m.delta))::int as qty, i.unit, round(-sum(m.delta) * max(i.last_price_paise) / 100.0, 2) as value
          from inv_stock_moves m join inv_items i on i.id = m.item_id left join departments d on d.id = m.department_id
          where m.kind = 'issue' and m.created_at::date between ${D} and ${T} and $3::text is null group by 1, i.id order by 1, i.name`,
    filters: ['from', 'to'],
  },
  'inventory.verification': {
    module: 'inventory',
    columns: [['number', 'Verification'], ['store', 'Store'], ['item', 'Item'], ['book', 'Book'], ['counted', 'Counted'], ['difference', 'Difference'], ['value', 'Difference value (₹)'], ['remark', 'Remark']],
    sql: `select v.number, st.name as store, i.name as item, l.book_qty as book, l.counted_qty as counted, (l.counted_qty - l.book_qty) as difference, round((l.counted_qty - l.book_qty) * i.last_price_paise / 100.0, 2) as value, l.remark
          from inv_stock_verification_lines l join inv_stock_verifications v on v.id = l.verification_id join inv_items i on i.id = l.item_id join inv_stores st on st.id = v.store_id
          where l.counted_qty is not null and v.created_at::date between ${D} and ${T} and ($3::text is null or v.status = $3) order by v.number, i.name`,
    filters: ['from', 'to', 'status'],
  },
  'inventory.gate': {
    module: 'inventory',
    columns: [['number', 'Entry'], ['at', 'Date'], ['direction', 'Direction'], ['kind', 'Kind'], ['party', 'From or to'], ['description', 'What'], ['qty', 'Quantity'], ['vehicle', 'Vehicle'], ['expected', 'Expected back'], ['returned', 'Returned on'], ['status', 'Status']],
    sql: `select number, to_char(created_at, 'YYYY-MM-DD HH24:MI') as at, direction, kind, party, description, qty, vehicle_no as vehicle, coalesce(expected_return_on::text, '') as expected, coalesce(returned_on::text, '') as returned, status
          from inv_gate_entries where created_at::date between ${D} and ${T} and ${S} order by created_at desc limit 5000`,
    filters: ['from', 'to', 'status'],
  },
  'procurement.register': {
    module: 'procurement',
    columns: [['number', 'PO'], ['date', 'Date'], ['vendor', 'Vendor'], ['gstin', 'GSTIN'], ['department', 'Department'], ['mode', 'Purchase mode'], ['reference', 'GeM or tender ref.'], ['total', 'Order value (₹)'], ['received', 'Received value (₹)'], ['invoiced', 'Invoiced (₹)'], ['paid', 'Paid (₹)'], ['status', 'Status']],
    sql: `select po.number, to_char(po.created_at, 'YYYY-MM-DD') as date, v.name as vendor, coalesce(v.gstin, '') as gstin, coalesce(d.name, '') as department, po.purchase_mode as mode, coalesce(po.gem_ref, po.tender_ref, '') as reference, round(po.total_paise / 100.0, 2) as total,
            round(coalesce((select sum(l.received_qty * l.unit_price_paise) from inv_po_lines l where l.po_id = po.id), 0) / 100.0, 2) as received,
            round(coalesce((select sum(i.amount_paise) from inv_invoices i where i.po_id = po.id), 0) / 100.0, 2) as invoiced,
            round(coalesce((select sum(i.amount_paise - i.debit_paise) from inv_invoices i where i.po_id = po.id and i.status = 'paid'), 0) / 100.0, 2) as paid, po.status
          from inv_purchase_orders po join inv_vendors v on v.id = po.vendor_id left join departments d on d.id = po.department_id
          where po.created_at::date between ${D} and ${T} and ($3::text is null or po.status = $3) order by po.created_at limit 5000`,
    filters: ['from', 'to', 'status'],
  },
  'procurement.indents': {
    module: 'procurement',
    columns: [['number', 'Indent'], ['date', 'Date'], ['requester', 'Raised by'], ['department', 'Department'], ['estimate', 'Estimate (₹)'], ['budget', 'Budget'], ['status', 'Status']],
    sql: `select r.number, to_char(r.created_at, 'YYYY-MM-DD') as date, u.full_name as requester, coalesce(d.name, '') as department, round(r.estimated_paise / 100.0, 2) as estimate, coalesce(r.budget_status, '') as budget, r.status
          from inv_requisitions r join users u on u.id = r.requested_by left join departments d on d.id = r.department_id where r.created_at::date between ${D} and ${T} and ($3::text is null or r.status = $3) order by r.created_at desc limit 5000`,
    filters: ['from', 'to', 'status'],
  },
  'procurement.debitNotes': {
    module: 'procurement',
    columns: [['number', 'Debit note'], ['date', 'Date'], ['vendor', 'Vendor'], ['po', 'PO'], ['amount', 'Amount (₹)'], ['reason', 'Reason'], ['status', 'Status']],
    sql: `select n.number, to_char(n.created_at, 'YYYY-MM-DD') as date, v.name as vendor, po.number as po, round(n.amount_paise / 100.0, 2) as amount, n.reason, n.status
          from inv_debit_notes n join inv_vendors v on v.id = n.vendor_id join inv_purchase_orders po on po.id = n.po_id where n.created_at::date between ${D} and ${T} and ($3::text is null or n.status = $3) order by n.created_at desc`,
    filters: ['from', 'to', 'status'],
  },
  'assets.deadStock': {
    module: 'assets',
    columns: [['tag', 'Tag'], ['name', 'Article'], ['category', 'Category'], ['purchasedOn', 'Purchased'], ['supplier', 'Supplier'], ['invoice', 'Invoice no.'], ['cost', 'Cost (₹)'], ['department', 'Department'], ['location', 'Location'], ['status', 'Status'], ['writtenOff', 'Written off on']],
    sql: `select a.tag, a.name, a.category, a.purchased_on::text as "purchasedOn", coalesce(v.name, '') as supplier, coalesce(a.invoice_no, '') as invoice, round(a.cost_paise / 100.0, 2) as cost, coalesce(d.name, '') as department, coalesce(r.name, a.location, '') as location, a.status, coalesce(a.disposed_on::text, '') as "writtenOff"
          from assets a left join inv_vendors v on v.id = a.vendor_id left join departments d on d.id = a.department_id left join rooms r on r.id = a.room_id
          where a.purchased_on between ${D} and ${T} and ($3::text is null or a.status = $3) order by a.category, a.tag`,
    filters: ['from', 'to', 'status'],
  },
  'assets.naacInfra': {
    module: 'assets',
    columns: [['year', 'Financial year'], ['head', 'Head'], ['detail', 'Category'], ['amount', 'Amount (₹)']],
    sql: `with spend as (
            select a.purchased_on as on_date, 'Capital: infrastructure and equipment' as head, a.category as detail, a.cost_paise as paise from assets a
            union all select m.done_on, 'Maintenance: repairs and servicing', a.category, m.cost_paise from asset_maintenance m join assets a on a.id = m.asset_id where m.cost_paise > 0
            union all select c.starts_on, 'Maintenance: annual maintenance contracts', coalesce(a.category, 'General'), c.cost_paise from amc_contracts c left join assets a on a.id = c.asset_id where c.status = 'active' and c.cost_paise > 0
            union all select t.resolved_at::date, 'Maintenance: buildings and facilities', t.category, t.cost_paise from maintenance_tickets t where t.resolved_at is not null and t.cost_paise > 0
          )
          select (extract(year from on_date)::int - case when extract(month from on_date) < 4 then 1 else 0 end)::text || '-' || lpad(((extract(year from on_date)::int - case when extract(month from on_date) < 4 then 1 else 0 end + 1) % 100)::text, 2, '0') as year,
            head, detail, round(sum(paise) / 100.0, 2) as amount
          from spend where on_date between ${D} and ${T} and $3::text is null group by 1, 2, 3 order by 1 desc, 2, 3`,
    filters: ['from', 'to'],
  },
  'assets.transfers': {
    module: 'assets',
    columns: [['on', 'Date'], ['tag', 'Tag'], ['asset', 'Asset'], ['from', 'From'], ['to', 'To'], ['reason', 'Reason']],
    sql: `select t.transferred_on::text as on, a.tag, a.name as asset, concat_ws(' · ', fd.name, fr.name, nullif(t.from_location, '')) as from, concat_ws(' · ', td.name, tr.name, nullif(t.to_location, '')) as to, t.reason
          from asset_transfers t join assets a on a.id = t.asset_id left join rooms fr on fr.id = t.from_room_id left join rooms tr on tr.id = t.to_room_id left join departments fd on fd.id = t.from_department_id left join departments td on td.id = t.to_department_id
          where t.transferred_on between ${D} and ${T} and $3::text is null order by t.transferred_on desc`,
    filters: ['from', 'to'],
  },
  'assets.condemned': {
    module: 'assets',
    columns: [['number', 'Proposal'], ['tag', 'Tag'], ['asset', 'Asset'], ['cost', 'Cost (₹)'], ['reason', 'Reason'], ['status', 'Status'], ['mode', 'Disposed by'], ['realised', 'Realised (₹)'], ['on', 'Written off on']],
    sql: `select c.number, a.tag, a.name as asset, round(a.cost_paise / 100.0, 2) as cost, c.reason, c.status, coalesce(c.disposal_mode, '') as mode, round(coalesce(c.realised_paise, 0) / 100.0, 2) as realised, coalesce(c.written_off_on::text, '') as on
          from asset_condemnations c join assets a on a.id = c.asset_id where c.created_at::date between ${D} and ${T} and ($3::text is null or c.status = $3) order by c.created_at desc`,
    filters: ['from', 'to', 'status'],
  },
  'assets.bookings': {
    module: 'assets',
    columns: [['number', 'Booking'], ['on', 'Date'], ['time', 'Time'], ['room', 'Room'], ['title', 'Event'], ['organiser', 'Organised by'], ['attendees', 'Attendance'], ['status', 'Status']],
    sql: `select b.number, b.on_date::text as on, to_char(b.starts_at, 'HH24:MI') || '–' || to_char(b.ends_at, 'HH24:MI') as time, r.name as room, b.title, b.organiser, b.attendees, b.status
          from facility_bookings b join rooms r on r.id = b.room_id where b.on_date between ${D} and ${T} and ($3::text is null or b.status = $3) order by b.on_date, b.starts_at`,
    filters: ['from', 'to', 'status'],
  },
  'assets.tickets': {
    module: 'assets',
    columns: [['number', 'Ticket'], ['raised', 'Raised'], ['category', 'Category'], ['priority', 'Priority'], ['title', 'Problem'], ['where', 'Where'], ['status', 'Status'], ['due', 'Due'], ['resolved', 'Resolved'], ['sla', 'Deadline'], ['cost', 'Cost (₹)']],
    sql: `select t.number, to_char(t.created_at, 'YYYY-MM-DD HH24:MI') as raised, t.category, t.priority, t.title, coalesce(r.name, nullif(t.location, ''), '') as where, t.status, to_char(t.due_at, 'YYYY-MM-DD HH24:MI') as due, coalesce(to_char(t.resolved_at, 'YYYY-MM-DD HH24:MI'), '') as resolved,
            case when t.resolved_at is not null then (case when t.resolved_at <= t.due_at then 'met' else 'breached' end) when now() > t.due_at then 'breached' else 'open' end as sla, round(t.cost_paise / 100.0, 2) as cost
          from maintenance_tickets t left join rooms r on r.id = t.room_id where t.created_at::date between ${D} and ${T} and ($3::text is null or t.status = $3) order by t.created_at desc limit 5000`,
    filters: ['from', 'to', 'status'],
  },
};
