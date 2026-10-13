/**
 * Samples for the admissions and campus-operations depth layer (migration 0135): module settings with Soundarya's own
 * rules and numbering series, and last term's library stock verification with a small shortfall.
 */
import type { Ctx } from './ctx.js';
import { INST } from './data.js';
import { J } from './kit.js';

export async function campusOpsDepth(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const principal = c.byEmail.principal.id;
  const lib = c.byEmail.library.id;
  const series = (prefix: string, pad = 5) => ({ prefix, pad, suffix: '' });
  await k.ins(
    'module_settings',
    [
      { module: 'admissions', settings: J({ rules: { documentsBeforeOffer: true, interviewRequired: true, offerValidDays: 10, admissionFeeBeforeEnrolment: true }, templates: { offerLetter: `Dear {name}, ${INST.name} is pleased to offer you a seat in {program}. Please pay the admission fee by {due}.`, rejectionNote: `Thank you for applying to ${INST.name}. We are unable to offer you a seat this year.` }, defaults: { counsellorFollowUpDays: 2, enquirySource: 'walk_in' } }), numbering: J({}), updatedBy: principal },
      { module: 'library', settings: J({ rules: { loanDays: 14, finePaisePerDay: 200, maxRenewals: 2, maxBooksPerStudent: 4, holdDays: 3 }, templates: { overdueReminder: `{name}, "{title}" was due on {due}. Please return it to the ${INST.name} library.` }, defaults: { stockCheckScope: 'all' } }), numbering: J({ LSC: series('LSV/{FY}/', 3) }), updatedBy: lib },
      { module: 'hostel', settings: J({ rules: { outpassNeedsApproval: true, curfew: '20:30', maxLeaveDays: 5, parentNotifiedOnOut: true }, templates: { outpassSlip: 'Out-pass for {name} ({room}) to {destination}, back by {back}.' }, defaults: { messPlan: '', vacateNoticeDays: 15 } }), numbering: J({}), updatedBy: principal },
      { module: 'procurement', settings: J({ rules: { quotesRequiredAbovePaise: 2500000, minQuotes: 3, invoiceTolerancePaise: 100, approvalAbovePaise: 0 }, templates: { purchaseOrderTerms: `Deliver to ${INST.name} stores within {days} days. Payment 30 days from a matched invoice.` }, defaults: { paymentTermsDays: 30, deliveryDays: 15 } }), numbering: J({ REQ: series('IND/{FY}/'), RFQ: series('RFQ/{FY}/'), PO: series('SIMS/PO/{FY}/') }), updatedBy: principal },
    ],
    { returning: false },
  );
  // Last term's verification: every title checked, three copies not found on the shelf.
  const books = (await k.q('select id, title, copies from library_books where tenant_id = $1 order by title limit 50', [c.tenantId])) as unknown as { id: string; title: string; copies: number }[];
  if (!books.length) return;
  const short = new Set(books.slice(0, 3).map((b) => b.id));
  const [check] = await k.ins<{ id: string }>('library_stock_checks', [
    {
      number: 'LSV/2025-26/001',
      status: 'closed',
      note: 'Annual stock verification before the odd semester',
      startedBy: lib,
      closedBy: lib,
      closedAt: new Date(`${c.today}T10:00:00+05:30`),
      summary: J({ titles: books.length, expected: books.reduce((s, b) => s + b.copies, 0), found: books.reduce((s, b) => s + b.copies, 0) - 3, missingTitles: 3, missing: books.slice(0, 3).map((b) => ({ bookId: b.id, title: b.title, expected: b.copies, found: b.copies - 1, short: 1 })) }),
    },
  ]);
  await k.ins('library_stock_check_items', books.map((b) => ({ checkId: check.id, bookId: b.id, found: short.has(b.id) ? b.copies - 1 : b.copies, scannedBy: lib })), { returning: false });
  await k.q("insert into doc_counters (tenant_id, kind, last_no) values ($1, 'LSC', 1) on conflict (tenant_id, kind) do update set last_no = greatest(doc_counters.last_no, 1)", [c.tenantId]);
}
