// Library, hostel and transport depth tables (migrations 0168, 0169, 0170). Kept apart from schema.ts, which they reference.
import { sql } from 'drizzle-orm';
import { bigint, boolean, date, index, integer, numeric, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { assets, departments, healthVisits, hostelAllotments, hostelBeds, hostelGatePasses, hostelRooms, invItems, libraryBooks, libraryLoans, messPlans, students, tenants, transportDrivers, transportRoutes, transportStops, transportTrips, transportVehicles, users } from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const paise = (name: string) => bigint(name, { mode: 'number' });
const by = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });
const ts = (name: string) => timestamp(name, { withTimezone: true });

// ---- Library (0168) -----------------------------------------------------------------------------------

/** A branch or reading room of the library; copies belong to one and may sit in another after a wrong-branch return. */
export const libraryBranches = pgTable('library_branches', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  code: text('code').notNull().default(''),
  isMain: boolean('is_main').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
});

/** A year's budget for books, journals or e-resources, for a department or (no department) the library as a whole. */
export const libraryBudgets = pgTable('library_budgets', {
  id: id(),
  tenantId: tenantId(),
  fiscalYear: text('fiscal_year').notNull(),
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'cascade' }),
  /** books | journals | eresources | other */
  head: text('head').notNull().default('books'),
  amountPaise: paise('amount_paise').notNull().default(0),
  note: text('note').notNull().default(''),
  createdAt: createdAt(),
});

/** A book someone asked the library to buy: suggested → approved → ordered → received → invoiced (or rejected, cancelled). */
export const libraryAcquisitions = pgTable(
  'library_acquisitions',
  {
    id: id(),
    tenantId: tenantId(),
    number: text('number').notNull(),
    title: text('title').notNull(),
    author: text('author').notNull().default(''),
    isbn: text('isbn').notNull().default(''),
    publisher: text('publisher').notNull().default(''),
    edition: text('edition').notNull().default(''),
    quantity: integer('quantity').notNull().default(1),
    estPricePaise: paise('est_price_paise').notNull().default(0),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    budgetId: uuid('budget_id').references(() => libraryBudgets.id, { onDelete: 'set null' }),
    suggestedBy: by('suggested_by'),
    suggestedByName: text('suggested_by_name').notNull().default(''),
    reason: text('reason').notNull().default(''),
    status: text('status').notNull().default('suggested'),
    decidedBy: by('decided_by'),
    decidedAt: ts('decided_at'),
    decisionNote: text('decision_note').notNull().default(''),
    vendor: text('vendor').notNull().default(''),
    orderNo: text('order_no').notNull().default(''),
    orderedOn: date('ordered_on'),
    receivedQty: integer('received_qty').notNull().default(0),
    receivedOn: date('received_on'),
    invoiceNo: text('invoice_no').notNull().default(''),
    invoiceDate: date('invoice_date'),
    invoiceAmountPaise: paise('invoice_amount_paise').notNull().default(0),
    bookId: uuid('book_id').references(() => libraryBooks.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('library_acquisitions_status_idx').on(t.tenantId, t.status, t.createdAt)],
);

/** The accession register: one row per physical copy, with its barcode, RFID tag, branch, shelf and state. */
export const libraryCopies = pgTable(
  'library_copies',
  {
    id: id(),
    tenantId: tenantId(),
    bookId: uuid('book_id').notNull().references(() => libraryBooks.id, { onDelete: 'cascade' }),
    accessionNo: text('accession_no').notNull(),
    barcode: text('barcode'),
    rfid: text('rfid'),
    branchId: uuid('branch_id').references(() => libraryBranches.id, { onDelete: 'set null' }),
    /** Where the copy is now (another branch after a wrong-branch return, until it is sent back). */
    atBranchId: uuid('at_branch_id').references(() => libraryBranches.id, { onDelete: 'set null' }),
    shelf: text('shelf').notNull().default(''),
    /** available | on_loan | in_transit | lost | damaged | missing | withdrawn | binding */
    status: text('status').notNull().default('available'),
    acquiredOn: date('acquired_on'),
    /** purchase | donation | exchange | book_bank */
    source: text('source').notNull().default('purchase'),
    pricePaise: paise('price_paise').notNull().default(0),
    vendor: text('vendor').notNull().default(''),
    invoiceNo: text('invoice_no').notNull().default(''),
    acquisitionId: uuid('acquisition_id').references(() => libraryAcquisitions.id, { onDelete: 'set null' }),
    withdrawnOn: date('withdrawn_on'),
    withdrawnReason: text('withdrawn_reason').notNull().default(''),
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('library_copies_book_idx').on(t.bookId, t.status)],
);

/** Borrowing rules by kind of member: loan period, how many books, fine per day, renewals and the deposit. */
export const libraryMemberCategories = pgTable('library_member_categories', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  /** student | staff | external | book_bank */
  kind: text('kind').notNull().default('student'),
  loanDays: smallint('loan_days').notNull().default(14),
  maxBooks: smallint('max_books').notNull().default(4),
  finePaisePerDay: integer('fine_paise_per_day').notNull().default(200),
  maxRenewals: smallint('max_renewals').notNull().default(2),
  canReserve: boolean('can_reserve').notNull().default(true),
  depositPaise: paise('deposit_paise').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
});

/** A library card: a student, a member of staff or an external reader (alumni, researcher), with its deposit. */
export const libraryMembers = pgTable('library_members', {
  id: id(),
  tenantId: tenantId(),
  cardNo: text('card_no').notNull(),
  /** student | staff | external */
  kind: text('kind').notNull().default('student'),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  fullName: text('full_name').notNull(),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  organisation: text('organisation').notNull().default(''),
  categoryId: uuid('category_id').references(() => libraryMemberCategories.id),
  /** active | blocked | expired | left */
  status: text('status').notNull().default('active'),
  validUntil: date('valid_until'),
  depositPaise: paise('deposit_paise').notNull().default(0),
  depositPaidOn: date('deposit_paid_on'),
  depositRefundedOn: date('deposit_refunded_on'),
  depositReceipt: text('deposit_receipt').notNull().default(''),
  blockedReason: text('blocked_reason').notNull().default(''),
  cardReissues: smallint('card_reissues').notNull().default(0),
  note: text('note').notNull().default(''),
  createdAt: createdAt(),
});

/** A request to forgive part or all of a fine; the librarian in charge (or the principal) decides. */
export const libraryFineWaivers = pgTable('library_fine_waivers', {
  id: id(),
  tenantId: tenantId(),
  loanId: uuid('loan_id').notNull().references(() => libraryLoans.id, { onDelete: 'cascade' }),
  amountPaise: paise('amount_paise').notNull(),
  reason: text('reason').notNull(),
  /** pending | approved | rejected */
  status: text('status').notNull().default('pending'),
  requestedBy: by('requested_by'),
  decidedBy: by('decided_by'),
  decidedAt: ts('decided_at'),
  decisionNote: text('decision_note').notNull().default(''),
  createdAt: createdAt(),
});

/** A journal, magazine or newspaper subscription. */
export const libraryPeriodicals = pgTable('library_periodicals', {
  id: id(),
  tenantId: tenantId(),
  title: text('title').notNull(),
  issn: text('issn').notNull().default(''),
  publisher: text('publisher').notNull().default(''),
  /** journal | magazine | newspaper */
  kind: text('kind').notNull().default('journal'),
  /** daily | weekly | fortnightly | monthly | bimonthly | quarterly | halfyearly | annual */
  frequency: text('frequency').notNull().default('monthly'),
  language: text('language').notNull().default(''),
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
  vendor: text('vendor').notNull().default(''),
  subscriptionFrom: date('subscription_from'),
  subscriptionTo: date('subscription_to'),
  costPaise: paise('cost_paise').notNull().default(0),
  budgetId: uuid('budget_id').references(() => libraryBudgets.id, { onDelete: 'set null' }),
  /** active | cancelled */
  status: text('status').notNull().default('active'),
  createdAt: createdAt(),
});

/** One expected issue of a periodical: checked in when it arrives, claimed from the vendor when it does not. */
export const libraryPeriodicalIssues = pgTable(
  'library_periodical_issues',
  {
    id: id(),
    tenantId: tenantId(),
    periodicalId: uuid('periodical_id').notNull().references(() => libraryPeriodicals.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    expectedOn: date('expected_on').notNull(),
    receivedOn: date('received_on'),
    /** expected | received | missing | claimed | cancelled */
    status: text('status').notNull().default('expected'),
    claimedOn: date('claimed_on'),
    claimNote: text('claim_note').notNull().default(''),
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('library_periodical_issues_uq').on(t.periodicalId, t.label)],
);

/** The institutional repository: theses, papers, projects and question papers, open, campus-only or restricted. */
export const libraryRepository = pgTable('library_repository', {
  id: id(),
  tenantId: tenantId(),
  title: text('title').notNull(),
  authors: text('authors').notNull().default(''),
  /** thesis | dissertation | paper | project | question_paper | book_chapter | other */
  kind: text('kind').notNull().default('paper'),
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
  year: smallint('year'),
  abstract: text('abstract').notNull().default(''),
  keywords: text('keywords').notNull().default(''),
  url: text('url').notNull(),
  /** open | campus | restricted */
  access: text('access').notNull().default('campus'),
  /** draft | published | withdrawn */
  status: text('status').notNull().default('draft'),
  views: integer('views').notNull().default(0),
  createdBy: by('created_by'),
  createdAt: createdAt(),
});

export const libraryRepositoryAccess = pgTable('library_repository_access', {
  id: id(),
  tenantId: tenantId(),
  itemId: uuid('item_id').notNull().references(() => libraryRepository.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessedAt: ts('accessed_at').notNull().defaultNow(),
});

/** An inter-library loan, borrowed from or lent to another library (directly, through DELNET or N-LIST). */
export const libraryIll = pgTable('library_ill', {
  id: id(),
  tenantId: tenantId(),
  /** borrow | lend */
  direction: text('direction').notNull().default('borrow'),
  /** direct | delnet | nlist | other */
  network: text('network').notNull().default('direct'),
  partner: text('partner').notNull(),
  title: text('title').notNull(),
  author: text('author').notNull().default(''),
  isbn: text('isbn').notNull().default(''),
  memberId: uuid('member_id').references(() => libraryMembers.id, { onDelete: 'set null' }),
  requestedOn: date('requested_on').notNull(),
  dueOn: date('due_on'),
  /** requested | in_hand | returned | cancelled */
  status: text('status').notNull().default('requested'),
  chargePaise: paise('charge_paise').notNull().default(0),
  note: text('note').notNull().default(''),
  createdBy: by('created_by'),
  createdAt: createdAt(),
});

/** The gate register: who came in (a member by card, or a visitor), why, and when they left. */
export const libraryGateLog = pgTable(
  'library_gate_log',
  {
    id: id(),
    tenantId: tenantId(),
    memberId: uuid('member_id').references(() => libraryMembers.id, { onDelete: 'cascade' }),
    visitorName: text('visitor_name').notNull().default(''),
    /** reading | borrow | reference | eresources | other */
    purpose: text('purpose').notNull().default('reading'),
    branchId: uuid('branch_id').references(() => libraryBranches.id, { onDelete: 'set null' }),
    inAt: ts('in_at').notNull(),
    outAt: ts('out_at'),
    recordedBy: by('recorded_by'),
    createdAt: createdAt(),
  },
  (t) => [index('library_gate_log_in_idx').on(t.tenantId, t.inAt)],
);

/** Someone who wants to hear about new arrivals (on topics, or everything). */
export const libraryAlertSubscriptions = pgTable('library_alert_subscriptions', {
  id: id(),
  tenantId: tenantId(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  topics: text('topics').notNull().default(''),
  lastSentAt: ts('last_sent_at'),
  createdAt: createdAt(),
});

/** A no-dues clearance the library gave a member (for a transfer certificate or leaving). */
export const libraryClearances = pgTable('library_clearances', {
  id: id(),
  tenantId: tenantId(),
  memberId: uuid('member_id').notNull().references(() => libraryMembers.id, { onDelete: 'cascade' }),
  purpose: text('purpose').notNull().default('exit'),
  note: text('note').notNull().default(''),
  issuedBy: by('issued_by'),
  createdAt: createdAt(),
});

// ---- Hostel (0169) ------------------------------------------------------------------------------------

/** A hostel building group: blocks belong to it; gender and the terms (years) it takes are rules on allotment. */
export const hostels = pgTable('hostels', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  code: text('code').notNull().default(''),
  /** boys | girls | mixed */
  gender: text('gender').notNull().default('mixed'),
  address: text('address').notNull().default(''),
  wardenUserId: by('warden_user_id'),
  phone: text('phone').notNull().default(''),
  allowedTerms: smallint('allowed_terms').array().notNull().default(sql`'{}'::smallint[]`),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
});

export const hostelRoomTypes = pgTable('hostel_room_types', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  bedsPerRoom: smallint('beds_per_room').notNull().default(2),
  ac: boolean('ac').notNull().default(false),
  attachedBath: boolean('attached_bath').notNull().default(false),
  /** The monthly room fee for this type. */
  feePaise: paise('fee_paise').notNull().default(0),
  description: text('description').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
});

/** A student's application for a hostel seat, ranked by the allotment rules (distance, merit, seniority). */
export const hostelApplications = pgTable('hostel_applications', {
  id: id(),
  tenantId: tenantId(),
  number: text('number').notNull(),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  hostelId: uuid('hostel_id').references(() => hostels.id, { onDelete: 'set null' }),
  roomTypeId: uuid('room_type_id').references(() => hostelRoomTypes.id, { onDelete: 'set null' }),
  /** male | female | other ('' = not given) */
  gender: text('gender').notNull().default(''),
  distanceKm: numeric('distance_km', { precision: 7, scale: 1, mode: 'number' }),
  meritScore: numeric('merit_score', { precision: 6, scale: 2, mode: 'number' }),
  category: text('category').notNull().default('general'),
  needs: text('needs').notNull().default(''),
  /** applied | approved | waitlisted | allotted | rejected | withdrawn */
  status: text('status').notNull().default('applied'),
  priority: numeric('priority', { precision: 8, scale: 2, mode: 'number' }).notNull().default(0),
  decidedBy: by('decided_by'),
  decidedAt: ts('decided_at'),
  decisionNote: text('decision_note').notNull().default(''),
  allotmentId: uuid('allotment_id').references(() => hostelAllotments.id, { onDelete: 'set null' }),
  createdBy: by('created_by'),
  createdAt: createdAt(),
});

/** A bed kept for someone: a reservation before arrival, or a resident's bed during an internship. */
export const hostelBedHolds = pgTable('hostel_bed_holds', {
  id: id(),
  tenantId: tenantId(),
  bedId: uuid('bed_id').notNull().references(() => hostelBeds.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
  /** reservation | internship | maintenance */
  reason: text('reason').notNull().default('reservation'),
  fromOn: date('from_on').notNull(),
  untilOn: date('until_on').notNull(),
  /** active | released | converted */
  status: text('status').notNull().default('active'),
  note: text('note').notNull().default(''),
  createdBy: by('created_by'),
  createdAt: createdAt(),
});

/** A resident asks to change room or to vacate; the warden approves or rejects. */
export const hostelRequests = pgTable('hostel_requests', {
  id: id(),
  tenantId: tenantId(),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  /** change | vacate */
  kind: text('kind').notNull(),
  roomTypeId: uuid('room_type_id').references(() => hostelRoomTypes.id, { onDelete: 'set null' }),
  bedId: uuid('bed_id').references(() => hostelBeds.id, { onDelete: 'set null' }),
  reason: text('reason').notNull(),
  effectiveOn: date('effective_on').notNull(),
  /** pending | approved | rejected | cancelled */
  status: text('status').notNull().default('pending'),
  decidedBy: by('decided_by'),
  decidedAt: ts('decided_at'),
  decisionNote: text('decision_note').notNull().default(''),
  createdBy: by('created_by'),
  createdAt: createdAt(),
});

/** A caution deposit: held while the student lives in, refunded on vacating net of damages. */
export const hostelDeposits = pgTable('hostel_deposits', {
  id: id(),
  tenantId: tenantId(),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  allotmentId: uuid('allotment_id').references(() => hostelAllotments.id, { onDelete: 'set null' }),
  amountPaise: paise('amount_paise').notNull(),
  collectedOn: date('collected_on').notNull(),
  /** cash | online | fee_invoice */
  mode: text('mode').notNull().default('cash'),
  receiptNo: text('receipt_no').notNull().default(''),
  /** held | refunded | forfeited */
  status: text('status').notNull().default('held'),
  damagesPaise: paise('damages_paise').notNull().default(0),
  refundedPaise: paise('refunded_paise').notNull().default(0),
  refundedOn: date('refunded_on'),
  note: text('note').notNull().default(''),
  createdBy: by('created_by'),
  createdAt: createdAt(),
});

/** What a resident gets back on vacating: the unused part of the month's room fee and the deposit, less damages and dues. */
export const hostelSettlements = pgTable('hostel_settlements', {
  id: id(),
  tenantId: tenantId(),
  allotmentId: uuid('allotment_id').notNull().references(() => hostelAllotments.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  vacatedOn: date('vacated_on').notNull(),
  monthlyFeePaise: paise('monthly_fee_paise').notNull().default(0),
  daysUsed: integer('days_used').notNull().default(0),
  daysInMonth: integer('days_in_month').notNull().default(30),
  prorataRefundPaise: paise('prorata_refund_paise').notNull().default(0),
  depositPaise: paise('deposit_paise').notNull().default(0),
  damagesPaise: paise('damages_paise').notNull().default(0),
  duesPaise: paise('dues_paise').notNull().default(0),
  netRefundPaise: paise('net_refund_paise').notNull().default(0),
  /** pending | paid */
  status: text('status').notNull().default('pending'),
  paidOn: date('paid_on'),
  reference: text('reference').notNull().default(''),
  note: text('note').notNull().default(''),
  createdBy: by('created_by'),
  createdAt: createdAt(),
});

/** Wardens, resident tutors and security assigned to a hostel. */
export const hostelStaff = pgTable('hostel_staff', {
  id: id(),
  tenantId: tenantId(),
  hostelId: uuid('hostel_id').notNull().references(() => hostels.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** warden | resident_tutor | security | caretaker | matron */
  role: text('role').notNull().default('warden'),
  fromOn: date('from_on').notNull(),
  untilOn: date('until_on'),
  phone: text('phone').notNull().default(''),
  createdAt: createdAt(),
});

/** The duty roster: who is on duty in which hostel, on which day and shift. */
export const hostelDuties = pgTable(
  'hostel_duties',
  {
    id: id(),
    tenantId: tenantId(),
    hostelId: uuid('hostel_id').notNull().references(() => hostels.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    dutyOn: date('duty_on').notNull(),
    /** morning | evening | night */
    shift: text('shift').notNull().default('night'),
    /** scheduled | done | missed */
    status: text('status').notNull().default('scheduled'),
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('hostel_duties_uq').on(t.userId, t.dutyOn, t.shift)],
);

/** A stay in the sick bay, written to the student's health record; the family is told. */
export const hostelSickbay = pgTable('hostel_sickbay', {
  id: id(),
  tenantId: tenantId(),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  healthVisitId: uuid('health_visit_id').references(() => healthVisits.id, { onDelete: 'set null' }),
  admittedAt: ts('admitted_at').notNull(),
  dischargedAt: ts('discharged_at'),
  symptoms: text('symptoms').notNull(),
  treatment: text('treatment').notNull().default(''),
  referredTo: text('referred_to').notNull().default(''),
  parentAlerted: boolean('parent_alerted').notNull().default(false),
  recordedBy: by('recorded_by'),
  createdAt: createdAt(),
});

/** A resident who came back after curfew; repeated late entries are escalated to the family and the discipline register. */
export const hostelLateEntries = pgTable(
  'hostel_late_entries',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    enteredAt: ts('entered_at').notNull(),
    minutesLate: integer('minutes_late').notNull().default(0),
    reason: text('reason').notNull().default(''),
    gatePassId: uuid('gate_pass_id').references(() => hostelGatePasses.id, { onDelete: 'set null' }),
    escalated: boolean('escalated').notNull().default(false),
    recordedBy: by('recorded_by'),
    createdAt: createdAt(),
  },
  (t) => [index('hostel_late_entries_student_idx').on(t.studentId, t.enteredAt)],
);

/** The hostel discipline register: what happened, what was done, and any fine (charged through fees). */
export const hostelIncidents = pgTable('hostel_incidents', {
  id: id(),
  tenantId: tenantId(),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  occurredOn: date('occurred_on').notNull(),
  /** ragging | damage | misconduct | late_entry | substance | other */
  kind: text('kind').notNull().default('misconduct'),
  description: text('description').notNull(),
  actionTaken: text('action_taken').notNull().default(''),
  finePaise: paise('fine_paise').notNull().default(0),
  fineChargedTitle: text('fine_charged_title'),
  /** open | closed */
  status: text('status').notNull().default('open'),
  recordedBy: by('recorded_by'),
  createdAt: createdAt(),
});

/** Furniture and fittings in a room, linked to the asset register or the store's items. */
export const hostelRoomAssets = pgTable('hostel_room_assets', {
  id: id(),
  tenantId: tenantId(),
  roomId: uuid('room_id').notNull().references(() => hostelRooms.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
  invItemId: uuid('inv_item_id').references(() => invItems.id, { onDelete: 'set null' }),
  quantity: integer('quantity').notNull().default(1),
  /** good | damaged | missing */
  condition: text('condition').notNull().default('good'),
  checkedOn: date('checked_on'),
  note: text('note').notNull().default(''),
  createdAt: createdAt(),
});

/** Days a resident is away from the mess; approved leave of at least the plan's minimum earns a rebate. */
export const messLeaves = pgTable('mess_leaves', {
  id: id(),
  tenantId: tenantId(),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  fromOn: date('from_on').notNull(),
  toOn: date('to_on').notNull(),
  reason: text('reason').notNull().default(''),
  /** pending | approved | rejected */
  status: text('status').notNull().default('pending'),
  decidedBy: by('decided_by'),
  decidedAt: ts('decided_at'),
  createdBy: by('created_by'),
  createdAt: createdAt(),
});

/** A resident's mess bill for a month: days on the plan, leave rebated, and what is charged. */
export const messBills = pgTable(
  'mess_bills',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').references(() => messPlans.id, { onDelete: 'set null' }),
    month: text('month').notNull(),
    days: integer('days').notNull(),
    leaveDays: integer('leave_days').notNull().default(0),
    rebateDays: integer('rebate_days').notNull().default(0),
    grossPaise: paise('gross_paise').notNull(),
    rebatePaise: paise('rebate_paise').notNull().default(0),
    netPaise: paise('net_paise').notNull(),
    /** draft | charged */
    status: text('status').notNull().default('draft'),
    chargedTitle: text('charged_title'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('mess_bills_uq').on(t.studentId, t.month)],
);

// ---- Transport (0170) ---------------------------------------------------------------------------------

/** A family asks to move their child to another route or stop; the difference in fee is charged from the effective day. */
export const transportChangeRequests = pgTable('transport_change_requests', {
  id: id(),
  tenantId: tenantId(),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  fromRouteId: uuid('from_route_id').references(() => transportRoutes.id, { onDelete: 'set null' }),
  fromStopId: uuid('from_stop_id').references(() => transportStops.id, { onDelete: 'set null' }),
  toRouteId: uuid('to_route_id').notNull().references(() => transportRoutes.id, { onDelete: 'cascade' }),
  toStopId: uuid('to_stop_id').notNull().references(() => transportStops.id, { onDelete: 'cascade' }),
  effectiveOn: date('effective_on').notNull(),
  reason: text('reason').notNull(),
  /** pending | approved | rejected | cancelled */
  status: text('status').notNull().default('pending'),
  feeDeltaPaise: paise('fee_delta_paise').notNull().default(0),
  decidedBy: by('decided_by'),
  decidedAt: ts('decided_at'),
  decisionNote: text('decision_note').notNull().default(''),
  requestedBy: by('requested_by'),
  createdAt: createdAt(),
});

/** The maintenance schedule: a service, tyres or a renewal due by date or kilometres, and when it was done. */
export const transportMaintenance = pgTable('transport_maintenance', {
  id: id(),
  tenantId: tenantId(),
  vehicleId: uuid('vehicle_id').notNull().references(() => transportVehicles.id, { onDelete: 'cascade' }),
  /** service | tyres | battery | brakes | insurance_renewal | fitness | permit | other */
  kind: text('kind').notNull().default('service'),
  dueOn: date('due_on'),
  dueKm: integer('due_km'),
  doneOn: date('done_on'),
  odometerKm: integer('odometer_km'),
  costPaise: paise('cost_paise').notNull().default(0),
  vendor: text('vendor').notNull().default(''),
  note: text('note').notNull().default(''),
  /** scheduled | done | cancelled */
  status: text('status').notNull().default('scheduled'),
  createdAt: createdAt(),
});

/** A temporary change to a route (exam day timings, an event, a breakdown's substitute vehicle, a cancellation). */
export const transportRouteOverrides = pgTable('transport_route_overrides', {
  id: id(),
  tenantId: tenantId(),
  routeId: uuid('route_id').notNull().references(() => transportRoutes.id, { onDelete: 'cascade' }),
  fromOn: date('from_on').notNull(),
  untilOn: date('until_on').notNull(),
  /** timing | vehicle | driver | cancelled */
  kind: text('kind').notNull().default('timing'),
  substituteVehicleId: uuid('substitute_vehicle_id').references(() => transportVehicles.id, { onDelete: 'set null' }),
  substituteDriverId: uuid('substitute_driver_id').references(() => transportDrivers.id, { onDelete: 'set null' }),
  shiftMinutes: integer('shift_minutes').notNull().default(0),
  reason: text('reason').notNull(),
  notifiedAt: ts('notified_at'),
  createdBy: by('created_by'),
  createdAt: createdAt(),
});

/** Someone allowed to receive a child at the stop. */
export const transportPickupPersons = pgTable('transport_pickup_persons', {
  id: id(),
  tenantId: tenantId(),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  relation: text('relation').notNull().default(''),
  phone: text('phone').notNull().default(''),
  idProof: text('id_proof').notNull().default(''),
  photoUrl: text('photo_url').notNull().default(''),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

/** A child handed over at the stop: by a one-time code sent to the family, or to an authorised person seen in their photo. */
export const transportHandovers = pgTable('transport_handovers', {
  id: id(),
  tenantId: tenantId(),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  tripId: uuid('trip_id').references(() => transportTrips.id, { onDelete: 'set null' }),
  personId: uuid('person_id').references(() => transportPickupPersons.id, { onDelete: 'set null' }),
  /** otp | photo */
  method: text('method').notNull().default('otp'),
  otpHash: text('otp_hash'),
  otpExpiresAt: ts('otp_expires_at'),
  attempts: integer('attempts').notNull().default(0),
  /** pending | done | refused */
  status: text('status').notNull().default('pending'),
  handedAt: ts('handed_at'),
  note: text('note').notNull().default(''),
  recordedBy: by('recorded_by'),
  createdAt: createdAt(),
});

/** A driver's day: present, absent or on leave, and the spare driver covering the route. */
export const transportDriverDuty = pgTable(
  'transport_driver_duty',
  {
    id: id(),
    tenantId: tenantId(),
    driverId: uuid('driver_id').notNull().references(() => transportDrivers.id, { onDelete: 'cascade' }),
    dutyOn: date('duty_on').notNull(),
    routeId: uuid('route_id').references(() => transportRoutes.id, { onDelete: 'set null' }),
    /** present | absent | leave */
    status: text('status').notNull().default('present'),
    substituteDriverId: uuid('substitute_driver_id').references(() => transportDrivers.id, { onDelete: 'set null' }),
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('transport_driver_duty_uq').on(t.driverId, t.dutyOn)],
);
