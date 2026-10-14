// Shapes of the stores, procurement, assets and facilities API (services/api/src/inventory) the ERP reads.

export interface Approval {
  id: string;
  step: string;
  decision: 'approved' | 'rejected';
  note: string | null;
  budgetOverride: boolean;
  by: string | null;
  createdAt: string;
}

export interface Budget {
  fiscalYear: string;
  budgetPaise: number;
  spentPaise: number;
  committedPaise: number;
  availablePaise: number;
}

export interface IndentDetail {
  id: string;
  number: string;
  reason: string;
  status: 'submitted' | 'approved' | 'rejected' | 'ordered';
  step: 'hod' | 'principal' | null;
  departmentId: string | null;
  department: string | null;
  requester: string | null;
  requestedBy: string;
  estimatedPaise: number;
  budgetStatus: string | null;
  neededBy: string | null;
  decisionNote: string | null;
  createdAt: string;
  steps: ('hod' | 'principal')[];
  lines: { id: string; itemId: string; sku: string; item: string; unit: string; qty: number; estUnitPaise: number }[];
  approvals: Approval[];
  budget: Budget | null;
  orders: { id: string; number: string; status: string; totalPaise: number }[];
  canDecide: boolean;
}

export interface PoDetail {
  id: string;
  number: string;
  status: string;
  approvalStatus: 'not_required' | 'pending' | 'approved' | 'rejected';
  purchaseMode: string;
  gemRef: string | null;
  tenderRef: string | null;
  totalPaise: number;
  vendorId: string;
  vendor: string;
  storeId: string;
  store: string;
  department: string | null;
  requisitionId: string | null;
  requisition: string | null;
  createdBy: string;
  createdAt: string;
  amendmentNo: number;
  deliveryBy: string | null;
  terms: string;
  committeeMinutes: string | null;
  committeeMetOn: string | null;
  committeeMembers: string | null;
  cancelReason: string | null;
  lines: { id: string; itemId: string; item: string; unit: string; qty: number; unitPricePaise: number; receivedQty: number }[];
  receipts: { id: string; number: string | null; challanNo: string | null; note: string; receivedAt: string; lines: { poLineId: string; qty: number; rejectedQty: number; rejectReason: string | null }[] }[];
  invoices: { id: string; invoiceNo: string; invoiceDate: string | null; amountPaise: number; expectedPaise: number; status: string; note: string | null; voucherNo: string | null; paidOn: string | null; paymentMode: string | null; paymentRef: string | null; debitPaise: number }[];
  debitNotes: { id: string; number: string; amountPaise: number; reason: string; status: string; createdAt: string }[];
  amendments: { id: string; amendmentNo: number; reason: string; by: string | null; createdAt: string; before: { totalPaise: number }; after: { totalPaise: number } }[];
  approvals: Approval[];
}

export interface VendorProfile {
  id: string;
  name: string;
  gstin: string | null;
  pan: string | null;
  contactPerson: string;
  phone: string;
  email: string | null;
  address: string;
  active: boolean;
  blacklisted: boolean;
  blacklistReason: string | null;
  score: number | null;
  ratings: { id: string; quality: number; delivery: number; price: number; note: string; by: string | null; po: string | null; createdAt: string }[];
  orders: { id: string; number: string; status: string; totalPaise: number; createdAt: string }[];
  categories: { id: string; name: string }[];
  contracts: { id: string; item: string; sku: string; ratePaise: number; validFrom: string; validTo: string; reference: string; active: boolean }[];
  debitNotes: { id: string; number: string; amountPaise: number; reason: string; status: string; createdAt: string }[];
}

export interface Verification {
  id: string;
  number: string;
  storeId: string;
  store: string;
  fiscalYear: string;
  status: 'open' | 'closed';
  note: string;
  closedAt: string | null;
  createdAt: string;
  lines: { id: string; itemId: string; sku: string; item: string; unit: string; bookQty: number; countedQty: number | null; remark: string; variance: number | null; varianceValuePaise: number | null }[];
  summary: { items: number; counted: number; short: number; excess: number; varianceValuePaise: number };
}

export interface Category {
  id: string;
  name: string;
  vendors: { id: string; name: string }[];
}

export interface Option {
  value: string;
  label: string;
}

export interface TicketSummary {
  total: number;
  open: number;
  breached: number;
  atRisk: number;
  metPct: number | null;
  avgResolveHours: number | null;
  avgRating: number | null;
}

export interface RoomDay {
  room: { id: string; name: string };
  date: string;
  bookings: { id: string; number: string; title: string; startsAt: string; endsAt: string; status: string }[];
  classes: { id: string; startsAt: string; endsAt: string; section: string; subject: string }[];
}

/** Status words of the procurement documents to a tone for pills. */
export function statusTone(s: string): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (['approved', 'received', 'paid', 'matched', 'closed', 'returned', 'resolved', 'met', 'written_off', 'within'].includes(s)) return 'success';
  if (['submitted', 'pending', 'pending_approval', 'partially_received', 'open', 'at_risk', 'proposed', 'assigned', 'in_progress'].includes(s)) return 'warning';
  if (['rejected', 'cancelled', 'mismatch', 'breached', 'exceeded', 'overdue', 'blacklisted'].includes(s)) return 'danger';
  if (['issued', 'on_track', 'ordered'].includes(s)) return 'info';
  return 'neutral';
}
